/**
 * 基准评测：在全部已提取的素材上跑推理引擎，产出可下钻的研究结论。
 *
 * 这一步是「循证分析」的数据来源。它要回答的不是「我们的准确率多高」
 * 这种自吹式指标，而是几个真正有研究价值的问题：
 *   · 两套判据口径在哪些情境下会分歧？分歧率多少？
 *   · 有多少剑的时差小到根本不该宣称先后？
 *   · 系统的结论对假设有多敏感？哪些情境天然不稳？
 * 每一条聚合结论都必须能点回到具体是哪几剑。
 *
 * 用法: npx tsx tools/benchmark.ts [--tracks data/tracks] [--out public/benchmark.json]
 */

import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { analyzeCase } from '../src/domain/analyze'
import { defaultAssumptions } from '../src/domain/assumptions'
import { robustnessOf } from '../src/domain/sensitivity'
import type { PoseTrack, ScenarioKey, Verdict } from '../src/domain/types'

interface ManifestItem {
  id: string
  file: string
  scenario: ScenarioKey
  scenarioZh: string
  scenarioDesc: string
  expertVerdict: 'left' | 'right' | 'simultaneous' | 'unlabeled'
  fps: number
  width: number
  height: number
  duration: number
  frames: number
  slowMotion: boolean
}

interface CaseResult {
  id: string
  scenario: ScenarioKey
  scenarioZh: string
  expertVerdict: Verdict | 'unlabeled'
  verdict: Verdict
  confidence: number
  /** 两个口径各自的结论 */
  fieVerdict: Verdict
  practiceVerdict: Verdict
  fieDeltaMs: number | null
  practiceDeltaMs: number | null
  doctrinesDisagree: boolean
  agreesWithExpert: boolean | null
  conflicts: Array<{ id: string; severity: string; title: string }>
  validCoverage: number
  robustness: number | null
  decisiveAssumptions: string[]
  bothCoverage: number
}

const args = process.argv.slice(2)
const argOf = (k: string, d: string) => {
  const i = args.indexOf(k)
  return i >= 0 && args[i + 1] ? args[i + 1] : d
}

const TRACKS = argOf('--tracks', 'data/tracks')
const OUT = argOf('--out', 'public/benchmark.json')
const MANIFEST = argOf('--manifest', 'tools/dataset_manifest.json')
const withSweep = !args.includes('--no-sweep')

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as { items: ManifestItem[] }
const byId = new Map(manifest.items.map((i) => [i.id, i]))

const files = existsSync(TRACKS)
  ? readdirSync(TRACKS).filter((f) => f.endsWith('.json'))
  : []

if (!files.length) {
  console.error(`${TRACKS} 下没有 track 文件。先运行 tools/extract_pose_yolo.py --batch`)
  process.exit(1)
}

const assumptions = defaultAssumptions()
const results: CaseResult[] = []

