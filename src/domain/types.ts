/**
 * 证据链本体 (Evidence Ontology)
 *
 * 设计原则：一条判罚结论，必须能沿着
 *   研究问题 → 信源 → 证据 → 数据 → 事实/观点/估算 → 判断 → 结论
 * 逐级向下追问，任意一级都能被人推翻，推翻后下游自动重算。
 *
 * 关键约束：AI 产出的任何节点默认是「候选判断」，不是事实。
 * 只有被人确认过的节点才带 human_confirmed 状态。
 */

// ─────────────────────────────────────────────
// 认识论分层：一个数字到底是什么
// ─────────────────────────────────────────────

/** 一条陈述的认识论性质 —— 直接回答「这个数字是事实、转述、计算还是估算」 */
export type EpistemicKind =
  | 'observed' // 观测：直接从像素/骨骼测得，误差来自检测器
  | 'derived' // 推算：由观测量按公式计算，误差可传播
  | 'estimated' // 估算：模型补全的量（如剑尖位置），有结构性假设
  | 'ruled' // 规则：来自 FIE 规则条文，非经验量
  | 'asserted' // 人工断言：由裁判/研究者直接指定

/** 节点在证据链中的层级 */
export type ChainLayer =
  | 'question' // 研究问题：这一剑该判给谁？
  | 'source' // 信源：FIE 规则条款 / 视频素材
  | 'evidence' // 证据：具体帧区间的骨骼序列
  | 'datum' // 数据：可量化的测量值
  | 'finding' // 事实/估算：「左方前脚在第 12 帧启动」
  | 'judgment' // 判断：「左方先获得优先权」
  | 'conclusion' // 结论：「本剑判给左方」

/** 人机协作状态 —— AI 不能自动升级为事实 */
export type ReviewStatus =
  | 'ai_proposed' // 模型候选，未经人确认
  | 'human_confirmed' // 人已核对并确认
  | 'human_overridden' // 人已推翻并改写
  | 'disputed' // 存在冲突证据，待裁决
  | 'insufficient' // 证据不足，拒绝下结论

export type Side = 'left' | 'right'
export type Actor = Side | 'both' | 'none'

// ─────────────────────────────────────────────
// 假设与敏感性 —— 回答「模型采用了哪些假设」
// ─────────────────────────────────────────────

export interface Assumption {
  id: string
  label: string
  /** 当前取值 */
  value: number
  unit: string
  /** 为什么取这个值（必须能追溯到文献或专家共识） */
  rationale: string
  /** 允许用户调整的范围 */
  range: [number, number]
  step: number
}

/** 敏感性检验：阈值扰动后结论是否翻转 */
export interface Sensitivity {
  assumptionId: string
  /** 扰动幅度 */
  deltaPct: number
  /** 结论是否翻转 */
  flips: boolean
  /** 翻转临界值（若在范围内） */
  breakpoint?: number
  note: string
}

// ─────────────────────────────────────────────
// 信源
// ─────────────────────────────────────────────

export type SourceKind = 'rule' | 'video' | 'literature' | 'expert'

export interface SourceRef {
  id: string
  kind: SourceKind
  /** 规则条款号，如 t.75.3 */
  code?: string
  title: string
  /** 原文（规则条文逐字引用，不改写） */
  quote?: string
  edition?: string
  url?: string
}

// ─────────────────────────────────────────────
// 证据链节点
// ─────────────────────────────────────────────

export interface ChainNode {
  id: string
  layer: ChainLayer
  epistemic: EpistemicKind
  /** 一句话陈述 */
  claim: string
  /** 展开后的详细说明 */
  detail?: string

  /** 量化值（若有） */
  value?: number
  unit?: string
  /** 计算公式（可读形式），让人能手算复核 */
  formula?: string

  /** 置信度 0–1；observed 来自检测器置信，derived 由上游传播 */
  confidence: number
  /** 涉及哪一方 */
  actor: Actor
  /** 证据所在帧区间 [start, end] */
  frameRange?: [number, number]
  /** 精确到某一帧（关键时刻） */
  keyFrame?: number

  /** 上游依据节点 id —— 构成有向无环图 */
  basis: string[]
  /** 引用的信源 id */
  sources: string[]
  /** 本节点使用的假设 id */
  assumptions: string[]
  /** 敏感性检验结果 */
  sensitivity?: Sensitivity[]

  status: ReviewStatus
  /** 人工推翻后的改写内容 */
  humanOverride?: {
    claim: string
    reason: string
    by: string
    at: string
  }
  /** 与本节点冲突的其他节点 */
  conflictsWith?: string[]
}

// ─────────────────────────────────────────────
// 骨骼与运动学
// ─────────────────────────────────────────────

/** COCO-17 关键点名（YOLOv8-Pose / MediaPipe 均映射到此） */
export type JointName =
  | 'nose'
  | 'left_eye'
  | 'right_eye'
  | 'left_ear'
  | 'right_ear'
  | 'left_shoulder'
  | 'right_shoulder'
  | 'left_elbow'
  | 'right_elbow'
  | 'left_wrist'
  | 'right_wrist'
  | 'left_hip'
  | 'right_hip'
  | 'left_knee'
  | 'right_knee'
  | 'left_ankle'
  | 'right_ankle'

