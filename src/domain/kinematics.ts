/**
 * 运动学层：从原始骨骼时序推导可判罚的量。
 *
 * 三条工程原则：
 * 1. 一切位移/速度用「躯干长度」归一化，单位为 tl（torso length）。
 *    不用肩宽——这是本项目最重要的一条击剑专项修正：实战姿势侧身对敌，
 *    双肩在图像上前后重叠，肩宽投影只剩正面站姿的几分之一。实测同一名
 *    选手的肩宽在 12–63 px 间抖动 5 倍，而躯干长度（肩中点→髋中点）
 *    稳定在 70–99 px。用肩宽做基准，所有阈值和毫秒数都会是错的。
 * 2. 先中值滤波去尖峰，再移动平均去抖动。姿态检测器的离群点会直接
 *    伪造出「启动」事件，不滤会得到错误但看起来很确定的结论。
 * 3. 任何来自估算（如剑尖）的量都单独标记，不与观测量混用。
 */

import type { FrameSample, Joint, JointName, PoseTrack, Side, Skeleton } from './types'

export type Dir = 1 | -1
export type Limb = 'left' | 'right'

// ─────────────────────────────────────────────
// 基础几何
// ─────────────────────────────────────────────

const MIN_CONF = 0.3

function ok(j?: Joint): j is Joint {
  return !!j && j.c >= MIN_CONF && Number.isFinite(j.x) && Number.isFinite(j.y)
}

function dist(a: Joint, b: Joint): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** 三点夹角（度），b 为顶点 */
export function angleAt(a: Joint, b: Joint, c: Joint): number {
  const v1x = a.x - b.x
  const v1y = a.y - b.y
  const v2x = c.x - b.x
  const v2y = c.y - b.y
  const n1 = Math.hypot(v1x, v1y)
  const n2 = Math.hypot(v2x, v2y)
  if (n1 < 1e-6 || n2 < 1e-6) return NaN
  const cos = Math.min(1, Math.max(-1, (v1x * v2x + v1y * v2y) / (n1 * n2)))
  return (Math.acos(cos) * 180) / Math.PI
}

function midpoint(a?: Joint, b?: Joint): Joint | undefined {
  if (!ok(a) || !ok(b)) return undefined
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, c: Math.min(a.c, b.c) }
}

/**
 * 躯干长度 tl：肩中点到髋中点的距离，本项目统一的尺度单位。
 * 侧身站位下依然稳定，是击剑视频里唯一可靠的归一化基准。
 */
export function bodyScale(s: Skeleton): number {
  const sh = midpoint(s.left_shoulder, s.right_shoulder)
  const hp = midpoint(s.left_hip, s.right_hip)
  if (sh && hp) {
    const d = dist(sh, hp)
    if (d > 6) return d
  }
  // 躯干不可见时退化为「全身外接框高度 / 3.4」，比例取自成人人体测量学常值
  const pts = Object.values(s).filter(ok)
  if (pts.length >= 4) {
    const ys = pts.map((p) => p.y)
    const h = Math.max(...ys) - Math.min(...ys)
    if (h > 20) return h / 3.4
  }
  return NaN
}

export function torsoCenter(s: Skeleton): Joint | undefined {
  const pts = (['left_shoulder', 'right_shoulder', 'left_hip', 'right_hip'] as JointName[])
    .map((k) => s[k])
    .filter(ok)
  if (pts.length < 2) return undefined
  const x = pts.reduce((a, p) => a + p.x, 0) / pts.length
  const y = pts.reduce((a, p) => a + p.y, 0) / pts.length
  const c = pts.reduce((a, p) => a + p.c, 0) / pts.length
  return { x, y, c }
}

// ─────────────────────────────────────────────
// 序列滤波
// ─────────────────────────────────────────────

/** 中值滤波：压掉姿态检测器的单帧离群点 */
export function medianFilter(xs: number[], k = 3): number[] {
  if (k < 3 || xs.length < k) return xs.slice()
  const half = Math.floor(k / 2)
  return xs.map((_, i) => {
    const win: number[] = []
    for (let j = i - half; j <= i + half; j++) {
      const v = xs[Math.min(xs.length - 1, Math.max(0, j))]
      if (Number.isFinite(v)) win.push(v)
    }
    if (!win.length) return NaN
    win.sort((a, b) => a - b)
    return win[Math.floor(win.length / 2)]
  })
}

