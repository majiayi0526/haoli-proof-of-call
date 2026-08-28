/**
 * 假设层：所有会影响结论的可调参数集中在这里。
 *
 * 规则很简单——凡是能改变判罚结论的数字，都必须在界面上可见、可调、
 * 可追溯到一个理由。藏在代码里的魔法数字就是不可追问的黑箱。
 */

import type { Assumption } from './types'

export const ASSUMPTION_DEFS: Assumption[] = [
  {
    id: 'arm_ext_rate',
    label: '手臂伸展判定速率',
    value: 120,
    unit: '°/s',
    rationale:
      '肘关节角速度超过此值并持续若干帧，才认定为「开始伸展」而非姿势微调。取值参考佩剑弓步中前臂角速度量级（数百 °/s），设在其下限以免漏检慢速起手。',
    range: [40, 400],
    step: 10,
  },
  {
    id: 'arm_ext_hold',
    label: '伸展持续帧数',
    value: 3,
    unit: '帧',
    rationale:
      '要求连续 N 帧维持超阈值，用于排除姿态检测器的单帧抖动造成的伪起手。60fps 下 3 帧 = 50ms。',
    range: [2, 8],
    step: 1,
  },
  {
    id: 'foot_start_speed',
    label: '前脚启动速度阈值',
    value: 0.55,
    unit: 'tl/s',
    rationale:
      '以躯干长度 tl 归一化的水平速度，消除机位远近影响。不用肩宽——击剑侧身站位下肩宽投影会抖动 5 倍。0.55 tl/s 约等于每秒移动半个躯干长度，低于此值视为重心调整而非启动。',
    range: [0.15, 2.5],
    step: 0.05,
  },
  {
    id: 'foot_start_hold',
    label: '启动持续帧数',
    value: 3,
    unit: '帧',
    rationale: '同伸展持续帧数，排除踝关节检测抖动。',
    range: [2, 8],
    step: 1,
  },
  {
    id: 'simultaneity_window',
    label: '可分辨阈值（同时判定窗口）',
    value: 40,
    unit: 'ms',
    rationale:
      '本系统最关键的假设。双方启动时刻之差小于此值时，系统拒绝宣称谁在先，输出「同时」。依据是测量不确定度而非规则：60fps 帧间隔 16.7ms，叠加滤波与关键点抖动，实际时间分辨率约 2–3 帧（33–50ms）。低于该差值的「先后」不具备证据效力。注意这不同于 FIE 器械的 120ms 电子同时窗口，后者判的是击中而非启动。',
    range: [0, 200],
    step: 5,
  },
  {
    id: 'blade_tip_ratio',
    label: '剑尖外推比例',
    value: 1.8,
    unit: 'tl',
    rationale:
      '2D 姿态中不存在剑。以腕关节沿前臂方向外推「比例 × 躯干长度」估算剑尖。佩剑刃长约 88cm，自腕至剑尖约 90cm；成年选手躯干长度（肩中点→髋中点）约 50cm，故有效外推约 1.5–2.1 个躯干长度。此为结构性假设，凡依赖它的结论置信度上限被压至 0.6。',
    range: [0.8, 3.2],
    step: 0.1,
  },
  {
    id: 'landing_settle_speed',
    label: '落地判定残余速度',
    value: 0.25,
    unit: 'tl/s',
    rationale:
      '前脚垂直速度回落至此值以下且水平前移停止，判定为触及剑道。用于 t.101.3a 的「击中须在前脚落地前到达」。',
    range: [0.05, 1.2],
    step: 0.05,
  },
  {
    id: 'withdraw_drop',
    label: '收手判定角度回落',
    value: 12,
    unit: '°',
    rationale:
      '伸展过程中肘角度自局部峰值回落超过此值，判定为收手（t.106.4d）。取 12° 以高于关键点噪声引起的角度波动。',
    range: [5, 45],
    step: 1,
  },
]

export function defaultAssumptions(): Assumption[] {
  return ASSUMPTION_DEFS.map((a) => ({ ...a }))
}

export function assumptionValue(list: Assumption[], id: string): number {
  const a = list.find((x) => x.id === id)
  if (!a) throw new Error(`未定义的假设: ${id}`)
  return a.value
}

export function withAssumption(list: Assumption[], id: string, value: number): Assumption[] {
  return list.map((a) => (a.id === id ? { ...a, value } : a))
}