for (const f of files) {
  const id = f.replace(/\.json$/, '')
  const meta = byId.get(id)
  if (!meta) continue

  let track: PoseTrack
  try {
    track = JSON.parse(readFileSync(join(TRACKS, f), 'utf8'))
  } catch {
    continue
  }

  const expert: Verdict | 'unlabeled' =
    meta.expertVerdict === 'unlabeled' ? 'unlabeled' : meta.expertVerdict

  const { analysis } = analyzeCase(id, track, assumptions, {
    expertVerdict: expert === 'unlabeled' ? undefined : expert,
    scenarioZh: meta.scenarioZh,
  })

  const fieNode = analysis.nodes.find((n) => n.id === 'jdg.fie_text')
  const pracNode = analysis.nodes.find((n) => n.id === 'jdg.practice_footfirst')
  const fieDelta = analysis.nodes.find((n) => n.id === 'dat.delta.fie_text')
  const pracDelta = analysis.nodes.find((n) => n.id === 'dat.delta.practice_footfirst')

  const readVerdict = (claim: string | undefined): Verdict => {
    if (!claim) return 'insufficient'
    if (claim.includes('左方先取得')) return 'left'
    if (claim.includes('右方先取得')) return 'right'
    if (claim.includes('同时动作')) return 'simultaneous'
    return 'insufficient'
  }

  const fieVerdict = readVerdict(fieNode?.claim)
  const practiceVerdict = readVerdict(pracNode?.claim)

  let robustness: number | null = null
  let decisive: string[] = []
  if (withSweep && analysis.verdict !== 'insufficient') {
    try {
      const rep = robustnessOf(id, track, assumptions, [
        'simultaneity_window',
        'arm_ext_rate',
        'foot_start_speed',
      ])
      robustness = rep.overall
      decisive = rep.decisiveAssumptions
    } catch {
      robustness = null
    }
  }

  results.push({
    id,
    scenario: meta.scenario,
    scenarioZh: meta.scenarioZh,
    expertVerdict: expert,
    verdict: analysis.verdict,
    confidence: Math.round(analysis.verdictConfidence * 1000) / 1000,
    fieVerdict,
    practiceVerdict,
    fieDeltaMs: fieDelta?.value ?? null,
    practiceDeltaMs: pracDelta?.value ?? null,
    doctrinesDisagree: fieVerdict !== practiceVerdict,
    agreesWithExpert: expert === 'unlabeled' ? null : analysis.verdict === expert,
    conflicts: analysis.conflicts.map((c) => ({
      id: c.id,
      severity: c.severity,
      title: c.title,
    })),
    validCoverage: track.quality?.validCoverage ?? 0,
    bothCoverage: track.quality?.bothCoverage ?? 0,
    robustness,
    decisiveAssumptions: decisive,
  })

  process.stderr.write(
    `${id.padEnd(42)} 系统=${analysis.verdict.padEnd(12)} 专家=${expert.padEnd(10)} ` +
      `条文=${fieVerdict.padEnd(12)} 实践=${practiceVerdict}\n`,
  )
}

// ── 聚合 ──

const labelled = results.filter((r) => r.agreesWithExpert !== null)
// 「给出结论」包含判「同时」：那同样是一个可被检验的明确判断。
// 只有输出「证据不足」才算弃权。
const decided = labelled.filter((r) => r.verdict !== 'insufficient')

const byScenario = new Map<
  string,
  {
    scenarioZh: string
    total: number
    labelled: number
    decided: number
    decidedLabelled: number
    agree: number
    disagreeDoctrines: number
    simultaneous: number
    insufficient: number
    meanValidCoverage: number
    ids: string[]
  }
>()

for (const r of results) {
  const cur =
    byScenario.get(r.scenario) ??
    {
      scenarioZh: r.scenarioZh,
      total: 0,
      labelled: 0,
      decided: 0,
      decidedLabelled: 0,
      agree: 0,
      disagreeDoctrines: 0,
      simultaneous: 0,
      insufficient: 0,
      meanValidCoverage: 0,
      ids: [] as string[],
    }
  cur.total++
  cur.ids.push(r.id)
  cur.meanValidCoverage += r.validCoverage
  const isLabelled = r.expertVerdict !== 'unlabeled'
  if (isLabelled) cur.labelled++
  // 「给出归属」在这里包含判「同时」——那也是一个明确结论，
  // 只有「证据不足」才算没有结论。否则系统忍住不判反而会被算成失分。
  const gaveVerdict = r.verdict !== 'insufficient'
  if (r.verdict === 'left' || r.verdict === 'right') cur.decided++
  if (isLabelled && gaveVerdict) cur.decidedLabelled++
  if (r.verdict === 'simultaneous') cur.simultaneous++
  if (r.verdict === 'insufficient') cur.insufficient++
  if (r.agreesWithExpert) cur.agree++
  if (r.doctrinesDisagree) cur.disagreeDoctrines++
  byScenario.set(r.scenario, cur)
}

for (const v of byScenario.values()) {
  v.meanValidCoverage = Math.round((v.meanValidCoverage / Math.max(1, v.total)) * 1000) / 1000
}

const agreeCount = labelled.filter((r) => r.agreesWithExpert).length
const decidedAgree = decided.filter((r) => r.agreesWithExpert).length
const disagreeIds = results.filter((r) => r.doctrinesDisagree).map((r) => r.id)
const simIds = results.filter((r) => r.verdict === 'simultaneous').map((r) => r.id)
const insufficientIds = results.filter((r) => r.verdict === 'insufficient').map((r) => r.id)
const fragileIds = results
  .filter((r) => r.robustness !== null && r.robustness < 0.15)
  .map((r) => r.id)