/** 移动平均：去抖动，窗口取奇数 */
export function movingAverage(xs: number[], k = 5): number[] {
  if (k < 2 || xs.length < 2) return xs.slice()
  const half = Math.floor(k / 2)
  return xs.map((_, i) => {
    let sum = 0
    let n = 0
    for (let j = i - half; j <= i + half; j++) {
      const v = xs[j]
      if (Number.isFinite(v)) {
        sum += v
        n++
      }
    }
    return n ? sum / n : NaN
  })
}

export function smooth(xs: number[]): number[] {
  return movingAverage(medianFilter(xs, 3), 5)
}

/**
 * 中心差分求导，单位为 输入单位/秒。
 *
 * dt 取自每帧的真实时间戳而不是「1/fps」。素材普遍是可变帧率的录屏，
 * 帧间隔实测在 13–117ms 之间跳动，用固定 dt 求导会让速度曲线在
 * 长间隔处凭空出现尖峰，进而伪造出「启动」事件。
 */
export function derivative(xs: number[], times: number[]): number[] {
  const out = new Array<number>(xs.length).fill(NaN)
  const n = xs.length
  for (let i = 1; i < n - 1; i++) {
    const a = xs[i - 1]
    const b = xs[i + 1]
    const dt = times[i + 1] - times[i - 1]
    if (Number.isFinite(a) && Number.isFinite(b) && dt > 1e-6) out[i] = (b - a) / dt
  }
  if (n > 1) {
    const dt0 = times[1] - times[0]
    if (Number.isFinite(xs[0]) && Number.isFinite(xs[1]) && dt0 > 1e-6) {
      out[0] = (xs[1] - xs[0]) / dt0
    }
    const m = n - 1
    const dtn = times[m] - times[m - 1]
    if (Number.isFinite(xs[m]) && Number.isFinite(xs[m - 1]) && dtn > 1e-6) {
      out[m] = (xs[m] - xs[m - 1]) / dtn
    }
  }
  return out
}

/** 每帧的真实时间（秒）。缺 PTS 时退化为帧号÷帧率。 */
export function frameTimes(track: PoseTrack): number[] {
  return track.frames.map((f, i) =>
    Number.isFinite(f.t) ? f.t : i / (track.fps || 30),
  )
}

/** 某一帧的真实时间（秒） */
export function timeOfFrame(track: PoseTrack, frame: number): number {
  const f = track.frames[Math.max(0, Math.min(track.frames.length - 1, frame))]
  return f && Number.isFinite(f.t) ? f.t : frame / (track.fps || 30)
}

/**
 * 播放器时间轴上某一帧的时刻。
 *
 * 回放用的是压缩过的 clip，它的时间戳与原片不同（转码无法兼顾体积与
 * 时间戳精度）。seek 与画面对齐必须走这条时间轴，否则骨骼会整体错位；
 * 而毫秒读数与时序比较仍走 timeOfFrame 的高精度原片时间。
 */
export function playbackTimeOfFrame(track: PoseTrack, frame: number): number {
  const i = Math.max(0, Math.min(track.frames.length - 1, frame))
  const p = track.clipPts?.[i]
  return Number.isFinite(p) ? (p as number) : timeOfFrame(track, i)
}

/**
 * 给定播放器当前时间，找出应显示的帧。
 * 可变帧率下不能用 round(t × fps)，那会让骨骼叠加和画面错位。
 */
export function frameAtTime(track: PoseTrack, seconds: number): number {
  const n = track.frames.length
  if (!n) return 0
  let lo = 0
  let hi = n - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (playbackTimeOfFrame(track, mid) <= seconds) lo = mid
    else hi = mid - 1
  }
  return lo
}

/** 线性插值补齐短缺口；缺口超过 maxGap 帧则保留 NaN（不编造数据） */
export function fillGaps(xs: number[], maxGap = 4): number[] {
  const out = xs.slice()
  let i = 0
  while (i < out.length) {
    if (Number.isFinite(out[i])) {
      i++
      continue
    }
    let j = i
    while (j < out.length && !Number.isFinite(out[j])) j++
    const before = i - 1
    const after = j
    const gap = j - i
    if (before >= 0 && after < out.length && gap <= maxGap) {
      const a = out[before]
      const b = out[after]
      for (let k = i; k < j; k++) {
        out[k] = a + ((b - a) * (k - before)) / (after - before)
      }
    }
    i = j
  }
  return out
}

