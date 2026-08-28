/**
 * 信源层：FIE 佩剑优先权规则条款库
 *
 * 全部条款号与原文引自 FIE Technical Rules（August 2026 edition，
 * 现行最新版），佩剑优先权章节为 t.100 – t.106。
 *
 * 规则手册原件随应用一起分发（public/rules/），断网也能查；
 * 每条引用都带页码，点开直接跳到官方 PDF 的那一页——
 * 「信源可核对」如果需要人翻五分钟找，在场边就等于不可核对。
 *
 * 版本核对记录：2026 年 8 月版与 2021 年 12 月版的 t.100 – t.106
 * 逐字比对一致。这套佩剑判罚约定四年多未变，因此此前基于 2021 版
 * 建立的操作化定义全部继续有效。
 *
 * 重要：本文件只做「转述与定位」，不改写规则。中文为本项目译文，
 * 界面上必须与英文原文并列显示，让使用者能自行核对。
 */

import type { SourceRef } from './types'

export const RULE_EDITION = 'FIE Technical Rules, August 2026'

/** 随应用分发的原件，断网可查 */
export const RULE_PDF = 'rules/fie-technical-rules-2026-08.pdf'

/** FIE 官网原始下载地址，供核对来源真伪 */
export const RULE_SOURCE_URL =
  'https://static.fie.org/uploads/40/204138-Technical%20rules%20August%202026%20ang.pdf'

/** FIE 规则总页面 */
export const RULE_INDEX_URL = 'https://fie.org/fie/documents/rules'

/** 在本地 PDF 中打开指定页 */
export function rulePdfUrl(page?: number): string {
  const base = `${import.meta.env.BASE_URL}${RULE_PDF}`
  return page ? `${base}#page=${page}` : base
}

export const RULE_URL = RULE_SOURCE_URL

export interface RuleClause extends SourceRef {
  kind: 'rule'
  code: string
  /** 英文原文（逐字） */
  quote: string
  /** 本项目译文 */
  zh: string
  /** 该条款在本系统中对应的可测量判据 */
  operationalises?: string
  /** 在规则手册 PDF 中的页码，用于一键跳转核对 */
  page: number
}

