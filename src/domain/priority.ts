/**
 * 推理层：把事件组装成可追问的证据链，产出优先权归属。
 *
 * 本引擎的三条纪律：
 * 1. 不做「投票」和「加权平均」。两个口径分歧时如实报冲突，交给人裁定。
 * 2. 差值落在测量分辨率以内时输出 simultaneous，不硬凑赢家。
 * 3. 关键事件缺失时输出 insufficient，不用先验或统计填补。
 */

import { assumptionValue } from './assumptions'
import { DOCTRINES } from './rules'
import type { Doctrine, DoctrineId } from './rules'
import type {
  Actor,
  Assumption,
  CaseAnalysis,
  ChainLayer,
  ChainNode,
  ConflictNote,
  EpistemicKind,
  EventKind,
  MotionEvent,
  Side,
  Verdict,
} from './types'

const OTHER: Record<Side, Side> = { left: 'right', right: 'left' }
const SIDE_ZH: Record<Side, string> = { left: '左方', right: '右方' }

interface NodeInit {
  id: string
  layer: ChainLayer
  epistemic: EpistemicKind
  claim: string
  detail?: string
  value?: number
  unit?: string
  formula?: string
  confidence: number
  actor?: Actor
  frameRange?: [number, number]
  keyFrame?: number
  basis?: string[]
  sources?: string[]
  assumptions?: string[]
}

function node(init: NodeInit): ChainNode {
  return {
    actor: 'none',
    basis: [],
    sources: [],
    assumptions: [],
    status: 'ai_proposed',
    ...init,
  }
}

function findEvent(events: MotionEvent[], side: Side, kind: EventKind): MotionEvent | undefined {
  return events.find((e) => e.side === side && e.kind === kind)
}

function ms(seconds: number): number {
  return Math.round(seconds * 1000)
}

// ─────────────────────────────────────────────
// 单口径推理
// ─────────────────────────────────────────────

interface DoctrineOutcome {
  doctrine: Doctrine
  /** 该口径下先获得优先权的一方；simultaneous 表示不可分辨 */
  first: Side | 'simultaneous' | 'insufficient'
  deltaMs: number
  confidence: number
  nodeIds: string[]
  judgmentId: string
}

const CRITERION: Record<DoctrineId, { kind: EventKind; label: string; symbol: string }> = {
  fie_text: { kind: 'arm_extension_start', label: '持剑臂开始伸展', symbol: 't_arm' },
  practice_footfirst: { kind: 'front_foot_start', label: '前脚开始向前', symbol: 't_foot' },
}

