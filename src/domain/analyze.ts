/**
 * 编排层：骨骼时序 → 完整裁决分析。
 *
 * 整条管线是纯函数：同样的输入必然得到同样的输出，
 * 没有随机性、没有隐藏状态。这是「结论可复核」的前提——
 * 任何人拿到同一段骨骼数据与同一组假设，都应重现出同一条证据链。
 */

import { assumptionValue, defaultAssumptions } from './assumptions'
import {
  ATTACK_LEAD_SECONDS,
  detectClashFrame,
  detectContact,
  detectEvents,
  detectPhraseWindow,
} from './events'
import { buildSeries, resolveFacing, timeOfFrame } from './kinematics'
import type { SideSeries } from './kinematics'
import { reason } from './priority'
import type { Assumption, CaseAnalysis, MotionEvent, PoseTrack, Verdict } from './types'

/** 事件搜索相对交锋窗口向前放宽的时长 */
const PRE_ROLL_SECONDS = 0.35

/** 交锋之后仍需观察的时长：前脚落地与剑尖触及发生在这段里 */
const POST_CLASH_SECONDS = 0.8

/** 从某帧向前回退指定秒数所对应的帧号，按真实时间戳走而不是按帧数换算 */
function framesBefore(track: PoseTrack, frame: number, seconds: number): number {
  const target = timeOfFrame(track, frame) - seconds
  for (let i = frame; i >= 0; i--) {
    if (timeOfFrame(track, i) <= target) return i
  }
  return 0
}

/** 从某帧向后推进指定秒数所对应的帧号 */
function framesAfter(track: PoseTrack, frame: number, seconds: number): number {
  const target = timeOfFrame(track, frame) + seconds
  const n = track.frames.length - 1
  for (let i = frame; i <= n; i++) {
    if (timeOfFrame(track, i) >= target) return i
  }
  return n
}

export interface AnalysisBundle {
  analysis: CaseAnalysis
  seriesLeft: SideSeries
  seriesRight: SideSeries
  phrase: { window: [number, number]; confidence: number; energy: number[] }
  /** 事件检测实际使用的搜索窗口 */
  searchWindow: [number, number]
  /** 交锋瞬间（双方距离最近的帧） */
  clash: { frame: number; separation: number; confidence: number } | null
}

export function analyzeCase(
  caseId: string,
  track: PoseTrack,
  assumptions: Assumption[] = defaultAssumptions(),
  meta?: { expertVerdict?: Verdict; scenarioZh?: string },
): AnalysisBundle {
  const bladeRatio = assumptionValue(assumptions, 'blade_tip_ratio')

  // 顺序很重要：先用几何门控（不依赖运动学）定下有效交锋窗口，
  // 再在窗口内判定朝向与持剑臂/前脚。反过来做的话，慢放特写和教练镜头
  // 会污染这些判定，而后续每一个时序比较都建立在它们之上。
  const gated = (track.segments ?? []).slice().sort((a, b) => b.frames - a.frames)[0]
  const gateWindow: [number, number] | undefined = gated
    ? [gated.start, gated.end]
    : undefined

  const facing = resolveFacing(track.frames, gateWindow)
  const seriesLeft = buildSeries(track, 'left', facing.left, bladeRatio, gateWindow)
  const seriesRight = buildSeries(track, 'right', facing.right, bladeRatio, gateWindow)

  const energyPhrase = detectPhraseWindow(track, seriesLeft, seriesRight)
  const phrase = gated
    ? {
        window: [gated.start, gated.end] as [number, number],
        confidence: gated.gateCoverage,
        energy: energyPhrase.energy,
      }
    : energyPhrase

  // 事件搜索窗口以「交锋瞬间」为锚点向前回溯一个进攻时长，
  // 而不是从有效段开头向后扫。有效段里往往还包含赛前调整与试探，
  // 从段首找「第一个超阈值时刻」会把准备动作误当成这次进攻的起手。
  const clash = detectClashFrame(seriesLeft, seriesRight, phrase.window)
  // 下界向前回溯一个进攻时长（排除赛前调整），上界向后留出余量
  // 以便落地与触及这类发生在交锋之后的事件仍能被检出。
  const fallbackWindow: [number, number] = [
    framesBefore(track, phrase.window[0], PRE_ROLL_SECONDS),
    Math.min(track.frames.length - 1, phrase.window[1]),
  ]
  let searchWindow = fallbackWindow
  if (clash) {
    const lo = framesBefore(track, clash.frame, ATTACK_LEAD_SECONDS)
    const hi = framesAfter(track, clash.frame, POST_CLASH_SECONDS)
    // 交集过窄说明 clash 定位可能不可靠，此时退回门控窗口，
    // 宁可多看一点，也不要因为窗口切错而把真实起手判成「证据不足」。
    if (hi - lo >= Math.round(track.fps * 0.5)) searchWindow = [lo, hi]
  }

  const events: MotionEvent[] = [
    ...detectEvents(track, seriesLeft, assumptions, searchWindow),
    ...detectEvents(track, seriesRight, assumptions, searchWindow),
  ].sort((a, b) => a.frame - b.frame)

  const contactLeft = detectContact(track, seriesLeft, seriesRight, searchWindow)
  const contactRight = detectContact(track, seriesRight, seriesLeft, searchWindow)

  const analysis = reason({
    caseId,
    events: [
      ...events,
      ...(contactLeft ? [contactLeft] : []),
      ...(contactRight ? [contactRight] : []),
    ],
    contactLeft,
    contactRight,
    assumptions,
    expertVerdict: meta?.expertVerdict,
    scenarioZh: meta?.scenarioZh,
  })

  return { analysis, seriesLeft, seriesRight, phrase, searchWindow, clash }
}
