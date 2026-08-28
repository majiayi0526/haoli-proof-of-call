/**
 * 骨骼与证据的画布绘制。
 *
 * 绘制上的一条规矩：观测量用实线，估算量用虚线。
 * 剑尖是外推出来的，如果它和真实测得的关节画成一样，
 * 看的人就会把猜测当成事实。
 */

import type { JointName, Side, Skeleton } from '../domain/types'

const BONES: Array<[JointName, JointName]> = [
  ['left_shoulder', 'right_shoulder'],
  ['left_shoulder', 'left_elbow'],
  ['left_elbow', 'left_wrist'],
  ['right_shoulder', 'right_elbow'],
  ['right_elbow', 'right_wrist'],
  ['left_shoulder', 'left_hip'],
  ['right_shoulder', 'right_hip'],
  ['left_hip', 'right_hip'],
  ['left_hip', 'left_knee'],
  ['left_knee', 'left_ankle'],
  ['right_hip', 'right_knee'],
  ['right_knee', 'right_ankle'],
]

const HEAD: Array<[JointName, JointName]> = [
  ['nose', 'left_eye'],
  ['nose', 'right_eye'],
  ['left_eye', 'left_ear'],
  ['right_eye', 'right_ear'],
]

export const SIDE_COLOR: Record<Side, string> = {
  left: 'oklch(63% 0.215 25)',
  right: 'oklch(72% 0.185 155)',
}

const ESTIMATED_COLOR = 'oklch(70% 0.16 305)'
const MIN_C = 0.3

export interface DrawOpts {
  /** 画布相对视频的缩放 */
  scale: number
  offsetX: number
  offsetY: number
  showSkeleton: boolean
  showBlade: boolean
  /** 高亮的一方（当前被追问的证据属于谁） */
  emphasise?: Side | null
  /** 剑尖外推比例（肩宽倍数） */
  bladeRatio: number
}

function px(v: number, s: number, o: number) {
  return v * s + o
}