// 两套判据口径各自的命中情况。这是本评测最有价值的一组数字：
// 它检验的不是「我们的模型准不准」，而是「FIE 条文口径和临场实践口径
// 哪一套更接近专家的实际判罚」——这是一个关于击剑判罚本身的问题。
const sided = labelled.filter((r) => r.expertVerdict === 'left' || r.expertVerdict === 'right')
const fieDecided = sided.filter((r) => r.fieVerdict === 'left' || r.fieVerdict === 'right')
const pracDecided = sided.filter(
  (r) => r.practiceVerdict === 'left' || r.practiceVerdict === 'right',
)
const fieHit = fieDecided.filter((r) => r.fieVerdict === r.expertVerdict).length
const pracHit = pracDecided.filter((r) => r.practiceVerdict === r.expertVerdict).length
const doctrineComparison = {
  sidedCases: sided.length,
  fie: {
    decided: fieDecided.length,
    agree: fieHit,
    rate: fieDecided.length ? Math.round((fieHit / fieDecided.length) * 1000) / 1000 : 0,
  },
  practice: {
    decided: pracDecided.length,
    agree: pracHit,
    rate: pracDecided.length ? Math.round((pracHit / pracDecided.length) * 1000) / 1000 : 0,
  },
}

const summary = {
  generatedAt: new Date().toISOString(),
  doctrineComparison,
  assumptions: assumptions.map((a) => ({ id: a.id, value: a.value, unit: a.unit })),
  totals: {
    cases: results.length,
    labelled: labelled.length,
    decided: decided.length,
    simultaneous: simIds.length,
    insufficient: insufficientIds.length,
  },
  accuracy: {
    /** 全部有标注案例中，系统结论与专家一致的比例（含系统判「同时/不足」的情形） */
    overall: labelled.length ? Math.round((agreeCount / labelled.length) * 1000) / 1000 : 0,
    /** 仅在系统给出明确归属的案例上计算 */
    whenDecided: decided.length
      ? Math.round((decidedAgree / decided.length) * 1000) / 1000
      : 0,
    decidedCount: decided.length,
    decidedAgree,
    agreeCount,
  },
  doctrineDisagreement: {
    count: disagreeIds.length,
    rate: results.length ? Math.round((disagreeIds.length / results.length) * 1000) / 1000 : 0,
    ids: disagreeIds,
  },
  abstention: {
    simultaneousIds: simIds,
    insufficientIds,
    rate: results.length
      ? Math.round(((simIds.length + insufficientIds.length) / results.length) * 1000) / 1000
      : 0,
  },
  fragile: { count: fragileIds.length, ids: fragileIds },
  byScenario: [...byScenario.entries()].map(([k, v]) => ({ scenario: k, ...v })),
  cases: results,
}

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify(summary, null, 2))

console.log()
console.log('═'.repeat(70))
console.log(`案例 ${results.length}  有标注 ${labelled.length}`)
console.log(
  `系统给出明确归属 ${decided.length} 例，其中与专家一致 ${decidedAgree} 例` +
    `（${(summary.accuracy.whenDecided * 100).toFixed(1)}%）`,
)
console.log(
  `判「同时」${simIds.length} 例，判「证据不足」${insufficientIds.length} 例` +
    `，弃权率 ${(summary.abstention.rate * 100).toFixed(1)}%`,
)
console.log(
  `两套判据口径分歧 ${disagreeIds.length} 例（${(summary.doctrineDisagreement.rate * 100).toFixed(1)}%）`,
)
console.log(`需人工复核（稳健度<15%）${fragileIds.length} 例`)
console.log(
  `判据口径对照：条文 ${fieHit}/${fieDecided.length} ` +
    `(${(doctrineComparison.fie.rate * 100).toFixed(1)}%)  ` +
    `实践 ${pracHit}/${pracDecided.length} ` +
    `(${(doctrineComparison.practice.rate * 100).toFixed(1)}%)`,
)
console.log('═'.repeat(70))
console.log(`已写入 ${OUT}`)
