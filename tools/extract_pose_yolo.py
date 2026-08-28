#!/usr/bin/env python3
"""用 YOLOv8-Pose + BoT-SORT 提取双人骨骼时序。

为什么不用 MediaPipe：MediaPipe 的 BlazePose 本质是单人模型，在佩剑双人
对抗画面上大量帧只检出一人（实测 520 帧里有 357 帧漏检另一方）。时序判罚
最怕的就是身份缺失和身份互换，因此离线预处理改用原生多人的 YOLOv8-Pose，
并由 BoT-SORT 维持跨帧 track id（与开题报告的 DeepSORT 属同类方法的更新版）。

YOLOv8-Pose 直接输出 COCO-17 关键点，与前端 JointName 一一对应，无需重映射。

用法:
    python tools/extract_pose_yolo.py <video> -o out.json
    python tools/extract_pose_yolo.py --batch tools/dataset_manifest.json -o public/tracks
"""

from __future__ import annotations

import os
import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

COCO_NAMES = [
    "nose", "left_eye", "right_eye", "left_ear", "right_ear",
    "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
    "left_wrist", "right_wrist", "left_hip", "right_hip",
    "left_knee", "right_knee", "left_ankle", "right_ankle",
]

# 权重位置：优先读环境变量 POSE_WEIGHTS，其次找工作目录与 models/。
# 不写死任何人的本机路径——别人 clone 下来照样能跑，
# 也不必把自己的目录结构写进公开仓库。
WEIGHT_CANDIDATES = [
    *( [Path(os.environ["POSE_WEIGHTS"])] if os.environ.get("POSE_WEIGHTS") else [] ),
    Path("yolov8l-pose.pt"),
    Path("yolov8s-pose.pt"),
    Path("models/yolov8l-pose.pt"),
    Path("models/yolov8s-pose.pt"),
]


def find_weights(explicit: str | None) -> Path:
    if explicit:
        p = Path(explicit)
        if p.exists():
            return p
        sys.exit(f"找不到权重: {p}")
    for p in WEIGHT_CANDIDATES:
        if p.exists():
            return p
    sys.exit("找不到 YOLOv8-Pose 权重，请用 --weights 指定")


def probe_pts(video: Path) -> list[float]:
    """读取每一帧的真实显示时间戳（秒）。

    这一步不是可选的优化，而是正确性的前提。素材是手机录屏的电视转播，
    普遍为可变帧率：实测一段 282 帧的素材，帧间隔在 13–117ms 之间跳动，
    标准差 14ms。若按「帧号 ÷ 平均帧率」推算时间，中位误差 267ms、
    最大误差 560ms——而本系统判定「同时」的阈值只有 40ms。
    也就是说，不用真实 PTS，所有毫秒数都是错的。
    """
    try:
        r = subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "v:0",
             "-show_entries", "frame=pts_time", "-of", "csv=p=0", str(video)],
            capture_output=True, text=True, timeout=180)
        out: list[float] = []
        for line in r.stdout.splitlines():
            line = line.strip().rstrip(",")
            if not line or line == "N/A":
                continue
            try:
                out.append(float(line))
            except ValueError:
                continue
        if out:
            base = out[0]
            out = [t - base for t in out]
            for i in range(1, len(out)):
                if out[i] < out[i - 1]:
                    out[i] = out[i - 1]
        return out
    except Exception:
        return []


def nominal_fps(video: Path, pts: list[float]) -> float | None:
    """标称帧率，仅用于显示与滤波窗口换算；时间一律以 PTS 为准。"""
    if len(pts) > 1 and pts[-1] > 0:
        return len(pts) / pts[-1]
    try:
        r = subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "v:0",
             "-show_entries", "stream=avg_frame_rate", "-of", "csv=p=0", str(video)],
            capture_output=True, text=True, timeout=20)
        num, den = r.stdout.strip().split("/")
        v = float(num) / float(den)
        return v if 1 < v < 1000 else None
    except Exception:
        return None


def person_entry(kps: np.ndarray, conf: np.ndarray) -> dict:
    return {
        name: {"x": round(float(kps[i][0]), 2),
               "y": round(float(kps[i][1]), 2),
               "c": round(float(conf[i]), 3)}
        for i, name in enumerate(COCO_NAMES)
    }


