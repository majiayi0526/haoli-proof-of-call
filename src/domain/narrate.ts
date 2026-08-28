/**
 * 叙述层：把内部的技术判断翻译成裁判听得懂的话。
 *
 * 前面几层为了可追溯，说的是「持剑臂肘角速度超过 120°/s 并持续 3 帧」。
 * 那是给复核用的，不是给场边用的。裁判在回放前要的是一句话：
 * 「判给右方——右方先出手，早 0.50 秒」。
 *
 * 原则：人话层只做措辞转换，不做任何新的推断。
 * 它说的每一句都必须能在证据链里找到对应节点，否则就是在编。
 */

import type {
  CaseAnalysis,
  EventKind,
  MotionEvent,
  Side,
  Verdict,
} from './types'

const SIDE: Record<Side, string> = { left: '左方', right: '右方' }

// ─────────────────────────────────────────────
// 单条事件 → 一句话
// ─────────────────────────────────────────────

interface EventPhrasing {
  /** 事件短名，用于时间轴与证据条 */
  short: string
  /** 一句话描述，主语是选手 */
  say: (side: Side) => string
  /** 这条证据在判罚里起什么作用 */
  why: string
  /** 关联规则条款 */
  rule?: string
  /** 权重：决定优先权归属的事件要突出显示 */
  weight: 'decisive' | 'supporting' | 'contextual'
}

export const EVENT_PHRASING: Record<EventKind, EventPhrasing> = {
  arm_extension_start: {
    short: '伸臂',
    say: (s) => `${SIDE[s]}开始伸臂进攻`,
    why: 'FIE 条文以此为优先权的第一判据：手臂伸展须先于弓步启动',
    rule: 't.101.2',
    weight: 'decisive',
  },
  front_foot_start: {
    short: '前脚启动',
    say: (s) => `${SIDE[s]}前脚开始向前`,
    why: '临场实践中通常先看这个；条文里它是「弓步启动」的时刻',
    rule: 't.101.3a',
    weight: 'decisive',
  },
  rear_foot_advance: {
    short: '后脚跟进',
    say: (s) => `${SIDE[s]}后脚跟进`,
    why: '判断是上步弓步还是原地弓步；后脚越过前脚则违规',
    rule: 't.101.5',
    weight: 'contextual',
  },
  front_foot_land: {
    short: '前脚落地',
    say: (s) => `${SIDE[s]}前脚落地`,
    why: '攻击必须在这一刻之前完成，否则视为攻击未完成',
    rule: 't.101.3a',
    weight: 'supporting',
  },
  blade_contact: {
    short: '剑尖触及',
    say: (s) => `${SIDE[s]}剑尖触及对手（估算）`,
    why: '2D 画面看不见剑，此处为外推估算，不能单独作为定案依据',
    rule: 't.101.3a',
    weight: 'supporting',
  },
  arm_withdraw: {
    short: '收手',
    say: (s) => `${SIDE[s]}出现收手`,
    why: '复合攻击中弯臂或停顿会使进攻方失去保护，优先权可能转移',
    rule: 't.106.4d',
    weight: 'supporting',
  },
}

export interface NarratedEvent {
  event: MotionEvent
  short: string
  headline: string
  why: string
  rule?: string
  weight: EventPhrasing['weight']
  /** 是否为估算量 */
  estimated: boolean
  ms: number
}

export function narrateEvent(e: MotionEvent): NarratedEvent {
  const p = EVENT_PHRASING[e.kind]
  return {
    event: e,
    short: p.short,
    headline: p.say(e.side),
    why: p.why,
    rule: p.rule,
    weight: p.weight,
    estimated: e.epistemic === 'estimated',
    ms: Math.round(e.t * 1000),
  }
}

/** 按时间排序的完整证据流 */
export function narrateTimeline(analysis: CaseAnalysis): NarratedEvent[] {
  return analysis.events
    .slice()
    .sort((a, b) => a.t - b.t)
    .map(narrateEvent)
}

// ─────────────────────────────────────────────
// 判罚结论 → 一句话
// ─────────────────────────────────────────────

export interface NarratedVerdict {
  /** 顶部大字 */
  headline: string
  /** 紧跟其后的一句理由，裁判读完这句就知道为什么 */
  because: string
  /** 支撑这句话的关键事件，用于在证据条上打标 */
  keyEvents: MotionEvent[]
  /** 需要裁判额外留意的事 */
  caveats: string[]
  side: Verdict
}