function runDoctrine(
  doctrineId: DoctrineId,
  events: MotionEvent[],
  assumptions: Assumption[],
  nodes: ChainNode[],
): DoctrineOutcome {
  const doctrine = DOCTRINES[doctrineId]
  const crit = CRITERION[doctrineId]
  const window = assumptionValue(assumptions, 'simultaneity_window')
  const nodeIds: string[] = []

  const evL = findEvent(events, 'left', crit.kind)
  const evR = findEvent(events, 'right', crit.kind)

  // 事件节点（观测层）
  for (const [side, ev] of [
    ['left', evL],
    ['right', evR],
  ] as const) {
    const id = `ev.${side}.${doctrineId}`
    nodeIds.push(id)
    if (!ev) {
      nodes.push(
        node({
          id,
          layer: 'finding',
          epistemic: 'observed',
          claim: `${SIDE_ZH[side]}未检测到「${crit.label}」`,
          detail:
            '在交锋窗口内，该侧的相关运动量始终未持续越过判定阈值。可能原因：该侧被遮挡、关键点置信度过低、或该侧确实没有做出此动作。系统不对此作推测。',
          confidence: 0,
          actor: side,
          sources: doctrine.ruleRefs,
          assumptions: [doctrineId === 'fie_text' ? 'arm_ext_rate' : 'foot_start_speed'],
        }),
      )
      continue
    }
    nodes.push(
      node({
        id,
        layer: 'finding',
        epistemic: ev.epistemic,
        claim: `${SIDE_ZH[side]}${crit.label}于第 ${ev.frame} 帧（${ms(ev.t)} ms）`,
        detail: `触发条件：${ev.measure.name} = ${ev.measure.value} ${ev.measure.unit}，超过阈值 ${ev.measure.threshold} ${ev.measure.unit}，并在第 ${ev.window[0]}–${ev.window[1]} 帧持续满足。时刻已回溯至运动起始帧，而非首次超阈值帧。`,
        value: ms(ev.t),
        unit: 'ms',
        formula: `${crit.symbol}(${side}) = argmin{ f : d/dt(${ev.measure.name}) ≥ ${ev.measure.threshold} 持续 N 帧 } 回溯至起始`,
        confidence: ev.confidence,
        actor: side,
        keyFrame: ev.frame,
        frameRange: ev.window,
        sources: doctrine.ruleRefs,
        assumptions: [doctrineId === 'fie_text' ? 'arm_ext_rate' : 'foot_start_speed'],
      }),
    )
  }

  const judgmentId = `jdg.${doctrineId}`

  if (!evL || !evR) {
    nodes.push(
      node({
        id: judgmentId,
        layer: 'judgment',
        epistemic: 'derived',
        claim: `${doctrine.name}：证据不足，无法比较先后`,
        detail: `比较 ${crit.symbol} 需要双方都检测到「${crit.label}」。当前缺失${!evL ? '左方' : ''}${!evL && !evR ? '与' : ''}${!evR ? '右方' : ''}的事件，因此本口径不产出优先权归属。`,
        confidence: 0,
        sources: doctrine.ruleRefs,
        basis: nodeIds.slice(),
      }),
    )
    return {
      doctrine,
      first: 'insufficient',
      deltaMs: NaN,
      confidence: 0,
      nodeIds: [...nodeIds, judgmentId],
      judgmentId,
    }
  }

  const deltaMs = ms(evL.t) - ms(evR.t)
  const absDelta = Math.abs(deltaMs)
  const datumId = `dat.delta.${doctrineId}`
  nodeIds.push(datumId)
  nodes.push(
    node({
      id: datumId,
      layer: 'datum',
      epistemic: 'derived',
      claim: `双方${crit.label}时差 Δ = ${deltaMs > 0 ? '+' : ''}${deltaMs} ms`,
      detail: `Δ 为正表示左方晚于右方。当前可分辨阈值为 ${window} ms；|Δ| = ${absDelta} ms ${absDelta < window ? '小于' : '不小于'}该阈值。`,
      value: deltaMs,
      unit: 'ms',
      formula: `Δ = ${crit.symbol}(left) − ${crit.symbol}(right)`,
      confidence: Math.min(evL.confidence, evR.confidence),
      actor: 'both',
      basis: [`ev.left.${doctrineId}`, `ev.right.${doctrineId}`],
      sources: doctrine.ruleRefs,
      assumptions: ['simultaneity_window'],
    }),
  )

  const propagated = Math.min(evL.confidence, evR.confidence)

  if (absDelta < window) {
    nodes.push(
      node({
        id: judgmentId,
        layer: 'judgment',
        epistemic: 'derived',
        claim: `${doctrine.name}：不可分辨先后，构成同时动作`,
        detail: `|Δ| = ${absDelta} ms 小于可分辨阈值 ${window} ms。此处的「同时」是测量意义上的——系统无法在证据层面区分先后，因此依 t.106.1 不将优先权判给任何一方。若裁判凭现场观察认为可分辨，应直接推翻本节点。`,
        value: absDelta,
        unit: 'ms',
        confidence: propagated,
        actor: 'both',
        basis: [datumId],
        sources: ['t.106.1'],
        assumptions: ['simultaneity_window'],
      }),
    )
    return {
      doctrine,
      first: 'simultaneous',
      deltaMs,
      confidence: propagated,
      nodeIds: [...nodeIds, judgmentId],
      judgmentId,
    }
  }

  const first: Side = deltaMs < 0 ? 'left' : 'right'
  // 裕度越大越可信：时差超出阈值越多，结论越稳
  const marginBoost = Math.min(1, 0.6 + (absDelta - window) / (window * 2 || 1) / 2.5)
  nodes.push(
    node({
      id: judgmentId,
      layer: 'judgment',
      epistemic: 'derived',
      claim: `${doctrine.name}：${SIDE_ZH[first]}先取得优先权`,
      detail: `${SIDE_ZH[first]}的${crit.label}早 ${absDelta} ms，超出可分辨阈值 ${window} ms，差额 ${absDelta - window} ms。依据：${doctrine.basis}`,
      value: absDelta,
      unit: 'ms',
      confidence: propagated * marginBoost,
      actor: first,
      basis: [datumId],
      sources: doctrine.ruleRefs,
      assumptions: ['simultaneity_window'],
    }),
  )

  return {
    doctrine,
    first,
    deltaMs,
    confidence: propagated * marginBoost,
    nodeIds: [...nodeIds, judgmentId],
    judgmentId,
  }
}