// ─────────────────────────────────────────────
// 朝向、持剑臂、前脚
// ─────────────────────────────────────────────

/**
 * 朝向、持剑臂、前脚这些判断必须只统计有效交锋窗口内的帧。
 * 素材里混着慢放特写和教练镜头，把它们算进来会得出「持剑臂在左」
 * 这类完全错误的结论，而后续所有时序比较都建立在这个判断之上。
 */
function inWindow(frames: FrameSample[], window?: [number, number]): FrameSample[] {
  if (!window) return frames
  const [a, b] = window
  return frames.filter((f) => f.frame >= a && f.frame <= b)
}

/**
 * 面向方向：+1 表示面向画面右侧。
 * 依据两名选手的躯干中心相对位置——剑道上双方必然相向。
 */
export function resolveFacing(
  frames: FrameSample[],
  window?: [number, number],
): Record<Side, Dir> {
  let leftSum = 0
  let rightSum = 0
  let n = 0
  for (const f of inWindow(frames, window)) {
    const l = f.left && torsoCenter(f.left)
    const r = f.right && torsoCenter(f.right)
    if (l && r) {
      leftSum += l.x
      rightSum += r.x
      n++
    }
  }
  if (!n) return { left: 1, right: -1 }
  return leftSum <= rightSum ? { left: 1, right: -1 } : { left: -1, right: 1 }
}

/**
 * 持剑臂：佩剑实战姿势中持剑手在前（更靠近对手）。
 * 取整段中「腕关节沿面向方向平均更靠前」的一侧。
 */
export function resolveWeaponArm(
  frames: FrameSample[],
  side: Side,
  dir: Dir,
  window?: [number, number],
): Limb {
  let l = 0
  let r = 0
  let n = 0
  for (const f of inWindow(frames, window)) {
    const s = f[side]
    if (!s) continue
    const lw = s.left_wrist
    const rw = s.right_wrist
    const c = torsoCenter(s)
    if (!c || !ok(lw) || !ok(rw)) continue
    l += (lw.x - c.x) * dir
    r += (rw.x - c.x) * dir
    n++
  }
  if (!n) return 'right'
  return l >= r ? 'left' : 'right'
}

/** 前脚：沿面向方向平均更靠前的那条腿 */
export function resolveFrontLeg(
  frames: FrameSample[],
  side: Side,
  dir: Dir,
  window?: [number, number],
): Limb {
  let l = 0
  let r = 0
  let n = 0
  for (const f of inWindow(frames, window)) {
    const s = f[side]
    if (!s) continue
    const la = s.left_ankle
    const ra = s.right_ankle
    const c = torsoCenter(s)
    if (!c || !ok(la) || !ok(ra)) continue
    l += (la.x - c.x) * dir
    r += (ra.x - c.x) * dir
    n++
  }
  if (!n) return 'right'
  return l >= r ? 'left' : 'right'
}

// ─────────────────────────────────────────────
// 单侧选手的运动学序列
// ─────────────────────────────────────────────

export interface SideSeries {
  side: Side
  dir: Dir
  weaponArm: Limb
  frontLeg: Limb
  /** 每帧躯干长度 tl（px），本项目统一的归一化尺度 */
  scale: number[]
  /** 持剑臂肘角度（度）；180 = 完全伸直 */
  elbowAngle: number[]
  /** 前脚踝沿面向方向的位置，单位 tl（相对躯干中心） */
  frontAnkleFwd: number[]
  /** 前脚踝垂直位置，单位 tl（向下为正，相对躯干中心） */
  frontAnkleDown: number[]
  /** 后脚踝沿面向方向的位置，单位 tl */
  rearAnkleFwd: number[]
  /** 持剑腕沿面向方向的位置，单位 tl */
  wristFwd: number[]
  /** 估算剑尖的绝对坐标（px） */
  bladeTip: Array<{ x: number; y: number } | null>
  /** 躯干中心绝对坐标（px） */
  torso: Array<{ x: number; y: number } | null>
  /** 每帧可用关键点平均置信度 */
  conf: number[]
}

