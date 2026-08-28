/**
 * 几何门控 —— tools/segment.py 的 TypeScript 对照实现。
 *
 * 两份实现必须保持同一套阈值与判定顺序：离线预处理和浏览器端上传
 * 如果用不同的门控，同一段视频在两条路径下会得到不同的有效段，
 * 那么「结论可复现」就不成立了。改动任何一个常数时，两边一起改。
 */

import type { PoseTrack, Skeleton, TrackSegment } from '../domain/types'

export const MIN_SEP_TL = 1.2
export const MAX_SEP_TL = 12.0
export const MAX_SCALE_RATIO = 1.6
export const MAX_VERTICAL_TL = 2.5
export const MIN_HEIGHT_FRAC = 0.12
export const MIN_TORSO_PX = 18.0

function mid(sk: Skeleton, a: keyof Skeleton, b: keyof Skeleton, minC = 0.3) {
  const A = sk[a]
  const B = sk[b]
  if (!A || !B || A.c < minC || B.c < minC) return null
  return [(A.x + B.x) / 2, (A.y + B.y) / 2] as const
}

/** 躯干长度：击剑侧身站位下唯一稳定的尺度基准 */
export function torsoLength(sk: Skeleton): number {
  const s = mid(sk, 'left_shoulder', 'right_shoulder')
  const h = mid(sk, 'left_hip', 'right_hip')
  if (!s || !h) return 0
  return Math.hypot(s[0] - h[0], s[1] - h[1])
}

export function torsoCenter(sk: Skeleton) {
  const keys = ['left_shoulder', 'right_shoulder', 'left_hip', 'right_hip'] as const
  const pts = keys.map((k) => sk[k]).filter((p) => p && p.c > 0.25)
  if (pts.length < 2) return null
  return [
    pts.reduce((a, p) => a + p!.x, 0) / pts.length,
    pts.reduce((a, p) => a + p!.y, 0) / pts.length,
  ] as const
}

export function bodyHeight(sk: Skeleton): number {
  const ys = Object.values(sk)
    .filter((j) => j && j.c > 0.3)
    .map((j) => j!.y)
  return ys.length >= 4 ? Math.max(...ys) - Math.min(...ys) : 0
}

export interface GateResult {
  valid: boolean
  reason: string
  separation: number
}

export function gateFrame(
  left: Skeleton | undefined,
  right: Skeleton | undefined,
  frameHeight: number,
): GateResult {
  if (!left || !right) return { valid: false, reason: '未同时检出两名选手', separation: 0 }

  const tlL = torsoLength(left)
  const tlR = torsoLength(right)
  if (tlL < MIN_TORSO_PX || tlR < MIN_TORSO_PX) {
    return { valid: false, reason: '躯干尺度过小或不可测', separation: 0 }
  }

  const cL = torsoCenter(left)
  const cR = torsoCenter(right)
  if (!cL || !cR) return { valid: false, reason: '躯干中心不可测', separation: 0 }

  const hL = bodyHeight(left) / frameHeight
  const hR = bodyHeight(right) / frameHeight
  if (hL < MIN_HEIGHT_FRAC || hR < MIN_HEIGHT_FRAC) {
    return { valid: false, reason: '人体在画面中过小（观众或画中画）', separation: 0 }
  }

  const tl = (tlL + tlR) / 2
  const sep = Math.abs(cL[0] - cR[0]) / tl
  const vert = Math.abs(cL[1] - cR[1]) / tl
  const ratio = Math.max(tlL, tlR) / Math.min(tlL, tlR)

  if (ratio > MAX_SCALE_RATIO) {
    return { valid: false, reason: '两人躯干尺度差异过大（不在同一景深）', separation: sep }
  }
  if (sep < MIN_SEP_TL) {
    return { valid: false, reason: '两人水平间距过近（疑似同一人重复检出）', separation: sep }
  }
  if (sep > MAX_SEP_TL) {
    return { valid: false, reason: '两人水平间距过远（不在交锋距离）', separation: sep }
  }
  if (vert > MAX_VERTICAL_TL) {
    return { valid: false, reason: '两人高度差异过大（不在同一剑道平面）', separation: sep }
  }

  return { valid: true, reason: '有效', separation: sep }
}

export function findSegments(
  track: PoseTrack,
  minSeconds = 0.4,
  maxGap = 6,
): { segments: TrackSegment[]; rejections: Record<string, number> } {
  const { fps, height, frames } = track
  const gates = frames.map((f) => gateFrame(f.left, f.right, height))
  const minLen = Math.max(3, Math.floor(minSeconds * fps))

  // 合并 maxGap 帧以内的短暂中断：一次遮挡不该把一段交锋劈成两半
  const filled = gates.map((g) => g.valid)
  let i = 0
  while (i < filled.length) {
    if (filled[i]) {
      i++
      continue
    }
    let j = i
    while (j < filled.length && !filled[j]) j++
    if (i > 0 && j < filled.length && j - i <= maxGap) {
      for (let k = i; k < j; k++) filled[k] = true
    }
    i = j
  }

  const segments: TrackSegment[] = []
  let start: number | null = null
  for (let idx = 0; idx <= filled.length; idx++) {
    const on = idx < filled.length ? filled[idx] : false
    if (on && start === null) start = idx
    else if (!on && start !== null) {
      const end = idx - 1
      const len = end - start + 1
      if (len >= minLen) {
        const seg = gates.slice(start, end + 1).filter((g) => g.valid)
        segments.push({
          start,
          end,
          frames: len,
          seconds: Math.round((len / fps) * 100) / 100,
          meanSeparation:
            Math.round(
              (seg.reduce((a, g) => a + g.separation, 0) / Math.max(1, seg.length)) * 100,
            ) / 100,
          gateCoverage: Math.round((seg.length / len) * 1000) / 1000,
        })
      }
      start = null
    }
  }

  const rejections: Record<string, number> = {}
  for (const g of gates) {
    if (!g.valid) rejections[g.reason] = (rejections[g.reason] ?? 0) + 1
  }

  return { segments, rejections }
}