function findEv(events: MotionEvent[], side: Side, kind: EventKind) {
  return events.find((e) => e.side === side && e.kind === kind)
}

/**
 * 生成「因为……所以判给……」。
 *
 * 措辞规则：
 * - 只陈述系统真的检出的事件，缺什么就说缺什么
 * - 时间差用秒（保留两位），不用毫秒——场边读毫秒太累
 * - 估算量必须带「估算」二字
 */
export function narrateVerdict(analysis: CaseAnalysis): NarratedVerdict {
  const { verdict, events } = analysis
  const caveats: string[] = []
  const keyEvents: MotionEvent[] = []

  for (const c of analysis.conflicts) {
    if (c.severity === 'high' || c.severity === 'medium') caveats.push(c.title)
  }

  if (verdict === 'insufficient') {
    const missing: string[] = []
    for (const s of ['left', 'right'] as Side[]) {
      if (!findEv(events, s, 'arm_extension_start')) missing.push(`${SIDE[s]}的伸臂时刻`)
      if (!findEv(events, s, 'front_foot_start')) missing.push(`${SIDE[s]}的前脚启动时刻`)
    }
    return {
      headline: '证据不足，不给判罚建议',
      because: missing.length
        ? `画面里没能测到${missing.join('、')}。可能是被遮挡、画面外，或该方确实没有这个动作。依 t.106.5，判不明时应重新开始，而不是猜一个。`
        : '关键时刻缺失，无法比较先后。依 t.106.5，判不明时应重新开始。',
      keyEvents: [],
      caveats,
      side: verdict,
    }
  }

  if (verdict === 'simultaneous') {
    const la = findEv(events, 'left', 'arm_extension_start')
    const ra = findEv(events, 'right', 'arm_extension_start')
    if (la) keyEvents.push(la)
    if (ra) keyEvents.push(ra)
    const gap = la && ra ? Math.abs(Math.round((la.t - ra.t) * 1000)) : null
    return {
      headline: '同时动作，双方均不得分',
      because:
        gap !== null
          ? `双方伸臂只差 ${gap} 毫秒，小于本系统能分辨的极限。分不出先后就不能判给任何一方——依 t.106.1，同时动作双方击中均取消。`
          : '双方动作差距在测量分辨率以内，分不出先后。依 t.106.1，同时动作双方击中均取消。',
      keyEvents,
      caveats,
      side: verdict,
    }
  }

  // 有明确归属
  const win = verdict as Side
  const lose: Side = win === 'left' ? 'right' : 'left'
  const reasons: string[] = []

  const winArm = findEv(events, win, 'arm_extension_start')
  const loseArm = findEv(events, lose, 'arm_extension_start')
  if (winArm && loseArm) {
    const gapS = Math.abs(winArm.t - loseArm.t)
    keyEvents.push(winArm, loseArm)
    reasons.push(
      `${SIDE[win]}先出手，比${SIDE[lose]}早 ${gapS.toFixed(2)} 秒（t.101.2：手臂伸展先于弓步者取得优先权）`,
    )
  }

  const winLand = findEv(events, win, 'front_foot_land')
  const winContact = findEv(events, win, 'blade_contact')
  if (winLand && winContact) {
    const margin = Math.round((winLand.t - winContact.t) * 1000)
    keyEvents.push(winLand)
    if (margin >= 0) {
      reasons.push(
        `${SIDE[win]}的攻击在前脚落地前 ${margin} 毫秒完成（t.101.3a），不过触及时刻是估算的，需回放核对`,
      )
    } else {
      caveats.push(`${SIDE[win]}的攻击疑似晚于前脚落地 ${-margin} 毫秒，可能构成「进攻一次没有」`)
    }
  }

  const loseWithdraw = findEv(events, lose, 'arm_withdraw')
  if (loseWithdraw) {
    keyEvents.push(loseWithdraw)
    reasons.push(`${SIDE[lose]}中途收手，失去威胁（t.106.4d）`)
  }

  const winWithdraw = findEv(events, win, 'arm_withdraw')
  if (winWithdraw) {
    caveats.push(`${SIDE[win]}也出现了收手动作，需判断是否构成 t.106.4d 意义上的弯臂`)
  }

  return {
    headline: `优先权判给${SIDE[win]}`,
    because: reasons.length
      ? reasons.join('；') + '。'
      : `${SIDE[win]}先取得优先权。`,
    keyEvents,
    caveats,
    side: verdict,
  }
}