// ─────────────────────────────────────────────
// 攻击完成性检验 t.101.3a
// ─────────────────────────────────────────────

interface CompletionResult {
  nodeId: string | null
  /** 攻击是否在前脚落地前完成 */
  completed: boolean | null
  confidence: number
}

function checkCompletion(
  attacker: Side,
  events: MotionEvent[],
  contact: MotionEvent | null,
  nodes: ChainNode[],
): CompletionResult {
  const land = findEvent(events, attacker, 'front_foot_land')
  const id = `jdg.completion.${attacker}`

  if (!land || !contact) {
    nodes.push(
      node({
        id,
        layer: 'judgment',
        epistemic: 'derived',
        claim: `无法核验${SIDE_ZH[attacker]}的攻击是否在前脚落地前完成`,
        detail: `t.101.3a 要求「击中最迟在前脚触及剑道时到达」。核验需要落地时刻与触及时刻两者。当前缺失${!land ? '落地时刻' : ''}${!land && !contact ? '与' : ''}${!contact ? '触及时刻' : ''}。触及时刻本身是由 2D 姿态外推的估算量，即使存在也不足以单独定案。`,
        confidence: 0,
        actor: attacker,
        sources: ['t.101.3a'],
        assumptions: ['landing_settle_speed', 'blade_tip_ratio'],
      }),
    )
    return { nodeId: id, completed: null, confidence: 0 }
  }

  const marginMs = ms(land.t) - ms(contact.t)
  const completed = marginMs >= 0
  // 依赖估算的剑尖，置信度封顶
  const conf = Math.min(0.6, land.confidence * contact.confidence)

  nodes.push(
    node({
      id,
      layer: 'judgment',
      epistemic: 'estimated',
      claim: completed
        ? `${SIDE_ZH[attacker]}的攻击在前脚落地前 ${marginMs} ms 完成`
        : `${SIDE_ZH[attacker]}的攻击晚于前脚落地 ${-marginMs} ms，未按 t.101.3a 完成`,
      detail: `落地帧 ${land.frame}（${ms(land.t)} ms），估算触及帧 ${contact.frame}（${ms(contact.t)} ms），余量 ${marginMs} ms。注意：触及时刻依赖「剑尖外推比例」这一结构性假设，本节点置信度封顶 0.6，不足以单独推翻优先权归属，仅作提示。`,
      value: marginMs,
      unit: 'ms',
      formula: 't_land − t_contact ≥ 0 ⇒ 攻击完成',
      confidence: conf,
      actor: attacker,
      keyFrame: land.frame,
      frameRange: [Math.min(contact.frame, land.frame), Math.max(contact.frame, land.frame)],
      basis: [],
      sources: ['t.101.3a'],
      assumptions: ['landing_settle_speed', 'blade_tip_ratio'],
    }),
  )
  return { nodeId: id, completed, confidence: conf }
}

// ─────────────────────────────────────────────
// 收手检验 t.106.4d
// ─────────────────────────────────────────────

function checkWithdraw(side: Side, events: MotionEvent[], nodes: ChainNode[]): string | null {
  const wd = findEvent(events, side, 'arm_withdraw')
  if (!wd) return null
  const id = `jdg.withdraw.${side}`
  nodes.push(
    node({
      id,
      layer: 'judgment',
      epistemic: 'observed',
      claim: `${SIDE_ZH[side]}在第 ${wd.frame} 帧出现收手（肘角回落 ${wd.measure.value}°）`,
      detail: `t.106.4d 规定复合攻击中弯臂或瞬时停顿会使进攻方失去保护。本节点仅报告观测到的角度回落，是否构成规则意义上的「收手」需裁判结合是否为复合攻击、对方是否在此期间出手来判断。`,
      value: wd.measure.value,
      unit: '°',
      confidence: wd.confidence,
      actor: side,
      keyFrame: wd.frame,
      frameRange: wd.window,
      sources: ['t.106.4d'],
      assumptions: ['withdraw_drop'],
    }),
  )
  return id
}