export interface Joint {
  x: number
  y: number
  /** 检测置信度 0–1 */
  c: number
}

export type Skeleton = Partial<Record<JointName, Joint>>

export interface FrameSample {
  frame: number
  /** 秒 */
  t: number
  left?: Skeleton
  right?: Skeleton
}

/** 几何门控筛出的有效交锋段 */
export interface TrackSegment {
  start: number
  end: number
  frames: number
  seconds: number
  /** 两人躯干中心平均水平间距，单位 tl */
  meanSeparation: number
  /** 段内真正通过门控的帧占比 */
  gateCoverage: number
}

export interface TrackQuality {
  totalFrames: number
  framesWithBothFencers: number
  bothCoverage: number
  validSegments: number
  validFrames: number
  validCoverage: number
  trackIds?: number
}

export interface PoseTrack {
  fps: number
  width: number
  height: number
  frames: FrameSample[]
  /** 提取器标识，用于溯源 */
  extractor: string
  extractedAt: string
  /**
   * 时间基准。'pts' 表示每帧时间来自容器的真实显示时间戳；
   * 'nominal-fps' 表示退化为「帧号÷帧率」——素材若为可变帧率，
   * 后者的误差可达数百毫秒，此时一切时序结论都应打折看待。
   */
  timebase?: 'pts' | 'nominal-fps'
  /**
   * 转码后用于回放的那份视频，每帧的时间戳。
   * 与 frames[i].t 通过帧序号一一对应，但数值不同：
   * t 是原片的高精度 PTS（分析与毫秒读数用），
   * clipPts 是压缩后视频的 PTS（播放器 seek 与画面对齐用）。
   * 转码无法兼顾体积与时间戳精度，所以两者分开存。
   */
  clipPts?: number[] 
  /** 通过几何门控的有效段；缺省时回退到能量法定位 */
  segments?: TrackSegment[]
  /** 各类帧被门控拒绝的原因计数，用于向用户解释「为什么这段不能分析」 */
  gateRejections?: Record<string, number>
  quality?: TrackQuality
}

// ─────────────────────────────────────────────
// 关键事件 —— 佩剑优先权判定的四个可测量时刻
// ─────────────────────────────────────────────

export type EventKind =
  | 'front_foot_start' // 前脚启动向前
  | 'arm_extension_start' // 持剑臂开始伸展
  | 'rear_foot_advance' // 后脚跟进
  | 'front_foot_land' // 前脚落地
  | 'blade_contact' // 剑尖触及有效部位（估算）
  | 'arm_withdraw' // 收手（丧失优先权）

export interface MotionEvent {
  kind: EventKind
  side: Side
  frame: number
  t: number
  confidence: number
  epistemic: EpistemicKind
  /** 触发该事件的测量值与阈值 */
  measure: { name: string; value: number; unit: string; threshold: number }
  /** 检测所依据的帧窗口 */
  window: [number, number]
}

// ─────────────────────────────────────────────
// 判罚情境（来自专家先验分类）
// ─────────────────────────────────────────────

export type ScenarioKey =
  | 'simultaneous_start'
  | 'attack_derobement'
  | 'preparation_vs_attack'
  | 'attack_no'
  | 'retreat_counter'
  | 'simultaneous'
  | 'remise'
  | 'parry_riposte'
  | 'withdraw_arm'
  | 'direct_attack'
  | 'abandoned'

export type Verdict = Side | 'simultaneous' | 'insufficient'

// ─────────────────────────────────────────────
// 一次完整裁决
// ─────────────────────────────────────────────

export interface CaseAnalysis {
  caseId: string
  /** 顶层结论 */
  verdict: Verdict
  verdictConfidence: number
  verdictStatus: ReviewStatus
  /** 全部证据链节点（DAG） */
  nodes: ChainNode[]
  /** 检测到的事件 */
  events: MotionEvent[]
  /** 本次分析使用的假设集合 */
  assumptions: Assumption[]
  /** 冲突提示 */
  conflicts: ConflictNote[]
  /** 专家标注（若为基准集案例），用于核对 */
  expertVerdict?: Verdict
  analyzedAt: string
}

export interface ConflictNote {
  id: string
  severity: 'high' | 'medium' | 'low'
  title: string
  detail: string
  nodeIds: string[]
  /** 建议的处理方式 */
  suggestion: string
}

// ─────────────────────────────────────────────
// 案例（素材 + 元数据）
// ─────────────────────────────────────────────

export interface CaseMeta {
  id: string
  title: string
  scenario: ScenarioKey
  scenarioZh: string
  scenarioDesc: string
  /** 专家标注的判罚归属 */
  expertVerdict: Verdict
  /** 画面地址：内置案例是仓库内相对路径，使用者上传的是 blob: 对象地址 */
  file: string
  fps: number
  width: number
  height: number
  duration: number
  frames: number
  slowMotion: boolean
  /** 是否内置了预提取的骨骼数据 */
  hasTrack: boolean
}

/** 应用的主视图。定义在 domain 层，供角色模型引用而不必反向依赖 store。 */
export type View = 'library' | 'workbench' | 'insight' | 'method' | 'rulebook'