export const RULES: Record<string, RuleClause> = {
  't.100': {
    id: 't.100',
    kind: 'rule',
    code: 't.100',
    page: 34,
    title: '裁判独任决定有效性与优先权',
    quote:
      'The Referee alone decides as to the validity or the priority of the hit by applying the following basic rules which are the conventions applicable to sabre fencing.',
    zh: '裁判员独自决定击中的有效性或优先权，依据以下适用于佩剑的基本约定。',
    edition: RULE_EDITION,
    url: RULE_SOURCE_URL,
    operationalises:
      '本系统的产出是候选依据，最终判断权归裁判员。任何 AI 结论都不自动升级为事实。',
  },

  't.101.2': {
    id: 't.101.2',
    kind: 'rule',
    code: 't.101.2',
    page: 34,
    title: '攻击正确执行的定义',
    quote:
      'The attack is correctly carried out when the straightening of the arm, with the point or the cutting edge continuously threatening the valid target, precedes the initiation of the lunge.',
    zh: '当持剑臂伸展（剑尖或剑刃持续威胁有效部位）先于弓步启动时，该攻击视为正确执行。',
    edition: RULE_EDITION,
    url: RULE_SOURCE_URL,
    operationalises:
      '可测量判据：肘关节角度开始单调增大的帧 t_arm，须早于前脚水平速度越过阈值的帧 t_foot，即 t_arm < t_foot。',
  },

  't.101.3a': {
    id: 't.101.3a',
    kind: 'rule',
    code: 't.101.3a',
    page: 34,
    title: '简单攻击带弓步：击中须在前脚落地前到达',
    quote:
      'in a simple attack when the beginning of the straightening of the arm precedes the launching of the lunge and the hit arrives at the latest when the front foot hits the piste;',
    zh: '简单攻击带弓步时：手臂开始伸展先于弓步发动，且击中最迟须在前脚触及剑道的同时到达。',
    edition: RULE_EDITION,
    url: RULE_SOURCE_URL,
    operationalises:
      '可测量判据：t_arm < t_lunge 且 t_contact ≤ t_land。若 t_contact > t_land，攻击未完成（对应「进攻一次没有」）。',
  },

  't.101.4a': {
    id: 't.101.4a',
    kind: 'rule',
    code: 't.101.4a',
    page: 34,
    title: '上步弓步：手臂伸展须先于上步',
    quote:
      'in a simple attack when the beginning of the straightening of the arm precedes the step-forward and when the hit arrives at the latest when the front foot hits the piste;',
    zh: '上步接弓步的简单攻击：手臂开始伸展须先于上步，且击中最迟在前脚触及剑道时到达。',
    edition: RULE_EDITION,
    url: RULE_SOURCE_URL,
    operationalises: '与 t.101.3a 同构，但 t_foot 取上步的前脚启动帧而非弓步启动帧。',
  },

  't.101.5': {
    id: 't.101.5',
    kind: 'rule',
    code: 't.101.5',
    page: 34,
    title: '前冲步与后脚越过前脚为禁止动作',
    quote:
      'The fleche and any forward movement in which the rear foot completely passes the front foot is forbidden.',
    zh: '前冲步（fleche）以及任何后脚完全越过前脚的向前移动均被禁止。',
    edition: RULE_EDITION,
    url: RULE_SOURCE_URL,
    operationalises:
      '可测量判据：后脚踝 x 坐标越过前脚踝 x 坐标（按面向方向），触发违规标记。',
  },

  't.102.1': {
    id: 't.102.1',
    kind: 'rule',
    code: 't.102.1',
    page: 35,
    title: '对方剑尖在线时，进攻方须先拨开',
    quote:
      "If the attack is initiated when the opponent has his point 'in line' the attacker must first deflect his opponent's weapon.",
    zh: '若发起攻击时对方剑尖已「在线」，进攻方须先拨开对方武器。',
    edition: RULE_EDITION,
    url: RULE_SOURCE_URL,
    operationalises:
      '需判断「剑尖在线」——本系统由 2D 姿态估算剑尖朝向，属估算量，置信度上限设为 0.6。',
  },

  't.102.2': {
    id: 't.102.2',
    kind: 'rule',
    code: 't.102.2',
    page: 35,
    title: '找剑落空（dérobement）则进攻权转移',
    quote:
      "If, when attempting to find the opponent's blade to deflect it, the blade is not found (dérobement), the right of attack passes to the opponent.",
    zh: '若尝试找剑以拨开对方武器而未找到（脱逃/dérobement），进攻权转移给对方。',
    edition: RULE_EDITION,
    url: RULE_SOURCE_URL,
    operationalises: '对应素材库「对攻·转换」类；2D 姿态无法直接观测剑身接触，标记为证据不足。',
  },

  't.105.1': {
    id: 't.105.1',
    kind: 'rule',
    code: 't.105.1',
    page: 35,
    title: '格挡给予还击权',
    quote:
      'The parry gives the right to riposte; a simple riposte may be direct or indirect, but in order to annul any subsequent movement by the attacker, it must be carried out immediately, without any hesitation or pause.',
    zh: '格挡给予还击权；简单还击可直接或间接，但要使进攻方的后续动作失效，还击须立即执行，无迟疑或停顿。',
    edition: RULE_EDITION,
    url: RULE_SOURCE_URL,
    operationalises: '对应素材库「防守还击·返还击」类；停顿以帧间隔量化。',
  },

  't.106.1': {
    id: 't.106.1',
    kind: 'rule',
    code: 't.106.1',
    page: 36,
    title: '同时动作：双方均不得分',
    quote:
      'The simultaneous action is due to simultaneous conception and execution of an attack by both fencers; in this case the hits exchanged are annulled for both fencers.',
    zh: '同时动作源于双方同时构思并执行攻击；此时双方互中的击中均被取消。',
    edition: RULE_EDITION,
    url: RULE_SOURCE_URL,
    operationalises:
      '可测量判据：双方 t_arm 之差小于「可分辨阈值」时，不得强行判归一方，应输出 simultaneous。该阈值即本系统最关键的假设。',
  },

  't.106.3a': {
    id: 't.106.3a',
    kind: 'rule',
    code: 't.106.3a',
    page: 36,
    title: '对简单攻击做阻击者被判中',
    quote:
      "The fencer who is attacked is alone counted as hit: If he makes a stop hit on his opponent's simple attack;",
    zh: '受攻击方单独被判中：若其对对方的简单攻击做出阻击（stop hit）。',
    edition: RULE_EDITION,
    url: RULE_SOURCE_URL,
    operationalises: '对应素材库「后退转换进攻」类的一部分。',
  },

  't.106.4d': {
    id: 't.106.4d',
    kind: 'rule',
    code: 't.106.4d',
    page: 36,
    title: '复合攻击中弯臂或停顿者被判中',
    quote:
      'If, during a compound attack, he bends his arm or makes a momentary pause, during which time the opponent makes a stop hit or an attack while the attacker continues his own attack.',
    zh: '复合攻击过程中若进攻方弯臂或出现瞬时停顿，而对方在此期间做出阻击或攻击，则进攻方单独被判中。',
    edition: RULE_EDITION,
    url: RULE_SOURCE_URL,
    operationalises:
      '可测量判据：肘角度在伸展过程中出现回落（Δθ < 0 持续 N 帧）即判定为收手。对应素材库「转换·收手」类。',
  },

  't.106.4f': {
    id: 't.106.4f',
    kind: 'rule',
    code: 't.106.4f',
    page: 36,
    title: '格挡还击后的重复进攻无效',
    quote:
      'If he makes a hit by a remise, redoublement or reprise following a parry by his opponent which has been followed by a riposte which is immediate, simple and executed in one period of fencing time without withdrawing the arm.',
    zh: '若对方格挡后立即以简单还击（一个击剑时限内、未收臂）还击，进攻方以重复进攻击中则被判中。',
    edition: RULE_EDITION,
    url: RULE_SOURCE_URL,
    operationalises: '对应素材库「重复进攻」类。',
  },

  't.106.5': {
    id: 't.106.5',
    kind: 'rule',
    code: 't.106.5',
    page: 36,
    title: '无法判明过失方时，重新开始',
    quote:
      'When there is a double hit, and if the Referee is unable clearly to judge from which side the fault has come, he must replace the competitors on guard.',
    zh: '出现双击且裁判无法明确判断过失来自哪一方时，应令双方重新开始。',
    edition: RULE_EDITION,
    url: RULE_SOURCE_URL,
    operationalises:
      '本系统据此设置「拒绝下结论」出口：证据不足时输出 insufficient，而不是硬凑一个答案。',
  },
}

