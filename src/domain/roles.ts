import type { View } from './types'

/**
 * 使用者身份与权限模型。
 *
 * 三个身份不是三张换了皮的同一个界面，它们在场上要做的事本来就不同：
 * 裁判员在回放席上判这一剑、教练员在训练房带自己队伍的素材、
 * 研究者在书桌前看整批数据。所以进来落在哪一页、能不能上传、
 * 能不能接裁判器，都按这个差别来。
 *
 * 能力集中定义在这一处，组件只问「这个身份能不能做某事」，
 * 不各自写一遍 if (role === 'referee')。加第四个身份时只改这里。
 *
 * 强调一点：这是演示态的身份切换，不是鉴权，是界面收敛而非安全边界。
 * 真实的账号与签名要等硬件一体机版本——那时每条人工裁决都要绑定到
 * 具体裁判员。界面上不铺开讲限制：能做的都列了，没列的就是不做，
 * 反复申明「你不能做什么」读起来像是在为功能缺失道歉。
 * 每条限制的理由写在对应开关旁边，界面不显示，代码里不丢。
 */

export type Role = 'referee' | 'coach' | 'researcher'

export interface RoleProfile {
  id: Role
  zh: string
  /** 这个身份在场上是干什么的，一句话 */
  standfirst: string
  /** 进来先落在哪一页 */
  landing: View
  /** 是否直接开一剑进裁判回放台——裁判员要的是「坐下就能判」 */
  opensCaseOnEntry: boolean
  canUpload: boolean
  canConnectScoringBox: boolean
  can: readonly string[]
  /**
   * 强调色取自全站的认识论标签，不是随便挑的颜色：
   * 裁判员依规则裁断（规则）、教练员看画面里发生了什么（观测）、
   * 研究者从数据里推结论（推算）。记分灯的红绿白留给左右方，
   * 那是「哪一边」的语义，不能拿来表示「谁在用」。
   */
  accent: string
}

export const ROLES: readonly RoleProfile[] = [
  {
    id: 'referee',
    zh: '裁判员',
    standfirst: '回放席上判这一剑',
    landing: 'workbench',
    opensCaseOnEntry: true,
    // 回放席上用的是赛场既定素材，临场引入来路不明的片段会让判罚失去可追溯性
    canUpload: false,
    canConnectScoringBox: true,
    can: [
      '打开任意一剑，0.1× 慢放逐帧核对',
      '逐条查看判罚依据与规则原文',
      '确认或推翻系统结论，导出证据帧',
      '接入电子计分器读取击中时刻',
    ],
    accent: 'var(--ruled)',
  },
  {
    id: 'coach',
    zh: '教练员',
    standfirst: '训练房里带自己队伍的素材',
    landing: 'library',
    opensCaseOnEntry: false,
    canUpload: true,
    canConnectScoringBox: true,
    can: [
      '上传本队比赛或训练视频，浏览器端直接解析',
      '逐剑复盘：这一剑输在哪一步，精确到帧',
      '对照基准案例库，看同类情境别人怎么判',
      '接入电子计分器，训练中同步读数',
    ],
    accent: 'var(--observed)',
  },
  {
    id: 'researcher',
    zh: '研究者',
    standfirst: '书桌前看整批数据',
    landing: 'library',
    opensCaseOnEntry: false,
    // 研究结论要可复现，只在固定基准集上跑——换素材就换了实验条件
    canUpload: false,
    // 裁判器是临场设备，与离线研究无关
    canConnectScoringBox: false,
    can: [
      '浏览基准案例，逐剑分析',
      '循证分析：聚合统计深度研究',
      '实时重算，敏感性扫描',
      '核对 FIE 规则原件与条款出处',
    ],
    accent: 'var(--derived)',
  },
] as const

export function roleProfile(role: Role): RoleProfile {
  const hit = ROLES.find((r) => r.id === role)
  if (!hit) throw new Error(`未知身份：${role}`)
  return hit
}
