/**
 * 事件层：从运动学序列中定位佩剑优先权判定所需的关键时刻。
 *
 * 每个事件都必须带三样东西才允许进入证据链：
 *   ① 触发它的测量值与阈值   ② 检测所用的帧窗口   ③ 置信度
 * 缺任何一样，这个时刻在裁判面前就无法被复核。
 */

import { assumptionValue } from './assumptions'
import { derivative, frameTimes, timeOfFrame } from './kinematics'
import type { SideSeries } from './kinematics'
import type { Assumption, EventKind, MotionEvent, PoseTrack, Side } from './types'

// ─────────────────────────────────────────────
// 起始点检测
// ─────────────────────────────────────────────

interface OnsetResult {
  frame: number
  /** 触发帧的测量值 */
  value: number
  /** 超阈值裕度，用于置信度 */
  margin: number
  window: [number, number]
}

/**
 * 找到「持续超阈值」的起点，并回溯到运动真正开始的那一帧。
 *
 * 直接取「首次超阈值」会系统性地偏晚——阈值是为了确认运动已经发生，
 * 而判罚要的是运动开始的瞬间。因此确认之后向前回溯到速度尚未起来的位置。
 */
function findOnset(
  rate: number[],
  threshold: number,
  hold: number,
  opts: { from?: number; to?: number; backtrackFactor?: number } = {},
): OnsetResult | null {
  const from = Math.max(0, opts.from ?? 0)
  const to = Math.min(rate.length - 1, opts.to ?? rate.length - 1)
  const backtrack = opts.backtrackFactor ?? 0.25

  for (let i = from; i <= to - hold + 1; i++) {
    let sustained = true
    for (let k = 0; k < hold; k++) {
      const v = rate[i + k]
      if (!Number.isFinite(v) || v < threshold) {
        sustained = false
        break
      }
    }
    if (!sustained) continue

    // 回溯：向前找到速度低于 threshold × backtrack 的最后一帧
    let onset = i
    const floor = threshold * backtrack
    for (let j = i - 1; j >= from; j--) {
      const v = rate[j]
      if (!Number.isFinite(v) || v < floor) {
        onset = j + 1
        break
      }
      onset = j
    }
    if (onset < from) onset = from

    const peak = Math.max(...rate.slice(i, i + hold).filter(Number.isFinite))
    return {
      frame: onset,
      value: rate[i],
      margin: threshold > 0 ? (peak - threshold) / threshold : 0,
      window: [onset, i + hold - 1],
    }
  }
  return null
}

/** 置信度：由关键点质量、超阈值裕度、数据完整度三者相乘 */
function confidenceOf(series: SideSeries, window: [number, number], margin: number): number {
  const [a, b] = window
  const slice = series.conf.slice(Math.max(0, a), Math.min(series.conf.length, b + 1))
  const poseQuality = slice.length ? slice.reduce((x, y) => x + y, 0) / slice.length : 0
  const marginScore = Math.min(1, 0.55 + margin * 0.45)
  const completeness = slice.filter((c) => c > 0.3).length / Math.max(1, slice.length)
  return Math.max(0, Math.min(1, poseQuality * marginScore * completeness))
}

function mkEvent(
  kind: EventKind,
  side: Side,
  onset: OnsetResult,
  times: number[],
  series: SideSeries,
  measure: MotionEvent['measure'],
  epistemic: MotionEvent['epistemic'] = 'observed',
): MotionEvent {
  return {
    kind,
    side,
    frame: onset.frame,
    t: times[onset.frame] ?? 0,
    confidence: confidenceOf(series, onset.window, onset.margin),
    epistemic,
    measure,
    window: onset.window,
  }
}

// ─────────────────────────────────────────────
// 各类事件
// ─────────────────────────────────────────────

