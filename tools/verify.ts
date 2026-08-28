/**
 * 在真实素材上跑整条推理链，把证据链打印成文本。
 *
 * 这个脚本的存在本身就是设计约束的一部分：如果一条判罚结论无法在
 * 纯文本里被完整复述和检查，它在界面上做得再好看也是黑箱。
 *
 * 用法: npx tsx tools/verify.ts <track.json> [--sweep]
 */

import { readFileSync } from 'node:fs'
import { analyzeCase } from '../src/domain/analyze'
import { defaultAssumptions } from '../src/domain/assumptions'
import { robustnessOf } from '../src/domain/sensitivity'
import type { ChainNode, PoseTrack, Verdict } from '../src/domain/types'

const EPI: Record<string, string> = {
  observed: '观测',
  derived: '推算',
  estimated: '估算',
  ruled: '规则',
  asserted: '断言',
}

const VERDICT_ZH: Record<Verdict, string> = {
  left: '判给左方',
  right: '判给右方',
  simultaneous: '同时（双方不得分）',
  insufficient: '证据不足',
}

function bar(v: number, width = 12): string {
  const n = Math.round(Math.max(0, Math.min(1, v)) * width)
  return '█'.repeat(n) + '░'.repeat(width - n)
}

function printNode(n: ChainNode, indent = '  ') {
  const conf = `${bar(n.confidence, 10)} ${(n.confidence * 100).toFixed(0).padStart(3)}%`
  console.log(`${indent}[${EPI[n.epistemic]}] ${n.claim}`)
  console.log(`${indent}      置信 ${conf}   层=${n.layer}   id=${n.id}`)
  if (n.formula) console.log(`${indent}      公式 ${n.formula}`)
  if (n.sources.length) console.log(`${indent}      信源 ${n.sources.join(', ')}`)
  if (n.assumptions.length) console.log(`${indent}      假设 ${n.assumptions.join(', ')}`)
  if (n.basis.length) console.log(`${indent}      依据 ${n.basis.join(' + ')}`)
}

const file = process.argv[2]
if (!file) {
  console.error('用法: npx tsx tools/verify.ts <track.json> [--sweep]')
  process.exit(1)
}

const raw = JSON.parse(readFileSync(file, 'utf8'))
const track: PoseTrack = raw

console.log('═'.repeat(72))
console.log('素材')
console.log('═'.repeat(72))
console.log(`  提取器      ${track.extractor}`)
console.log(`  分辨率      ${track.width}×${track.height} @ ${track.fps} fps`)
console.log(`  总帧数      ${track.frames.length}`)
if (track.quality) {
  const q = track.quality
  console.log(`  双人覆盖率  ${(q.bothCoverage * 100).toFixed(1)}%`)
  console.log(`  有效帧      ${q.validFrames} (${(q.validCoverage * 100).toFixed(1)}%)`)
}
if (track.segments?.length) {
  for (const s of track.segments) {
    console.log(
      `  有效段      帧 ${s.start}–${s.end}  ${s.seconds}s  间距 ${s.meanSeparation} tl  门控覆盖 ${(s.gateCoverage * 100).toFixed(0)}%`,
    )
  }
}
if (track.gateRejections) {
  console.log('  门控拒绝    ' +
    Object.entries(track.gateRejections).map(([k, v]) => `${k}×${v}`).join('  '))
}

const assumptions = defaultAssumptions()
const { analysis, seriesLeft, seriesRight, phrase } = analyzeCase(
  'verify',
  track,
  assumptions,
)

console.log()
console.log('═'.repeat(72))
console.log('运动学解析')
console.log('═'.repeat(72))
for (const s of [seriesLeft, seriesRight]) {
  const validScale = s.scale.filter(Number.isFinite)
  const mean = validScale.reduce((a, b) => a + b, 0) / Math.max(1, validScale.length)
  console.log(
    `  ${s.side === 'left' ? '左方' : '右方'}  面向=${s.dir > 0 ? '右' : '左'}  ` +
      `持剑臂=${s.weaponArm}  前脚=${s.frontLeg}  平均躯干长度=${mean.toFixed(1)}px`,
  )
}
console.log(`  分析窗口   帧 ${phrase.window[0]}–${phrase.window[1]}  置信 ${phrase.confidence.toFixed(2)}`)

console.log()
console.log('═'.repeat(72))
console.log('检测到的关键时刻')
console.log('═'.repeat(72))
if (!analysis.events.length) {
  console.log('  （无）')
}
for (const e of analysis.events) {
  const side = e.side === 'left' ? '左' : '右'
  console.log(
    `  ${side}  ${e.kind.padEnd(20)} 帧 ${String(e.frame).padStart(4)}  ` +
      `${String(Math.round(e.t * 1000)).padStart(5)} ms  ` +
      `置信 ${(e.confidence * 100).toFixed(0).padStart(3)}%  [${EPI[e.epistemic]}]`,
  )
  console.log(
    `      ${e.measure.name} = ${e.measure.value} ${e.measure.unit} ` +
      `(阈值 ${e.measure.threshold})`,
  )
}

console.log()
console.log('═'.repeat(72))
console.log('证据链')
console.log('═'.repeat(72))
const order: ChainNode['layer'][] = [
  'question', 'source', 'evidence', 'datum', 'finding', 'judgment', 'conclusion',
]
for (const layer of order) {
  const ns = analysis.nodes.filter((n) => n.layer === layer)
  if (!ns.length) continue
  console.log(`\n── ${layer} ──`)
  for (const n of ns) printNode(n)
}

console.log()
console.log('═'.repeat(72))
console.log('冲突')
console.log('═'.repeat(72))
if (!analysis.conflicts.length) console.log('  （无）')
for (const c of analysis.conflicts) {
  console.log(`  [${c.severity.toUpperCase()}] ${c.title}`)
  console.log(`     ${c.detail}`)
  console.log(`     建议：${c.suggestion}`)
}

console.log()
console.log('═'.repeat(72))
console.log('结论')
console.log('═'.repeat(72))
console.log(`  ${VERDICT_ZH[analysis.verdict]}`)
console.log(`  置信 ${bar(analysis.verdictConfidence)} ${(analysis.verdictConfidence * 100).toFixed(0)}%`)
console.log(`  状态 ${analysis.verdictStatus}（模型候选，未经裁判确认）`)

if (process.argv.includes('--sweep')) {
  console.log()
  console.log('═'.repeat(72))
  console.log('敏感性：换个假设，结论还成立吗')
  console.log('═'.repeat(72))
  const rep = robustnessOf('verify', track, assumptions)
  console.log(`  整体稳健度 ${bar(rep.overall)} ${(rep.overall * 100).toFixed(0)}%`)
  for (const s of rep.sweeps) {
    const bp = s.breakpoint === null ? '范围内不翻转' : `翻转临界值 ${s.breakpoint} ${s.unit}`
    const flag = s.decisive ? ' ← 决定性假设' : ''
    console.log(`  ${s.label.padEnd(18)} 当前 ${s.current} ${s.unit}   ${bp}${flag}`)
  }
  if (rep.decisiveAssumptions.length) {
    console.log(`\n  本例结论由这些假设决定：${rep.decisiveAssumptions.join(', ')}`)
    console.log('  ——它们必须在界面上让裁判看见并可调，否则「可追问」就是假的。')
  }
}
