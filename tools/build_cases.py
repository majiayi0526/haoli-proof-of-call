#!/usr/bin/env python3
"""生成前端所需的案例数据：压缩视频、缩略图、瘦身骨骼 JSON、案例清单。

选取策略：不是把 131 段全塞进仓库（那会有好几个 G），而是按判罚情境
分层挑选质量达标的代表案例内置回放；其余案例仍全量参与 benchmark 统计，
只是不带视频。证据地图里点到未内置的案例时会如实说明。

用法:
    python tools/build_cases.py [--per-scenario 2] [--max 14]
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "tools/dataset_manifest.json"
TRACKS_IN = ROOT / "data/tracks"
PUBLIC = ROOT / "public"

# 质量门槛：低于此值的案例做不出可信的演示，不内置
MIN_VALID_COVERAGE = 0.12
MIN_VALID_FRAMES = 24


def run(cmd: list[str]) -> bool:
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print(f"  ffmpeg 失败: {r.stderr.strip()[:200]}", file=sys.stderr)
    return r.returncode == 0


def transcode(src: Path, dst: Path) -> bool:
    """压到 720p / CRF 30，但必须逐帧、逐时间戳地保留原片。

    ⚠ 这里的 -fps_mode passthrough 不是可选项，是正确性的前提。

    素材是可变帧率的录屏。ffmpeg 默认会把 VFR 规整成 CFR：实测一段
    362 帧的素材转码后只剩 309 帧，且时间戳被重排成等间隔。而骨骼数据
    是按原片逐帧提取的——两者一旦不同步，画面上的骨骼叠加就会整体错位，
    「第几帧发生了什么」也就全错了。

    passthrough 保证输出帧数与每帧 PTS 与输入完全一致，
    只压画质、不动时间轴。
    """
    dst.parent.mkdir(parents=True, exist_ok=True)
    return run([
        "ffmpeg", "-v", "error", "-y", "-i", str(src),
        "-vf", "scale='min(1280,iw)':-2",
        "-c:v", "libx264", "-crf", "30", "-preset", "medium",
        "-fps_mode", "passthrough", "-copyts", "-start_at_zero",
        # MP4 默认时基精度不足，会把相邻帧的时间戳量化到同一个值
        # （实测出现重复 PTS），二分查找「当前该显示哪一帧」就会失准。
        # 90kHz 是 MPEG 系统时钟的常用时基，精度约 11 微秒，足够。
        "-video_track_timescale", "90000",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an",
        str(dst),
    ])


def thumbnail_at(src: Path, dst: Path, ts: float) -> bool:
    dst.parent.mkdir(parents=True, exist_ok=True)
    ts = max(0.0, ts)
    return run([
        "ffmpeg", "-v", "error", "-y", "-ss", f"{ts:.3f}", "-i", str(src),
        "-frames:v", "1", "-vf", "scale=480:-2", "-q:v", "5", str(dst),
    ])


def clip_pts(path: Path) -> list[float]:
    """读出转码后视频每一帧的显示时间戳。

    转码无法同时做到「压缩体积」和「逐帧保留原始高精度时间戳」：
    实测即便加了 fps_mode passthrough 与 90kHz 时基，输出仍被量化到
    约 28ms 的步长——而判定「同时」的阈值只有 40ms，这个精度不够用。

    因此不强求两者一致，而是分开存：
      · track['frames'][i]['t'] —— 原片的高精度 PTS，供分析与毫秒读数使用
      · track['clipPts'][i]     —— clip 的 PTS，供播放器 seek 与画面对齐使用
    两者通过帧序号一一对应（转码已保证帧数不变），
    于是分析精度不被转码拖累，骨骼叠加也不会和画面错位。
    """
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "frame=pts_time", "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, timeout=180)
    out: list[float] = []
    for line in r.stdout.split():
        v = line.strip().rstrip(",")
        try:
            out.append(float(v))
        except ValueError:
            continue
    if out:
        base = out[0]
        out = [round(t - base, 5) for t in out]
    return out


def peak_action_frame(track: dict, seg: dict | None) -> int:
    """挑一帧最能代表这次交锋的画面做封面。

    取有效段内「双方躯干中心水平移动速度之和」的峰值帧——那一刻正是
    双方同时扑向对方的瞬间，比取段中点更有代表性，案例库也更好看。
    """
    frames = track["frames"]
    lo = seg["start"] if seg else 0
    hi = seg["end"] if seg else len(frames) - 1
    lo, hi = max(0, lo), min(len(frames) - 1, hi)

    def cx(sk):
        pts = [sk[k] for k in ("left_shoulder", "right_shoulder", "left_hip", "right_hip")
               if k in sk and sk[k]["c"] > 0.25]
        return sum(p["x"] for p in pts) / len(pts) if pts else None

    best, best_e = (lo + hi) // 2, -1.0
    for i in range(lo + 1, hi):
        e = 0.0
        ok = True
        for side in ("left", "right"):
            a, b = frames[i - 1].get(side), frames[i].get(side)
            if not a or not b:
                ok = False
                break
            xa, xb = cx(a), cx(b)
            if xa is None or xb is None:
                ok = False
                break
            e += abs(xb - xa)
        if ok and e > best_e:
            best_e, best = e, i
    return best


def slim_track(track: dict) -> dict:
    """坐标保留 1 位小数、置信度 2 位。
    像素级的第二位小数对判罚没有意义，但能让文件小一半。"""
    for f in track["frames"]:
        for side in ("left", "right"):
            sk = f.get(side)
            if not sk:
                continue
            for j in sk.values():
                j["x"] = round(j["x"], 1)
                j["y"] = round(j["y"], 1)
                j["c"] = round(j["c"], 2)
    return track


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--per-scenario", type=int, default=2)
    ap.add_argument("--max", type=int, default=14)
    ap.add_argument("--include", help="逗号分隔的 case id，强制内置")
    args = ap.parse_args()

    manifest = json.loads(MANIFEST.read_text())
    by_id = {i["id"]: i for i in manifest["items"]}
    forced = {s.strip() for s in args.include.split(",")} if args.include else set()

    # 收集已提取且质量达标的候选
    candidates: list[tuple[dict, dict]] = []
    for tf in sorted(TRACKS_IN.glob("*.json")):
        cid = tf.stem
        meta = by_id.get(cid)
        if not meta:
            continue
        try:
            track = json.loads(tf.read_text())
        except Exception:
            continue
        q = track.get("quality", {})
        if cid not in forced and (
            q.get("validCoverage", 0) < MIN_VALID_COVERAGE
            or q.get("validFrames", 0) < MIN_VALID_FRAMES
        ):
            continue
        candidates.append((meta, track))

    # 按情境分层，情境内按有效帧占比降序
    candidates.sort(key=lambda mt: mt[1].get("quality", {}).get("validCoverage", 0), reverse=True)
    picked: list[tuple[dict, dict]] = []
    per: dict[str, int] = {}
    for meta, track in candidates:
        if meta["id"] in forced:
            picked.append((meta, track))
    for meta, track in candidates:
        if meta["id"] in forced:
            continue
        s = meta["scenario"]
        if per.get(s, 0) >= args.per_scenario:
            continue
        if len(picked) >= args.max:
            break
        per[s] = per.get(s, 0) + 1
        picked.append((meta, track))

    (PUBLIC / "clips").mkdir(parents=True, exist_ok=True)
    (PUBLIC / "thumbs").mkdir(parents=True, exist_ok=True)
    (PUBLIC / "tracks").mkdir(parents=True, exist_ok=True)

    cases = []
    for meta, track in picked:
        cid = meta["id"]
        src = Path(meta["abs"])
        if not src.exists():
            print(f"  跳过 {cid}：源视频不存在", file=sys.stderr)
            continue

        clip = PUBLIC / "clips" / f"{cid}.mp4"
        thumb = PUBLIC / "thumbs" / f"{cid}.jpg"

        if not clip.exists() and not transcode(src, clip):
            continue

        segs = sorted(track.get("segments") or [], key=lambda x: -x["frames"])
        key_frame = peak_action_frame(track, segs[0] if segs else None)
        # 缩略图按真实时间戳定位，素材是可变帧率，按帧率换算会抽错帧
        key_t = track["frames"][key_frame]["t"] if key_frame < len(track["frames"]) else 0
        if not thumb.exists():
            thumbnail_at(clip, thumb, key_t)

        # 播放器要用 clip 自己的时间戳定位，否则骨骼会和画面错位
        pts = clip_pts(clip)
        if len(pts) >= len(track["frames"]):
            track["clipPts"] = pts[: len(track["frames"])]
        else:
            print(f"  警告 {cid}: clip 帧数 {len(pts)} < track {len(track['frames'])}，"
                  f"播放定位回退到原片时间戳", file=sys.stderr)

        (PUBLIC / "tracks" / f"{cid}.json").write_text(
            json.dumps(slim_track(track), ensure_ascii=False, separators=(",", ":"))
        )

        verdict = meta["expertVerdict"]
        cases.append({
            "id": cid,
            "title": f"{meta['scenarioZh']} · {Path(meta['file']).stem}",
            "scenario": meta["scenario"],
            "scenarioZh": meta["scenarioZh"],
            "scenarioDesc": meta["scenarioDesc"],
            "expertVerdict": verdict if verdict in ("left", "right", "simultaneous") else "insufficient",
            "file": f"clips/{cid}.mp4",
            "fps": track.get("fps", meta["fps"]),
            "width": track.get("width", meta["width"]),
            "height": track.get("height", meta["height"]),
            "duration": meta["duration"],
            "frames": track.get("quality", {}).get("totalFrames", meta["frames"]),
            "slowMotion": meta["slowMotion"],
            "hasTrack": True,
        })
        size = clip.stat().st_size / 1e6
        print(f"OK  {cid}  clip={size:.1f}MB  有效帧占比={track['quality']['validCoverage']}")

    (PUBLIC / "cases.json").write_text(
        json.dumps({"cases": cases}, ensure_ascii=False, indent=2)
    )

    total = sum((PUBLIC / "clips" / f"{c['id']}.mp4").stat().st_size for c in cases) / 1e6
    print(f"\n内置 {len(cases)} 个案例，视频合计 {total:.1f} MB")
    print(f"候选 {len(candidates)} / 已提取 {len(list(TRACKS_IN.glob('*.json')))}")


if __name__ == "__main__":
    main()