export function detectEvents(
  track: PoseTrack,
  series: SideSeries,
  assumptions: Assumption[],
  searchWindow?: [number, number],
): MotionEvent[] {
  const side = series.side
  const from = searchWindow?.[0] ?? 0
  const to = searchWindow?.[1] ?? track.frames.length - 1
  const times = frameTimes(track)

  const armRate = derivative(series.elbowAngle, times)
  const footRate = derivative(series.frontAnkleFwd, times)
  const rearRate = derivative(series.rearAnkleFwd, times)
  const vertRate = derivative(series.frontAnkleDown, times)

  const armThresh = assumptionValue(assumptions, 'arm_ext_rate')
  const armHold = Math.round(assumptionValue(assumptions, 'arm_ext_hold'))
  const footThresh = assumptionValue(assumptions, 'foot_start_speed')
  const footHold = Math.round(assumptionValue(assumptions, 'foot_start_hold'))
  const settle = assumptionValue(assumptions, 'landing_settle_speed')
  const withdrawDrop = assumptionValue(assumptions, 'withdraw_drop')

  const events: MotionEvent[] = []

  // ① 持剑臂开始伸展 —— t.101.2 的第一判据
  //
  // 条文写的是「手臂伸展，且剑尖或剑刃持续威胁有效部位」。
  // 只看肘角速度会把格挡、收回、换线这些同样使肘角变化的动作
  // 一并当成起手。因此加上方向门控：只有当持剑腕同时朝对手方向
  // 推进时，肘角的增大才被承认为「伸展」。这不是调参，
  // 而是把条文里「持续威胁有效部位」这半句也操作化。
  // 门控用「腕部未后撤」而不是「严格前进」：wristFwd 是相对躯干中心的量，
  // 整个人前冲时腕相对躯干可以几乎不动，卡死在 >0 会把真实起手一起挡掉
  // （实测弃权率因此从 25% 飙到 54%）。找不到满足方向条件的起手时，
  // 退回只看肘角，并在事件名里注明判据被放宽——不让门控制造假的「证据不足」。
  const wristRate = derivative(series.wristFwd, times)
  const gatedArmRate = armRate.map((v, i) => {
    const notRetreating = Number.isFinite(wristRate[i]) ? wristRate[i] > -0.15 : true
    return notRetreating ? v : Number.NEGATIVE_INFINITY
  })
  let arm = findOnset(gatedArmRate, armThresh, armHold, { from, to })
  let armGated = true
  if (!arm) {
    arm = findOnset(armRate, armThresh, armHold, { from, to })
    armGated = false
  }
  if (arm) {
    events.push(
      mkEvent('arm_extension_start', side, arm, times, series, {
        name: armGated
          ? '持剑臂肘角速度（限定腕部未后撤）'
          : '持剑臂肘角速度（方向条件放宽）',
        value: round(arm.value, 1),
        unit: '°/s',
        threshold: armThresh,
      }),
    )
  }

  // ② 前脚开始向前 —— 临场实践口径的第一判据
  const foot = findOnset(footRate, footThresh, footHold, { from, to })
  if (foot) {
    events.push(
      mkEvent('front_foot_start', side, foot, times, series, {
        name: '前脚水平速度（躯干长度归一化）',
        value: round(foot.value, 2),
        unit: 'tl/s',
        threshold: footThresh,
      }),
    )
  }

  // ③ 后脚跟进
  const rear = findOnset(rearRate, footThresh, footHold, {
    from: foot ? foot.frame : from,
    to,
  })
  if (rear) {
    events.push(
      mkEvent('rear_foot_advance', side, rear, times, series, {
        name: '后脚水平速度（躯干长度归一化）',
        value: round(rear.value, 2),
        unit: 'tl/s',
        threshold: footThresh,
      }),
    )
  }

  // ④ 前脚落地 —— t.101.3a 的截止时刻
  const land = findLanding(footRate, vertRate, settle, foot ? foot.window[1] : from, to)
  if (land) {
    events.push(
      mkEvent('front_foot_land', side, land, times, series, {
        name: '前脚垂直残余速度',
        value: round(land.value, 2),
        unit: 'tl/s',
        threshold: settle,
      }),
    )
  }

  // ⑤ 收手 —— t.106.4d
  if (arm) {
    const wd = findWithdraw(series.elbowAngle, arm.frame, to, withdrawDrop)
    if (wd) {
      events.push(
        mkEvent('arm_withdraw', side, wd, times, series, {
          name: '肘角度自峰值回落',
          value: round(wd.value, 1),
          unit: '°',
          threshold: withdrawDrop,
        }),
      )
    }
  }

  return events.sort((a, b) => a.frame - b.frame)
}