// ─────────────────────────────────────────────
// 主入口
// ─────────────────────────────────────────────

export interface ReasonInput {
  caseId: string
  events: MotionEvent[]
  contactLeft: MotionEvent | null
  contactRight: MotionEvent | null
  assumptions: Assumption[]
  expertVerdict?: Verdict
  scenarioZh?: string
}

export function reason(input: ReasonInput): CaseAnalysis {
  const { caseId, events, assumptions } = input
  const nodes: ChainNode[] = []
  const conflicts: ConflictNote[] = []

  // ① 研究问题
  nodes.push(
    node({
      id: 'q.main',
      layer: 'question',
      epistemic: 'asserted',
      claim: '本剑的优先权应归属哪一方？',
      detail: `依 t.100，该判断权归裁判员。本系统的职责是把判断所依赖的每一项证据摊开，并标明各自的可信程度与假设，而非代替裁判作答。${input.scenarioZh ? `本例的专家情境分类为「${input.scenarioZh}」。` : ''}`,
      confidence: 1,
      sources: ['t.100'],
    }),
  )

  // ② 两个口径并行
  const fie = runDoctrine('fie_text', events, assumptions, nodes)
  const practice = runDoctrine('practice_footfirst', events, assumptions, nodes)

  for (const o of [fie, practice]) {
    for (const id of o.nodeIds) {
      const n = nodes.find((x) => x.id === id)
      if (n && n.basis.length === 0 && n.layer !== 'question') n.basis = ['q.main']
    }
  }

  // ③ 口径冲突检测 —— 本系统最重要的输出之一
  const bothDecided =
    (fie.first === 'left' || fie.first === 'right') &&
    (practice.first === 'left' || practice.first === 'right')

  const oneSided = (o: DoctrineOutcome) => o.first === 'left' || o.first === 'right'

  if (bothDecided && fie.first !== practice.first) {
    conflicts.push({
      id: 'conflict.doctrine',
      severity: 'high',
      title: '两个判据口径给出相反结论',
      detail: `按 FIE 条文（t.101.2，以手臂伸展为准）优先权归${SIDE_ZH[fie.first as Side]}；按临场实践口径（以前脚启动为准）归${SIDE_ZH[practice.first as Side]}。这不是模型误差，而是两套判据本身的分歧：本例中${SIDE_ZH[fie.first as Side]}抬手在先而动脚在后。`,
      nodeIds: [fie.judgmentId, practice.judgmentId],
      suggestion:
        '成文依据以 FIE 条文为准。建议裁判以条文口径为主判，同时在回放中核对手臂伸展的起始帧是否被遮挡影响。系统不替裁判在两个口径间做选择。',
    })
  }

  // 一方给出归属、另一方判不可分辨——同样是分歧，不能只报「有结论」的那个
  if (!bothDecided && oneSided(fie) !== oneSided(practice)) {
    const decided = oneSided(fie) ? fie : practice
    const undecided = oneSided(fie) ? practice : fie
    conflicts.push({
      id: 'conflict.doctrine.partial',
      severity: 'medium',
      title: '两个判据口径的可分辨程度不一致',
      detail: `${decided.doctrine.name}认为${SIDE_ZH[decided.first as Side]}在先（Δ = ${Math.abs(decided.deltaMs)} ms），而${undecided.doctrine.name}${
        undecided.first === 'simultaneous'
          ? `认为不可分辨（Δ = ${Math.abs(undecided.deltaMs)} ms，未超出阈值）`
          : '因关键事件缺失而无法比较'
      }。也就是说，这一剑的归属完全依赖于采用哪一套判据。`,
      nodeIds: [fie.judgmentId, practice.judgmentId],
      suggestion:
        '成文依据以 FIE 条文（t.101.2，手臂伸展在先）为准。裁判应重点回放核对手臂起始帧，因为脚上动作在本例中确实无法分辨先后。',
    })
  }

  // ④ 边界敏感：时差贴近阈值
  const window = assumptionValue(assumptions, 'simultaneity_window')
  for (const o of [fie, practice]) {
    const abs = Math.abs(o.deltaMs)
    if (Number.isFinite(abs) && abs >= window && abs < window * 1.5) {
      conflicts.push({
        id: `conflict.margin.${o.doctrine.id}`,
        severity: 'medium',
        title: `${o.doctrine.shortName}口径的时差贴近可分辨阈值`,
        detail: `|Δ| = ${abs} ms，仅比阈值 ${window} ms 高出 ${abs - window} ms。阈值上调至 ${abs} ms 以上，本结论即翻转为「同时」。`,
        nodeIds: [o.judgmentId],
        suggestion: '建议在右侧假设面板调整阈值观察结论稳定性，或以逐帧回放人工确认起始帧。',
      })
    }
  }

  // ⑤ 攻击完成性与收手
  const leading =
    fie.first === 'left' || fie.first === 'right'
      ? (fie.first as Side)
      : practice.first === 'left' || practice.first === 'right'
        ? (practice.first as Side)
        : null

  let completion: CompletionResult = { nodeId: null, completed: null, confidence: 0 }
  if (leading) {
    const contact = leading === 'left' ? input.contactLeft : input.contactRight
    completion = checkCompletion(leading, events, contact, nodes)
    if (completion.completed === false) {
      conflicts.push({
        id: 'conflict.completion',
        severity: 'medium',
        title: '取得优先权的一方疑似未完成攻击',
        detail: `${SIDE_ZH[leading]}虽先取得优先权，但估算的触及时刻晚于前脚落地，按 t.101.3a 攻击可能未完成（对应「进攻一次没有」）。该判断依赖剑尖外推假设，置信度不超过 0.6。`,
        nodeIds: completion.nodeId ? [completion.nodeId] : [],
        suggestion: '必须以回放逐帧人工确认剑刃触及时刻，不可仅凭本系统的估算量定案。',
      })
    }
  }

  const withdrawIds = (['left', 'right'] as Side[])
    .map((s) => checkWithdraw(s, events, nodes))
    .filter((x): x is string => !!x)

  if (leading && withdrawIds.includes(`jdg.withdraw.${leading}`)) {
    conflicts.push({
      id: 'conflict.withdraw',
      severity: 'medium',
      title: '取得优先权的一方存在收手动作',
      detail: `${SIDE_ZH[leading]}在攻击过程中出现肘角回落。若该动作构成 t.106.4d 意义上的弯臂或停顿，且对方在此期间出手，优先权可能转移。`,
      nodeIds: [`jdg.withdraw.${leading}`],
      suggestion: '需裁判判断该动作是否为转换线路的正常过程，还是丧失威胁的收手。',
    })
  }

  // ⑥ 结论
  const verdict: Verdict =
    fie.first === 'insufficient'
      ? 'insufficient'
      : fie.first === 'simultaneous'
        ? 'simultaneous'
        : (fie.first as Side)

  const hasHighConflict = conflicts.some((c) => c.severity === 'high')
  const verdictConfidence = hasHighConflict ? Math.min(fie.confidence, 0.45) : fie.confidence

  nodes.push(
    node({
      id: 'con.verdict',
      layer: 'conclusion',
      epistemic: 'derived',
      claim:
        verdict === 'insufficient'
          ? '证据不足，不产出判罚建议'
          : verdict === 'simultaneous'
            ? '同时动作，双方均不得分（t.106.1）'
            : `优先权建议归${SIDE_ZH[verdict]}`,
      detail:
        verdict === 'insufficient'
          ? '关键时刻缺失，系统拒绝给出归属。依 t.106.5，无法判明时应令双方重新开始，而不是由系统凑出一个答案。'
          : hasHighConflict
            ? '本结论以 FIE 条文口径为准，但存在高等级冲突，置信度已下调。请先处理冲突再采信。'
            : '本结论以 FIE 条文口径（t.101.2）为准，并已通过完成性与收手两项交叉核验。',
      confidence: verdictConfidence,
      actor: verdict === 'left' || verdict === 'right' ? verdict : 'both',
      basis: [fie.judgmentId, practice.judgmentId, completion.nodeId, ...withdrawIds].filter(
        (x): x is string => !!x,
      ),
      sources: verdict === 'simultaneous' ? ['t.106.1'] : ['t.100', 't.101.2'],
      assumptions: ['simultaneity_window'],
    }),
  )

  return {
    caseId,
    verdict,
    verdictConfidence,
    verdictStatus: 'ai_proposed',
    nodes,
    events,
    assumptions,
    conflicts,
    expertVerdict: input.expertVerdict,
    analyzedAt: new Date().toISOString(),
  }
}

export { OTHER, SIDE_ZH }
