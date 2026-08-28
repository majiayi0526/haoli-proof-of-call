/**
 * 证据帧截图。
 *
 * 裁判在场边未必愿意点开一层层的证据链，更常见的诉求是：
 * 「把那一帧给我，告诉我是第几秒」。这里把画面、骨骼叠加、时间码
 * 和该帧对应的证据说明合成成一张可以直接看、直接存、直接发的图。
 */

import type { NarratedEvent } from '../domain/narrate'
import { drawSkeleton, fitContain } from './draw'
import type { Side, Skeleton } from '../domain/types'

const BG = '#141619'
const TEXT = '#f2f3f5'
const DIM = '#8b93a1'
const LEFT = '#f0453a'
const RIGHT = '#22c07a'
const PISTE = '#1b1e23'

export interface CaptureInput {
  /** 画面层。线上未分发转播片段时为 null，此时只画骨骼与证据 */
  video: HTMLVideoElement | null
  skeletons: { left?: Skeleton; right?: Skeleton }
  videoWidth: number
  videoHeight: number
  frame: number
  timeMs: number
  bladeRatio: number
  /** 该帧对应的证据（可能为空） */
  events: NarratedEvent[]
  caseTitle: string
  /** 顶部结论一句话 */
  verdictLine?: string
}

const PAD = 28
const FOOTER = 132
const MAX_W = 1280

/** 把当前帧连同骨骼与证据说明画成一张 PNG，返回 dataURL */
export function captureEvidenceFrame(input: CaptureInput): string | null {
  const { video, videoWidth: vw, videoHeight: vh } = input
  if (!vw || !vh) return null

  const scale = Math.min(1, MAX_W / vw)
  const w = Math.round(vw * scale)
  const h = Math.round(vh * scale)

  const canvas = document.createElement('canvas')
  canvas.width = w + PAD * 2
  canvas.height = h + PAD * 2 + FOOTER
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.fillStyle = BG
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // 画面。没有转播画面时留一块剑道底色，并写明画面为何缺席——
  // 截图会被单独转发出去，不能让人以为是导出失败。
  if (video) {
    try {
      ctx.drawImage(video, PAD, PAD, w, h)
    } catch {
      return null
    }
  } else {
    ctx.fillStyle = PISTE
    ctx.fillRect(PAD, PAD, w, h)
    ctx.fillStyle = DIM
    ctx.font = '500 15px ui-sans-serif, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('转播画面未随线上版本分发 · 骨骼与证据链完整', PAD + w / 2, PAD + 26)
    ctx.textAlign = 'left'
  }

  // 骨骼叠加：直接复用回放台的绘制，保证截图和屏幕上看到的一致
  const fit = fitContain(vw, vh, w, h)
  const opts = {
    scale: fit.scale,
    offsetX: fit.offsetX + PAD,
    offsetY: fit.offsetY + PAD,
    showSkeleton: true,
    showBlade: true,
    bladeRatio: input.bladeRatio,
    emphasise: null,
  }
  for (const side of ['left', 'right'] as Side[]) {
    const sk = input.skeletons[side]
    if (sk) drawSkeleton(ctx, sk, side, opts)
  }

  // 画面上的时间码
  const tc = `${(input.timeMs / 1000).toFixed(2)}s · f${input.frame}`
  ctx.font = '700 15px ui-monospace, SF Mono, Menlo, monospace'
  const tcW = ctx.measureText(tc).width + 18
  ctx.fillStyle = 'rgba(10,11,13,0.82)'
  ctx.fillRect(PAD + w - tcW - 10, PAD + h - 34, tcW, 26)
  ctx.fillStyle = TEXT
  ctx.fillText(tc, PAD + w - tcW, PAD + h - 16)

  // 分隔线
  const footY = PAD + h + 18
  ctx.strokeStyle = '#333a45'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(PAD, footY - 8)
  ctx.lineTo(PAD + w, footY - 8)
  ctx.stroke()

  // 结论
  let y = footY + 14
  if (input.verdictLine) {
    ctx.font =
      '650 17px -apple-system, BlinkMacSystemFont, PingFang SC, Hiragino Sans GB, sans-serif'
    ctx.fillStyle = TEXT
    ctx.fillText(input.verdictLine, PAD, y)
    y += 26
  }

  // 该帧的证据
  ctx.font =
    '400 13px -apple-system, BlinkMacSystemFont, PingFang SC, Hiragino Sans GB, sans-serif'
  if (input.events.length) {
    for (const e of input.events.slice(0, 3)) {
      const color = e.event.side === 'left' ? LEFT : RIGHT
      ctx.fillStyle = color
      ctx.fillRect(PAD, y - 10, 3, 13)
      ctx.fillStyle = TEXT
      const label = `${(e.ms / 1000).toFixed(2)}s  ${e.headline}${e.estimated ? '（估算）' : ''}`
      ctx.fillText(label, PAD + 12, y)
      if (e.rule) {
        const lw = ctx.measureText(label).width
        ctx.fillStyle = DIM
        ctx.font = '600 11px ui-monospace, SF Mono, Menlo, monospace'
        ctx.fillText(e.rule, PAD + 12 + lw + 10, y)
        ctx.font =
          '400 13px -apple-system, BlinkMacSystemFont, PingFang SC, Hiragino Sans GB, sans-serif'
      }
      y += 20
    }
  } else {
    ctx.fillStyle = DIM
    ctx.fillText('本帧无判罚证据', PAD, y)
    y += 20
  }

  // 页脚：来源与免责
  ctx.font = '400 11px -apple-system, BlinkMacSystemFont, PingFang SC, sans-serif'
  ctx.fillStyle = DIM
  ctx.fillText(
    `${input.caseTitle}　·　毫厘 PROOF OF CALL 生成　·　依 FIE t.100，判罚权归裁判员，本图仅为辅助证据`,
    PAD,
    canvas.height - 16,
  )

  return canvas.toDataURL('image/png')
}

export function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}