/**
 * 落地：前脚水平前移停止（速度由正转负或趋零）且垂直速度沉降到位。
 * 找不到明确的落地则返回 null——宁可缺一个事件，不可编一个时刻。
 */
function findLanding(
  footRate: number[],
  vertRate: number[],
  settle: number,
  from: number,
  to: number,
): OnsetResult | null {
  let peakIdx = -1
  let peakVal = -Infinity
  for (let i = from; i <= to; i++) {
    const v = footRate[i]
    if (Number.isFinite(v) && v > peakVal) {
      peakVal = v
      peakIdx = i
    }
  }
  if (peakIdx < 0 || peakVal <= 0) return null

  for (let i = peakIdx; i <= to; i++) {
    const h = footRate[i]
    const v = vertRate[i]
    if (!Number.isFinite(h)) continue
    const horizontalSettled = h < settle
    const verticalSettled = !Number.isFinite(v) || Math.abs(v) < settle
    if (horizontalSettled && verticalSettled) {
      return {
        frame: i,
        value: Number.isFinite(v) ? Math.abs(v) : Math.abs(h),
        margin: Math.max(0, (settle - Math.abs(h)) / Math.max(settle, 1e-6)),
        window: [peakIdx, i],
      }
    }
  }
  return null
}

/** 收手：伸展开始后，肘角度自局部峰值回落超过阈值 */
function findWithdraw(
  elbow: number[],
  from: number,
  to: number,
  drop: number,
): OnsetResult | null {
  let peak = -Infinity
  let peakIdx = from
  for (let i = from; i <= to; i++) {
    const v = elbow[i]
    if (!Number.isFinite(v)) continue
    if (v > peak) {
      peak = v
      peakIdx = i
    } else if (peak - v >= drop) {
      return {
        frame: i,
        value: round(peak - v, 1),
        margin: (peak - v - drop) / drop,
        window: [peakIdx, i],
      }
    }
  }
  return null
}

// ─────────────────────────────────────────────
// 剑尖触及（估算量，单独处理）
// ─────────────────────────────────────────────

/**
 * 估算「剑尖触及对手有效部位」的时刻。
 *
 * 佩剑有效部位为腰线以上躯干、头部与上肢。2D 姿态无法观测剑，
 * 因此这里返回的时刻始终标记为 estimated，且置信度封顶 0.6。
 */