// ─────────────────────────────────────────────
// 判据口径 —— 规则原文 vs 裁判实践，两者可能冲突
// ─────────────────────────────────────────────

export type DoctrineId = 'fie_text' | 'practice_footfirst'

export interface Doctrine {
  id: DoctrineId
  name: string
  shortName: string
  /** 该口径的第一判据 */
  primaryCriterion: string
  basis: string
  ruleRefs: string[]
  /** 该口径在国内/国际实践中的地位说明 */
  provenance: string
}

/**
 * 这是本项目最重要的设计决定之一。
 *
 * FIE 条文（t.101.2）写的第一判据是「手臂伸展先于弓步启动」；
 * 而国内佩剑裁判培训与临场实践中，普遍以「谁的前脚先启动」作为
 * 对攻场景下的首要观察点（因为手臂动作在高速下更难肉眼分辨）。
 *
 * 两个口径在多数情况下结论一致，但在「抬手在先、动脚在后」或
 * 「动脚在先、抬手在后」的组合下会分歧。系统同时跑两个口径，
 * 分歧时不隐藏、不平均、不投票，而是显式报告冲突，交由裁判裁定。
 */
export const DOCTRINES: Record<DoctrineId, Doctrine> = {
  fie_text: {
    id: 'fie_text',
    name: 'FIE 条文口径',
    shortName: '条文',
    primaryCriterion: '持剑臂开始伸展的时刻（t_arm）',
    basis: '以 t.101.2 原文为准：手臂伸展须先于弓步启动。',
    ruleRefs: ['t.101.2', 't.101.3a'],
    provenance: 'FIE Technical Rules 逐字条文，国际赛事的成文依据。',
  },
  practice_footfirst: {
    id: 'practice_footfirst',
    name: '临场实践口径',
    shortName: '实践',
    primaryCriterion: '前脚开始向前移动的时刻（t_foot）',
    basis: '对攻场景下先判断哪一方前脚先启动，再核对手上动作是否为简单进攻。',
    ruleRefs: ['t.101.3a', 't.101.4a'],
    provenance:
      '国内佩剑裁判培训与临场判罚的通行观察顺序，见于本项目开题报告的专家访谈整理；非成文条款。',
  },
}

export function ruleOf(id: string): RuleClause | undefined {
  return RULES[id]
}