def _d2(a, b) -> float:
    return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2


def torso_of(entry: dict):
    pts = [entry[k] for k in ("left_shoulder", "right_shoulder", "left_hip", "right_hip")
           if entry[k]["c"] > 0.25]
    if len(pts) < 2:
        return None
    return (sum(p["x"] for p in pts) / len(pts), sum(p["y"] for p in pts) / len(pts))


def pick_device(explicit: str | None) -> str:
    """Apple Silicon 上 MPS 比 CPU 快数倍。批量处理 131 段素材时，
    这个差别是「两小时」和「一整天」的区别。"""
    if explicit:
        return explicit
    try:
        import torch

        if torch.backends.mps.is_available():
            return "mps"
        if torch.cuda.is_available():
            return "0"
    except Exception:
        pass
    return "cpu"


def extract(video: Path, weights: Path, max_frames: int | None = None,
            imgsz: int = 640, conf: float = 0.35, device: str | None = None) -> dict:
    from ultralytics import YOLO

    dev = pick_device(device)
    model = YOLO(str(weights))
    cap = cv2.VideoCapture(str(video))
    if not cap.isOpened():
        raise RuntimeError(f"无法打开视频: {video}")
    pts = probe_pts(video)
    fps = nominal_fps(video, pts) or cap.get(cv2.CAP_PROP_FPS) or 30.0
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    cap.release()

    frames: list[dict] = []
    # track_id -> 该 id 在整段中的累计面积，用来挑出「真正的两名选手」
    id_weight: dict[int, float] = {}
    per_frame: list[dict[int, dict]] = []

    stream = model.track(
        source=str(video), stream=True, persist=True, tracker="botsort.yaml",
        classes=[0], conf=conf, imgsz=imgsz, verbose=False, device=dev,
    )

    for idx, res in enumerate(stream):
        if max_frames and idx >= max_frames:
            break
        detected: dict[int, dict] = {}
        kp = res.keypoints
        boxes = res.boxes
        if kp is not None and boxes is not None and kp.xy is not None and len(kp.xy):
            ids = boxes.id
            ids = ids.int().tolist() if ids is not None else list(range(len(kp.xy)))
            xywh = boxes.xywh.cpu().numpy()
            xy = kp.xy.cpu().numpy()
            kconf = (kp.conf.cpu().numpy() if kp.conf is not None
                     else np.ones((len(xy), len(COCO_NAMES))))
            for j, tid in enumerate(ids):
                if j >= len(xy):
                    continue
                area = float(xywh[j][2] * xywh[j][3])
                detected[tid] = {"entry": person_entry(xy[j], kconf[j]), "area": area}
                id_weight[tid] = id_weight.get(tid, 0.0) + area
        per_frame.append(detected)
        if (idx + 1) % 120 == 0:
            print(f"  {video.name}: {idx + 1}/{total} 帧", file=sys.stderr, flush=True)

    if not per_frame:
        raise RuntimeError("未读到任何帧")

    # 不能用「全片累计面积最大的两个 track id」来选主体：素材是电视转播录屏，
    # 镜头在全景 / 慢放特写 / 教练席之间反复切换，BoT-SORT 会把同一名选手拆成
    # 十几个 id（实测一段 367 帧的素材产生 18 个 id），跨镜头挑出来的两个 id
    # 几乎不在同一帧共存。改为逐帧选画面中最大的两个人体，再靠位置连续性
    # 维持左右身份；不合理的帧交给下游几何门控丢弃。
    both = 0
    prev = {"left": None, "right": None}
    for idx, detected in enumerate(per_frame):
        entry = {"frame": idx, "t": round(pts[idx] if idx < len(pts) else idx / fps, 4)}
        cands = sorted(detected.values(), key=lambda d: d["area"], reverse=True)[:2]
        cands = [c for c in cands if torso_of(c["entry"])]

        if len(cands) >= 2:
            a, b = cands[0], cands[1]
            ca, cb = torso_of(a["entry"]), torso_of(b["entry"])
            if prev["left"] is not None and prev["right"] is not None:
                # 比较两种配对的总位移，取小者，避免两人交错时身份互换
                direct = _d2(ca, prev["left"]) + _d2(cb, prev["right"])
                swapped = _d2(cb, prev["left"]) + _d2(ca, prev["right"])
                pair = (a, b) if direct <= swapped else (b, a)
            else:
                pair = (a, b) if ca[0] <= cb[0] else (b, a)
            entry["left"] = pair[0]["entry"]
            entry["right"] = pair[1]["entry"]
            prev = {"left": torso_of(pair[0]["entry"]), "right": torso_of(pair[1]["entry"])}
            both += 1
        elif len(cands) == 1:
            c = torso_of(cands[0]["entry"])
            side = "left"
            if prev["left"] is not None and prev["right"] is not None:
                side = "left" if _d2(c, prev["left"]) <= _d2(c, prev["right"]) else "right"
            entry[side] = cands[0]["entry"]
            prev[side] = c
        frames.append(entry)

    result = {
        "fps": round(fps, 3),
        "width": w,
        "height": h,
        "frames": frames,
        "extractor": f"yolov8-pose({weights.stem})+botsort@{dev}",
        "extractedAt": datetime.now(timezone.utc).isoformat(),
        "timebase": "pts" if len(pts) >= len(frames) else "nominal-fps",
        "quality": {
            "totalFrames": len(frames),
            "trackIds": len(id_weight),
            "ptsFrames": len(pts),
            "framesWithBothFencers": both,
            "bothCoverage": round(both / max(1, len(frames)), 3),
        },
    }

    from segment import find_segments

    segments, reasons = find_segments(result)
    result["segments"] = segments
    result["gateRejections"] = reasons
    q = result["quality"]
    q["validSegments"] = len(segments)
    q["validFrames"] = sum(s["frames"] for s in segments)
    q["validCoverage"] = round(q["validFrames"] / max(1, len(frames)), 3)
    return result


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video", nargs="?")
    ap.add_argument("-o", "--out")
    ap.add_argument("--weights")
    ap.add_argument("--batch")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--ids")
    ap.add_argument("--max-frames", type=int)
    ap.add_argument("--imgsz", type=int, default=640)
    ap.add_argument("--device", help="mps / cpu / 0")
    args = ap.parse_args()

    weights = find_weights(args.weights)
    print(f"权重: {weights}", file=sys.stderr)

    if args.batch:
        manifest = json.loads(Path(args.batch).read_text())
        outdir = Path(args.out or "public/tracks")
        outdir.mkdir(parents=True, exist_ok=True)
        items = manifest["items"]
        if args.ids:
            want = {s.strip() for s in args.ids.split(",")}
            items = [i for i in items if i["id"] in want]
        if args.limit:
            items = items[: args.limit]
        ok = 0
        for it in items:
            dest = outdir / f"{it['id']}.json"
            if dest.exists():
                print(f"skip {it['id']}", flush=True)
                continue
            try:
                track = extract(Path(it["abs"]), weights, args.max_frames, args.imgsz, device=args.device)
                dest.write_text(json.dumps(track, ensure_ascii=False, separators=(",", ":")))
                q = track["quality"]
                print(f"OK  {it['id']}  双人={q['bothCoverage']} "
                      f"有效段={q['validSegments']} ({q['validCoverage']})", flush=True)
                ok += 1
            except Exception as e:  # noqa: BLE001
                print(f"ERR {it['id']}: {e}", file=sys.stderr, flush=True)
        print(f"完成 {ok}/{len(items)}")
        return

    if not args.video:
        ap.error("需要 video 或 --batch")
    track = extract(Path(args.video), weights, args.max_frames, args.imgsz, device=args.device)
    out = Path(args.out or "track.json")
    out.write_text(json.dumps(track, ensure_ascii=False, separators=(",", ":")))
    q = track["quality"]
    print(f"{out}  帧数={q['totalFrames']}  轨迹数={q['trackIds']}  "
          f"双人={q['bothCoverage']}  有效段={q['validSegments']} ({q['validCoverage']})")
    for s in track["segments"]:
        print(f"    段 {s['start']}–{s['end']}  {s['seconds']}s  间距={s["meanSeparation"]}tl")


if __name__ == "__main__":
    main()