export function detectContact(
  track: PoseTrack,
  attacker: SideSeries,
  defender: SideSeries,
  searchWindow?: [number, number],
): MotionEvent | null {
  const from = searchWindow?.[0] ?? 0
  const to = searchWindow?.[1] ?? track.frames.length - 1

  let best = -1
  let bestD = Infinity
  for (let i = from; i <= to; i++) {
    const tip = attacker.bladeTip[i]
    const target = defender.torso[i]
    const sw = defender.scale[i]
    if (!tip || !target || !Number.isFinite(sw) || sw <= 1) continue
    const d = Math.hypot(tip.x - target.x, tip.y - target.y) / sw
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  if (best < 0 || !Number.isFinite(bestD)) return null

  // 距离越近越可信，但估算量整体封顶 0.6
  const proximity = Math.max(0, Math.min(1, 1 - bestD / 2.5))
  const poseQ = (attacker.conf[best] ?? 0) * (defender.conf[best] ?? 0)
  return {
    kind: 'blade_contact',
    side: attacker.side,
    frame: best,
    t: timeOfFrame(track, best),
    confidence: Math.min(0.6, proximity * poseQ),
    epistemic: 'estimated',
    measure: {
      name: '估算剑尖至对手躯干中心距离',
      value: round(bestD, 2),
      unit: 'tl',
      threshold: 1.0,
    },
    window: [Math.max(from, best - 3), Math.min(to, best + 3)],
  }
}

// ─────────────────────────────────────────────
// 交锋瞬间定位
// ─────────────────────────────────────────────

/**
 * 从交锋瞬间向前回溯的时长上限。
 *
 * 取 2.0 秒而不是更短：实测「准备进攻·抬手」这类情境里，一方确实会
 * 早 800ms 以上抬手——那正是它被对方抢攻的原因。窗口卡到 1.2 秒会把
 * 这个真实的起手切掉，让系统误判为「证据不足」。
 * 这个值的作用是排除赛前调整，不是限制进攻本身的长度。
 */
export const ATTACK_LEAD_SECONDS = 2.0

/**
 * 找到「交锋瞬间」——双方距离最近的那一帧。
 *
 * 这一步是整个事件检测的锚点，缺了它会犯一个很隐蔽但致命的错误：
 * 有效段可能长达数秒，里面除了这次交锋，还有赛前的调整、试探、回位。
 * 若从段首向后找「第一个超过阈值的时刻」，找到的往往是准备动作而不是
 * 这次进攻的起手——实测因此产生过 Δ=1062ms 的时差，
 * 而一次对攻里双方起手不可能相差一整秒。
 *
 * 因此改为：先锚定双方最接近的瞬间（对攻中即击中前后），
 * 再从那里向前回溯一个进攻时长去找起手。
 */
export function detectClashFrame(
  left: SideSeries,
  right: SideSeries,
  window: [number, number],
): { frame: number; separation: number; confidence: number } | null {
  const [from, to] = window
  let best = -1
  let bestSep = Infinity

  for (let i = from; i <= to; i++) {
    const l = left.torso[i]
    const r = right.torso[i]
    const sl = left.scale[i]
    const sr = right.scale[i]
    if (!l || !r || !Number.isFinite(sl) || !Number.isFinite(sr)) continue
    const tl = (sl + sr) / 2
    if (tl <= 1) continue
    const sep = Math.abs(l.x - r.x) / tl
    if (sep < bestSep) {
      bestSep = sep
      best = i
    }
  }

  if (best < 0) return null
  // 距离压得越close，越可能是真正的交锋而非擦身
  const confidence = Math.max(0, Math.min(1, 1 - bestSep / 8))
  return { frame: best, separation: round(bestSep, 2), confidence }
}

// ─────────────────────────────────────────────
// 交锋窗口自动定位（开题报告的「关键帧检测」目标）
// ─────────────────────────────────────────────

/**
 * 用双方合成运动能量定位交锋段：能量越过基线的首帧为起，回落为止。
 * 目的是把分析限制在有效交锋内，避免把赛前调整误判为启动。
 */
export function detectPhraseWindow(
  track: PoseTrack,
  left: SideSeries,
  right: SideSeries,
): { window: [number, number]; confidence: number; energy: number[] } {
  const n = track.frames.length
  const times = frameTimes(track)
  const lv = derivative(left.frontAnkleFwd, times)
  const rv = derivative(right.frontAnkleFwd, times)
  const la = derivative(left.elbowAngle, times)
  const ra = derivative(right.elbowAngle, times)

  const energy = new Array<number>(n).fill(0)
  for (let i = 0; i < n; i++) {
    const parts = [lv[i], rv[i], (la[i] ?? 0) / 150, (ra[i] ?? 0) / 150]
    energy[i] = parts.reduce((a: number, v) => a + (Number.isFinite(v) ? Math.abs(v) : 0), 0)
  }

  const valid = energy.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b)
  if (!valid.length) return { window: [0, n - 1], confidence: 0, energy }

  const baseline = valid[Math.floor(valid.length * 0.35)]
  const peak = valid[valid.length - 1]
  const gate = baseline + (peak - baseline) * 0.28

  let start = 0
  let end = n - 1
  for (let i = 0; i < n; i++) {
    if (energy[i] >= gate) {
      start = Math.max(0, i - Math.round(track.fps * 0.25))
      break
    }
  }
  for (let i = n - 1; i >= 0; i--) {
    if (energy[i] >= gate) {
      end = Math.min(n - 1, i + Math.round(track.fps * 0.25))
      break
    }
  }
  if (end <= start) return { window: [0, n - 1], confidence: 0.2, energy }

  const contrast = peak > 0 ? (peak - baseline) / peak : 0
  return { window: [start, end], confidence: Math.max(0, Math.min(1, contrast)), energy }
}

function round(v: number, d: number): number {
  const m = 10 ** d
  return Math.round(v * m) / m
}
