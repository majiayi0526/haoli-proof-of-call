/**
 * 敏感性层：回答「换个假设，结论还成立吗」。
 *
 * 一条结论如果在阈值挪动 5% 后就翻转，它和一条稳健的结论不该
 * 在界面上长得一样。这里把每个假设扫一遍，找出结论翻转的临界值，
 * 让「这条判罚有多经得起追问」变成一个可以看见的量。
 */

import { defaultAssumptions, withAssumption } from './assumptions'
import { analyzeCase } from './analyze'
import type { Assumption, PoseTrack, Verdict } from './types'

export interface SweepPoint {
  value: number
  verdict: Verdict
  confidence: number
}

export interface AssumptionSweep {
  assumptionId: string
  label: string
  unit: string
  current: number
  baseVerdict: Verdict
  points: SweepPoint[]
  /** 结论翻转的最近临界值；null 表示扫描范围内始终不翻 */
  breakpoint: number | null
  /** 从当前值到临界值的相对距离，越大越稳健 */
  robustness: number
  /** 该假设是否是本例结论的决定性因素 */
  decisive: boolean
}

const SWEEP_STEPS = 24

export function sweepAssumption(
  caseId: string,
  track: PoseTrack,
  assumptions: Assumption[],
  assumptionId: string,
): AssumptionSweep {
  const target = assumptions.find((a) => a.id === assumptionId)
  if (!target) throw new Error(`未定义的假设: ${assumptionId}`)

  const base = analyzeCase(caseId, track, assumptions).analysis
  const [lo, hi] = target.range
  const step = (hi - lo) / SWEEP_STEPS

  const points: SweepPoint[] = []
  for (let i = 0; i <= SWEEP_STEPS; i++) {
    const v = round(lo + step * i, 4)
    const a = analyzeCase(caseId, track, withAssumption(assumptions, assumptionId, v)).analysis
    points.push({ value: v, verdict: a.verdict, confidence: round(a.verdictConfidence, 3) })
  }

  // 找离当前值最近的翻转点
  let breakpoint: number | null = null
  let bestDist = Infinity
  for (let i = 1; i < points.length; i++) {
    if (points[i].verdict !== points[i - 1].verdict) {
      const edge = (points[i].value + points[i - 1].value) / 2
      const d = Math.abs(edge - target.value)
      if (d < bestDist) {
        bestDist = d
        breakpoint = round(edge, 4)
      }
    }
  }

  const span = hi - lo
  const robustness =
    breakpoint === null ? 1 : Math.max(0, Math.min(1, Math.abs(breakpoint - target.value) / span))

  return {
    assumptionId,
    label: target.label,
    unit: target.unit,
    current: target.value,
    baseVerdict: base.verdict,
    points,
    breakpoint,
    robustness: round(robustness, 3),
    // 临界值落在当前值 ±15% 范围内即视为决定性假设
    decisive: breakpoint !== null && Math.abs(breakpoint - target.value) <= span * 0.15,
  }
}

export interface RobustnessReport {
  caseId: string
  verdict: Verdict
  /** 全部假设中最脆弱的那一项决定了整体稳健度 */
  overall: number
  sweeps: AssumptionSweep[]
  decisiveAssumptions: string[]
}

/** 对影响结论的核心假设做全量扫描 */
export function robustnessOf(
  caseId: string,
  track: PoseTrack,
  assumptions: Assumption[] = defaultAssumptions(),
  ids: string[] = ['simultaneity_window', 'arm_ext_rate', 'foot_start_speed', 'blade_tip_ratio'],
): RobustnessReport {
  const base = analyzeCase(caseId, track, assumptions).analysis
  const sweeps = ids.map((id) => sweepAssumption(caseId, track, assumptions, id))
  const overall = sweeps.length ? Math.min(...sweeps.map((s) => s.robustness)) : 1
  return {
    caseId,
    verdict: base.verdict,
    overall: round(overall, 3),
    sweeps,
    decisiveAssumptions: sweeps.filter((s) => s.decisive).map((s) => s.assumptionId),
  }
}

function round(v: number, d: number): number {
  const m = 10 ** d
  return Math.round(v * m) / m
}