/**
 * 剑尖位置为估算量：以「腕沿前臂方向外推 bladeRatio × 躯干长度」建模。
 * 2D 姿态中不存在剑，这是结构性假设，必须单独标注，
 * 任何依赖它的结论置信度都要被压制。
 */
export const BLADE_TIP_RATIO_DEFAULT = 1.8

function bladeTipOf(s: Skeleton, arm: Limb, tl: number, ratio: number) {
  const elbow = arm === 'left' ? s.left_elbow : s.right_elbow
  const wrist = arm === 'left' ? s.left_wrist : s.right_wrist
  if (!ok(elbow) || !ok(wrist) || !Number.isFinite(tl)) return null
  const vx = wrist.x - elbow.x
  const vy = wrist.y - elbow.y
  const n = Math.hypot(vx, vy)
  if (n < 1e-6) return null
  return { x: wrist.x + (vx / n) * ratio * tl, y: wrist.y + (vy / n) * ratio * tl }
}

export function buildSeries(
  track: PoseTrack,
  side: Side,
  dir: Dir,
  bladeRatio = BLADE_TIP_RATIO_DEFAULT,
  window?: [number, number],
): SideSeries {
  const { frames } = track
  const weaponArm = resolveWeaponArm(frames, side, dir, window)
  const frontLeg = resolveFrontLeg(frames, side, dir, window)

  const scale: number[] = []
  const elbowAngle: number[] = []
  const frontAnkleFwd: number[] = []
  const frontAnkleDown: number[] = []
  const rearAnkleFwd: number[] = []
  const wristFwd: number[] = []
  const bladeTip: SideSeries['bladeTip'] = []
  const torso: SideSeries['torso'] = []
  const conf: number[] = []

  for (const f of frames) {
    const s = f[side]
    if (!s) {
      scale.push(NaN)
      elbowAngle.push(NaN)
      frontAnkleFwd.push(NaN)
      frontAnkleDown.push(NaN)
      rearAnkleFwd.push(NaN)
      wristFwd.push(NaN)
      bladeTip.push(null)
      torso.push(null)
      conf.push(0)
      continue
    }

    const tl = bodyScale(s)
    const c = torsoCenter(s)
    scale.push(tl)
    torso.push(c ? { x: c.x, y: c.y } : null)

    const sh = weaponArm === 'left' ? s.left_shoulder : s.right_shoulder
    const el = weaponArm === 'left' ? s.left_elbow : s.right_elbow
    const wr = weaponArm === 'left' ? s.left_wrist : s.right_wrist
    elbowAngle.push(ok(sh) && ok(el) && ok(wr) ? angleAt(sh, el, wr) : NaN)

    const fa = frontLeg === 'left' ? s.left_ankle : s.right_ankle
    const ra = frontLeg === 'left' ? s.right_ankle : s.left_ankle
    const norm = Number.isFinite(tl) && tl > 1 ? tl : NaN

    frontAnkleFwd.push(ok(fa) && c && norm ? ((fa.x - c.x) * dir) / norm : NaN)
    frontAnkleDown.push(ok(fa) && c && norm ? (fa.y - c.y) / norm : NaN)
    rearAnkleFwd.push(ok(ra) && c && norm ? ((ra.x - c.x) * dir) / norm : NaN)
    wristFwd.push(ok(wr) && c && norm ? ((wr.x - c.x) * dir) / norm : NaN)

    bladeTip.push(bladeTipOf(s, weaponArm, tl, bladeRatio))

    const vals = Object.values(s).filter((j): j is Joint => !!j)
    conf.push(vals.length ? vals.reduce((a, j) => a + j.c, 0) / vals.length : 0)
  }

  return {
    side,
    dir,
    weaponArm,
    frontLeg,
    scale,
    elbowAngle: smooth(fillGaps(elbowAngle)),
    frontAnkleFwd: smooth(fillGaps(frontAnkleFwd)),
    frontAnkleDown: smooth(fillGaps(frontAnkleDown)),
    rearAnkleFwd: smooth(fillGaps(rearAnkleFwd)),
    wristFwd: smooth(fillGaps(wristFwd)),
    bladeTip,
    torso,
    conf,
  }
}
