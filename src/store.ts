/**
 * 应用状态。
 *
 * 一条原则：分析结果永远是「当前 track + 当前假设」的纯函数产物，
 * 不缓存中间结论。用户调一下阈值，整条证据链必须真的重算一遍，
 * 而不是改个显示数字——否则「可追问」就是假的。
 */

import { create } from 'zustand'
import { analyzeCase } from './domain/analyze'
import type { AnalysisBundle } from './domain/analyze'
import { defaultAssumptions, withAssumption } from './domain/assumptions'
import type {
  Assumption,
  CaseAnalysis,
  CaseMeta,
  ChainNode,
  PoseTrack,
  View,
} from './domain/types'
import type { Role } from './domain/roles'
import type { Weapon } from './domain/weapons'

export type { View } from './domain/types'

/** 裁判器（电子计分器）接入状态。硬件版将由串口/USB 提供真实灯信号。 */
export type ScoringBoxState = 'disconnected' | 'connecting' | 'connected' | 'simulated'

/**
 * 演示态的使用者身份。
 *
 * 这是界面收敛，不是鉴权：真实的账号、签名与权限校验要等硬件一体机版本，
 * 那时每条人工裁决都要绑定到具体裁判员。界面上如实这么写，
 * 不让人以为数据受了保护。能力定义见 domain/roles.ts。
 */
export interface Viewer {
  name: string
  role: Role
}

export interface HumanDecision {
  nodeId: string
  action: 'confirm' | 'override'
  claim?: string
  reason: string
  at: string
}

interface State {
  view: View
  weapon: Weapon
  scoringBox: ScoringBoxState
  viewer: Viewer | null
  cases: CaseMeta[]
  activeCase: CaseMeta | null
  track: PoseTrack | null
  bundle: AnalysisBundle | null
  assumptions: Assumption[]
  decisions: Record<string, HumanDecision>

  // 回放
  frame: number
  playing: boolean
  rate: number
  showSkeleton: boolean
  showBlade: boolean

  // 交互
  selectedNodeId: string | null
  expandedNodes: Set<string>
  loading: boolean
  error: string | null

  setView: (v: View) => void
  setWeapon: (w: Weapon) => void
  setScoringBox: (s: ScoringBoxState) => void
  signIn: (v: Viewer) => void
  signOut: () => void
  setCases: (c: CaseMeta[]) => void
  openCase: (meta: CaseMeta, track: PoseTrack) => void
  closeCase: () => void
  setAssumption: (id: string, value: number) => void
  resetAssumptions: () => void
  setFrame: (f: number) => void
  stepFrame: (d: number) => void
  setPlaying: (p: boolean) => void
  setRate: (r: number) => void
  toggleSkeleton: () => void
  toggleBlade: () => void
  selectNode: (id: string | null) => void
  toggleExpanded: (id: string) => void
  decide: (d: HumanDecision) => void
  clearDecision: (nodeId: string) => void
  setLoading: (b: boolean) => void
  setError: (e: string | null) => void
}

function recompute(
  meta: CaseMeta | null,
  track: PoseTrack | null,
  assumptions: Assumption[],
): AnalysisBundle | null {
  if (!meta || !track) return null
  try {
    return analyzeCase(meta.id, track, assumptions, {
      expertVerdict: meta.expertVerdict,
      scenarioZh: meta.scenarioZh,
    })
  } catch {
    return null
  }
}

export const useStore = create<State>((set, get) => ({
  view: 'library',
  weapon: 'sabre',
  scoringBox: 'disconnected',
  viewer: null,
  cases: [],
  activeCase: null,
  track: null,
  bundle: null,
  assumptions: defaultAssumptions(),
  decisions: {},

  frame: 0,
  playing: false,
  rate: 1,
  showSkeleton: true,
  showBlade: true,

  selectedNodeId: null,
  expandedNodes: new Set<string>(),
  loading: false,
  error: null,

  setView: (view) => set({ view }),
  setWeapon: (weapon) => set({ weapon }),
  setScoringBox: (scoringBox) => set({ scoringBox }),
  signIn: (viewer) => set({ viewer }),
  signOut: () => set({ viewer: null }),
  setCases: (cases) => set({ cases }),

  openCase: (meta, track) => {
    const assumptions = defaultAssumptions()
    const bundle = recompute(meta, track, assumptions)
    set({
      activeCase: meta,
      track,
      bundle,
      assumptions,
      decisions: {},
      view: 'workbench',
      // 打开就停在交锋瞬间：素材开头往往是黑场或慢放特写，
      // 停在第 0 帧会让人以为视频没加载出来。
      frame: bundle ? (bundle.clash?.frame ?? bundle.phrase.window[0]) : 0,
      playing: false,
      rate: 1,
      selectedNodeId: 'con.verdict',
      expandedNodes: new Set(['con.verdict']),
      error: null,
    })
  },

  closeCase: () =>
    set({
      activeCase: null,
      track: null,
      bundle: null,
      view: 'library',
      playing: false,
      selectedNodeId: null,
      decisions: {},
    }),

  setAssumption: (id, value) => {
    const { activeCase, track, assumptions } = get()
    const next = withAssumption(assumptions, id, value)
    set({ assumptions: next, bundle: recompute(activeCase, track, next) })
  },

  resetAssumptions: () => {
    const { activeCase, track } = get()
    const next = defaultAssumptions()
    set({ assumptions: next, bundle: recompute(activeCase, track, next) })
  },

  setFrame: (f) => {
    const total = get().track?.frames.length ?? 1
    set({ frame: Math.max(0, Math.min(total - 1, Math.round(f))) })
  },

  stepFrame: (d) => {
    const { frame, track } = get()
    const total = track?.frames.length ?? 1
    set({ frame: Math.max(0, Math.min(total - 1, frame + d)), playing: false })
  },

  setPlaying: (playing) => set({ playing }),
  setRate: (rate) => set({ rate }),
  toggleSkeleton: () => set((s) => ({ showSkeleton: !s.showSkeleton })),
  toggleBlade: () => set((s) => ({ showBlade: !s.showBlade })),

  selectNode: (selectedNodeId) => set({ selectedNodeId }),

  toggleExpanded: (id) =>
    set((s) => {
      const next = new Set(s.expandedNodes)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { expandedNodes: next }
    }),

  decide: (d) => set((s) => ({ decisions: { ...s.decisions, [d.nodeId]: d } })),

  clearDecision: (nodeId) =>
    set((s) => {
      const next = { ...s.decisions }
      delete next[nodeId]
      return { decisions: next }
    }),

  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
}))

/** 把人工裁决叠加到 AI 产出的节点上——AI 的结论永远不覆盖人的结论 */
export function applyDecisions(
  analysis: CaseAnalysis,
  decisions: Record<string, HumanDecision>,
): CaseAnalysis {
  if (!Object.keys(decisions).length) return analysis
  const nodes: ChainNode[] = analysis.nodes.map((n) => {
    const d = decisions[n.id]
    if (!d) return n
    if (d.action === 'confirm') {
      return { ...n, status: 'human_confirmed' as const, confidence: Math.max(n.confidence, 0.95) }
    }
    return {
      ...n,
      status: 'human_overridden' as const,
      humanOverride: { claim: d.claim ?? n.claim, reason: d.reason, by: '裁判', at: d.at },
    }
  })
  return { ...analysis, nodes }
}
