"""有效交锋段筛选。

真实素材（电视转播录屏）里混着慢放特写、教练镜头、观众镜头、画中画和
播放器 UI。姿态检测器不知道谁是选手，会把庆祝的教练也标出一副骨架。
如果不筛，「谁先启动」就会拿教练的手臂去和选手比——结论看起来很确定，
其实完全错。

═══ 关于尺度基准的一个击剑专项结论 ═══
体育视频分析的通行做法是用「肩宽」做尺度归一化。这在击剑上会直接失效：
实战姿势是侧身对敌，双肩在图像上前后重叠，肩宽投影只剩正面站姿的几分之一。
实测一段素材中同一名选手的肩宽在 12–63 px 之间抖动（5 倍），而躯干长度
（肩中点→髋中点）稳定在 70–99 px。因此本项目一律以躯干长度 tl 作为
尺度单位，而不是肩宽。

筛选依据是几何常识，不是机器学习：
  ① 画面里恰好两个人体，且都足够大（不是背景观众、不是画中画小图）
  ② 两人水平分离，间距落在击剑交锋距离的合理区间
  ③ 两人躯干尺度相近（同一景深，排除「前景特写 + 背景小人」）
  ④ 两人躯干中心高度相近（都站在剑道上，排除看台上的人）
  ⑤ 上述条件连续成立足够长时间
"""

from __future__ import annotations

import math
from dataclasses import dataclass

# 两人躯干中心水平间距，单位为躯干长度 tl。
# 实测有效交锋段落在 3.5–9 tl；放宽到 1.2–12 以容纳不同景别。
MIN_SEP_TL = 1.2
MAX_SEP_TL = 12.0
# 两人躯干长度之比，超出即认为不在同一景深
MAX_SCALE_RATIO = 1.6
# 两人躯干中心垂直偏差，单位 tl
MAX_VERTICAL_TL = 2.5
# 人体外接框高度占画面高度的最小比例，滤掉远处观众与画中画缩略图
MIN_HEIGHT_FRAC = 0.12
# 躯干长度的绝对下限（px），低于此说明关键点几乎不可用
MIN_TORSO_PX = 18.0


@dataclass(frozen=True)
class FrameGate:
    frame: int
    valid: bool
    reason: str
    separation: float = 0.0
    scale_ratio: float = 0.0


def _mid(sk: dict, a: str, b: str, min_c: float = 0.3):
    A, B = sk.get(a), sk.get(b)
    if not A or not B or A["c"] < min_c or B["c"] < min_c:
        return None
    return ((A["x"] + B["x"]) / 2, (A["y"] + B["y"]) / 2)


def torso_length(sk: dict) -> float:
    """肩中点到髋中点的距离。击剑侧身站位下唯一稳定的尺度基准。"""
    s = _mid(sk, "left_shoulder", "right_shoulder")
    h = _mid(sk, "left_hip", "right_hip")
    if not s or not h:
        return 0.0
    return math.hypot(s[0] - h[0], s[1] - h[1])


def torso_center(sk: dict):
    pts = [sk[k] for k in ("left_shoulder", "right_shoulder", "left_hip", "right_hip")
           if k in sk and sk[k]["c"] > 0.25]
    if len(pts) < 2:
        return None
    return (sum(p["x"] for p in pts) / len(pts), sum(p["y"] for p in pts) / len(pts))


def body_height(sk: dict) -> float:
    ys = [sk[k]["y"] for k in sk if sk[k]["c"] > 0.3]
    return (max(ys) - min(ys)) if len(ys) >= 4 else 0.0


def gate_frame(entry: dict, height: int) -> FrameGate:
    i = entry.get("frame", 0)
    if "left" not in entry or "right" not in entry:
        return FrameGate(i, False, "未同时检出两名选手")

    L, R = entry["left"], entry["right"]
    tlL, tlR = torso_length(L), torso_length(R)
    if tlL < MIN_TORSO_PX or tlR < MIN_TORSO_PX:
        return FrameGate(i, False, "躯干尺度过小或不可测")

    cL, cR = torso_center(L), torso_center(R)
    if not cL or not cR:
        return FrameGate(i, False, "躯干中心不可测")

    hL, hR = body_height(L) / height, body_height(R) / height
    if hL < MIN_HEIGHT_FRAC or hR < MIN_HEIGHT_FRAC:
        return FrameGate(i, False, "人体在画面中过小（观众或画中画）")

    tl = (tlL + tlR) / 2
    sep = abs(cL[0] - cR[0]) / tl
    vert = abs(cL[1] - cR[1]) / tl
    ratio = max(tlL, tlR) / min(tlL, tlR)

    if ratio > MAX_SCALE_RATIO:
        return FrameGate(i, False, "两人躯干尺度差异过大（不在同一景深）", sep, ratio)
    if sep < MIN_SEP_TL:
        return FrameGate(i, False, "两人水平间距过近（疑似同一人重复检出）", sep, ratio)
    if sep > MAX_SEP_TL:
        return FrameGate(i, False, "两人水平间距过远（不在交锋距离）", sep, ratio)
    if vert > MAX_VERTICAL_TL:
        return FrameGate(i, False, "两人高度差异过大（不在同一剑道平面）", sep, ratio)

    return FrameGate(i, True, "有效", sep, ratio)


def find_segments(track: dict, min_seconds: float = 0.4, max_gap: int = 6):
    """返回满足几何门控且足够长的连续段。

    允许段内有 max_gap 帧以内的短暂中断（一次遮挡不该把一段交锋劈成两半）。
    """
    fps = track.get("fps", 30.0)
    h = track.get("height", 1)
    gates = [gate_frame(f, h) for f in track["frames"]]
    min_len = max(3, int(min_seconds * fps))

    # 先按 max_gap 合并短暂中断
    valid = [g.valid for g in gates]
    filled = valid[:]
    i = 0
    while i < len(filled):
        if filled[i]:
            i += 1
            continue
        j = i
        while j < len(filled) and not filled[j]:
            j += 1
        if 0 < i and j < len(filled) and (j - i) <= max_gap:
            for k in range(i, j):
                filled[k] = True
        i = j

    segments, start = [], None
    for idx in range(len(filled) + 1):
        on = filled[idx] if idx < len(filled) else False
        if on and start is None:
            start = idx
        elif not on and start is not None:
            end = idx - 1
            if end - start + 1 >= min_len:
                seg = [g for g in gates if start <= g.frame <= end and g.valid]
                segments.append({
                    "start": start,
                    "end": end,
                    "frames": end - start + 1,
                    "seconds": round((end - start + 1) / fps, 2),
                    "meanSeparation": round(
                        sum(g.separation for g in seg) / max(1, len(seg)), 2),
                    "gateCoverage": round(len(seg) / max(1, end - start + 1), 3),
                })
            start = None

    reasons: dict[str, int] = {}
    for g in gates:
        if not g.valid:
            reasons[g.reason] = reasons.get(g.reason, 0) + 1

    return segments, reasons


def best_segment(track: dict):
    """取最长的有效段作为分析窗口。"""
    segs, _ = find_segments(track)
    return max(segs, key=lambda s: s["frames"]) if segs else None
