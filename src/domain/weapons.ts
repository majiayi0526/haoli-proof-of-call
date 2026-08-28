/**
 * 剑种。
 *
 * 三个剑种的判罚逻辑并不同构，产品形态也因此不同：
 *   · 佩剑、花剑有优先权规则，判罚依赖「谁先发起攻击」——这是视觉分析的主场
 *   · 重剑没有优先权，双方在 40ms 内互中即双方得分——这是裁判器硬件的主场
 * 所以扩展到重剑不是「再训一个模型」，而是换一套判据，
 * 并把裁判器的电信号从辅助升为主依据。
 */

export type Weapon = 'sabre' | 'foil' | 'epee'

export interface WeaponSpec {
  id: Weapon
  zh: string
  en: string
  /** 是否已实现 */
  available: boolean
  /** FIE 规则中该剑种的条款范围 */
  ruleRange: string
  /** 判罚核心 */
  core: string
  /** 一句话说明这个剑种在本系统里怎么判 */
  approach: string
  /** 电子判定窗口（毫秒） */
  lockoutMs: number
}

export const WEAPONS: Record<Weapon, WeaponSpec> = {
  sabre: {
    id: 'sabre',
    zh: '佩剑',
    en: 'Sabre',
    available: true,
    ruleRange: 't.100 – t.106',
    core: '优先权',
    approach:
      '三剑种中节奏最快，判定窗口 120ms。对攻时双方几乎同时击中，优先权归谁全看谁先发起攻击——本系统当前版本实现的就是这一套。',
    lockoutMs: 120,
  },
  foil: {
    id: 'foil',
    zh: '花剑',
    en: 'Foil',
    available: false,
    ruleRange: 't.75 – t.85',
    core: '优先权',
    approach:
      '同样是优先权制，判据与佩剑同构（手臂伸展先于弓步），差别在有效部位与「剑尖在线」的处理。现有的证据链与推理引擎可直接复用，主要工作是替换规则条款与有效部位定义。',
    lockoutMs: 300,
  },
  epee: {
    id: 'epee',
    zh: '重剑',
    en: 'Épée',
    available: false,
    ruleRange: 't.60 – t.74',
    core: '同时性',
    approach:
      '没有优先权规则：双方在 40ms 内互中即双方各得一分。判罚不再依赖「谁先发起攻击」，而依赖「两次击中相差多少毫秒」——这正是裁判器电信号最擅长的事。因此重剑版将以硬件信号为主依据，视觉分析退居为动作复核与争议留证。',
    lockoutMs: 40,
  },
}

export const WEAPON_ORDER: Weapon[] = ['sabre', 'foil', 'epee']
