/**
 * 公开构建的素材裁剪。
 *
 * 素材是巴黎 2024 奥运会转播画面，版权归原转播方。本地研究不受影响，
 * 但公开托管要克制：只留白名单里的几段，其余从 dist 里删掉。
 * 对应案例仍然可以打开——骨骼是我们自己的衍生数据，证据链一条不少。
 *
 * 白名单与 src/lib/clipAccess.ts 必须一致，这里直接从那个文件读，
 * 避免两处各写一份、改了一处忘了另一处。
 */

import { readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SOURCE_OF_TRUTH = 'src/lib/clipAccess.ts'
const CLIP_DIR = 'dist/clips'

/** 从 clipAccess.ts 里解析出白名单，保证只有一处定义 */
function readWhitelist() {
  const src = readFileSync(SOURCE_OF_TRUTH, 'utf8')
  const block = src.match(/PUBLIC_CLIP_IDS[^=]*=\s*\[([\s\S]*?)\]/)
  if (!block) throw new Error(`没能在 ${SOURCE_OF_TRUTH} 里找到 PUBLIC_CLIP_IDS`)
  const ids = [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
  if (!ids.length) throw new Error('白名单是空的，拒绝继续——那会删掉全部素材')
  return new Set(ids)
}

const keep = readWhitelist()

let removed = 0
let removedBytes = 0
let kept = 0

for (const file of readdirSync(CLIP_DIR)) {
  if (!file.endsWith('.mp4')) continue
  const id = file.slice(0, -4)
  const path = join(CLIP_DIR, file)
  if (keep.has(id)) {
    kept += 1
    continue
  }
  removedBytes += statSync(path).size
  rmSync(path)
  removed += 1
}

const mb = (n) => (n / 1e6).toFixed(1)
console.log(`公开构建素材裁剪：保留 ${kept} 段，移除 ${removed} 段（省下 ${mb(removedBytes)} MB）`)

const missing = [...keep].filter((id) => {
  try {
    statSync(join(CLIP_DIR, `${id}.mp4`))
    return false
  } catch {
    return true
  }
})
if (missing.length) {
  console.error(`白名单里这几段本地没有，线上会缺画面：\n  ${missing.join('\n  ')}`)
  process.exit(1)
}