export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  sk: Skeleton,
  side: Side,
  opts: DrawOpts,
) {
  const { scale, offsetX, offsetY } = opts
  const color = SIDE_COLOR[side]
  const dim = opts.emphasise && opts.emphasise !== side
  ctx.globalAlpha = dim ? 0.35 : 1

  if (opts.showSkeleton) {
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    // 外描边让骨架在浅色剑道上也看得清
    for (const pass of [0, 1]) {
      ctx.strokeStyle = pass === 0 ? 'oklch(12% 0 0 / 0.65)' : color
      ctx.lineWidth = pass === 0 ? 6 : 2.5
      ctx.beginPath()
      for (const [a, b] of [...BONES, ...HEAD]) {
        const ja = sk[a]
        const jb = sk[b]
        if (!ja || !jb || ja.c < MIN_C || jb.c < MIN_C) continue
        ctx.moveTo(px(ja.x, scale, offsetX), px(ja.y, scale, offsetY))
        ctx.lineTo(px(jb.x, scale, offsetX), px(jb.y, scale, offsetY))
      }
      ctx.stroke()
    }

    // 关节点：半径随置信度变化，低置信度的点自己就小一圈
    for (const name of Object.keys(sk) as JointName[]) {
      const j = sk[name]
      if (!j || j.c < MIN_C) continue
      const r = 2 + j.c * 2.2
      ctx.beginPath()
      ctx.arc(px(j.x, scale, offsetX), px(j.y, scale, offsetY), r, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
      ctx.lineWidth = 1
      ctx.strokeStyle = 'oklch(12% 0 0 / 0.8)'
      ctx.stroke()
    }
  }

  if (opts.showBlade) drawBlade(ctx, sk, opts)
  ctx.globalAlpha = 1
}

/** 估算剑身：虚线 + 空心端点，明确表示这不是观测到的东西 */
function drawBlade(ctx: CanvasRenderingContext2D, sk: Skeleton, opts: DrawOpts) {
  const { scale, offsetX, offsetY, bladeRatio } = opts
  const ls = sk.left_shoulder
  const rs = sk.right_shoulder
  if (!ls || !rs || ls.c < MIN_C || rs.c < MIN_C) return
  const sw = Math.hypot(ls.x - rs.x, ls.y - rs.y)
  if (sw < 4) return

  // 持剑臂：腕关节离躯干中心更远的一侧
  const cx = (ls.x + rs.x) / 2
  const cands: Array<[JointName, JointName]> = [
    ['left_elbow', 'left_wrist'],
    ['right_elbow', 'right_wrist'],
  ]
  let best: { e: { x: number; y: number }; w: { x: number; y: number } } | null = null
  let bestD = -1
  for (const [ek, wk] of cands) {
    const e = sk[ek]
    const w = sk[wk]
    if (!e || !w || e.c < MIN_C || w.c < MIN_C) continue
    const d = Math.abs(w.x - cx)
    if (d > bestD) {
      bestD = d
      best = { e, w }
    }
  }
  if (!best) return

  const vx = best.w.x - best.e.x
  const vy = best.w.y - best.e.y
  const n = Math.hypot(vx, vy)
  if (n < 1e-3) return
  const tipX = best.w.x + (vx / n) * bladeRatio * sw
  const tipY = best.w.y + (vy / n) * bladeRatio * sw

  ctx.save()
  ctx.setLineDash([5, 4])
  ctx.strokeStyle = ESTIMATED_COLOR
  ctx.lineWidth = 1.75
  ctx.beginPath()
  ctx.moveTo(px(best.w.x, scale, offsetX), px(best.w.y, scale, offsetY))
  ctx.lineTo(px(tipX, scale, offsetX), px(tipY, scale, offsetY))
  ctx.stroke()
  ctx.setLineDash([])
  ctx.beginPath()
  ctx.arc(px(tipX, scale, offsetX), px(tipY, scale, offsetY), 4, 0, Math.PI * 2)
  ctx.strokeStyle = ESTIMATED_COLOR
  ctx.lineWidth = 1.75
  ctx.stroke()
  ctx.restore()
}

/** 在关键关节上打标记，指出当前证据看的是哪一个点 */
export function drawFocus(
  ctx: CanvasRenderingContext2D,
  sk: Skeleton,
  joints: JointName[],
  side: Side,
  opts: DrawOpts,
  label?: string,
) {
  const { scale, offsetX, offsetY } = opts
  const color = SIDE_COLOR[side]
  for (const name of joints) {
    const j = sk[name]
    if (!j || j.c < MIN_C) continue
    const x = px(j.x, scale, offsetX)
    const y = px(j.y, scale, offsetY)
    ctx.save()
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(x, y, 13, 0, Math.PI * 2)
    ctx.stroke()
    ctx.globalAlpha = 0.25
    ctx.beginPath()
    ctx.arc(x, y, 13, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
    ctx.restore()
  }
  if (label && joints.length) {
    const j = sk[joints[0]]
    if (j && j.c >= MIN_C) {
      const x = px(j.x, scale, offsetX)
      const y = px(j.y, scale, offsetY)
      ctx.save()
      ctx.font =
        "600 11px ui-monospace, 'SF Mono', Menlo, monospace"
      const w = ctx.measureText(label).width + 12
      ctx.fillStyle = 'oklch(12% 0 0 / 0.85)'
      ctx.fillRect(x + 16, y - 20, w, 18)
      ctx.fillStyle = color
      ctx.fillText(label, x + 22, y - 7)
      ctx.restore()
    }
  }
}

/** 计算 video 在容器中的 contain 布局 */
export function fitContain(
  vw: number,
  vh: number,
  cw: number,
  ch: number,
): { scale: number; offsetX: number; offsetY: number; width: number; height: number } {
  if (!vw || !vh || !cw || !ch) {
    return { scale: 1, offsetX: 0, offsetY: 0, width: cw, height: ch }
  }
  const scale = Math.min(cw / vw, ch / vh)
  const width = vw * scale
  const height = vh * scale
  return { scale, offsetX: (cw - width) / 2, offsetY: (ch - height) / 2, width, height }
}
