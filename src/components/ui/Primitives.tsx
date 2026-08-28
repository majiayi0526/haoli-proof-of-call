import type { ReactNode } from 'react'
import type { EpistemicKind, ReviewStatus, Side, Verdict } from '../../domain/types'
import './primitives.css'

// ─────────────────────────────────────────────
// 认识论标签 —— 本产品最重要的一个视觉元件
// ─────────────────────────────────────────────

const EPISTEMIC_META: Record<EpistemicKind, { zh: string; hint: string }> = {
  observed: { zh: '观测', hint: '直接从骨骼关键点测得，误差来自姿态检测器' },
  derived: { zh: '推算', hint: '由观测量按公式计算，误差沿链条传播' },
  estimated: { zh: '估算', hint: '模型补全的量，含结构性假设，置信度被压制' },
  ruled: { zh: '规则', hint: '来自 FIE 规则条文，非经验量' },
  asserted: { zh: '断言', hint: '由人直接指定' },
}

export function EpistemicTag({ kind, compact }: { kind: EpistemicKind; compact?: boolean }) {
  const m = EPISTEMIC_META[kind]
  return (
    <span
      className={`epi epi--${kind}${compact ? ' epi--compact' : ''}`}
      title={m.hint}
      data-kind={kind}
    >
      {m.zh}
    </span>
  )
}

// ─────────────────────────────────────────────
// 置信度
// ─────────────────────────────────────────────

export function Confidence({
  value,
  label,
  size = 'md',
}: {
  value: number
  label?: string
  size?: 'sm' | 'md'
}) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100)
  const level = pct >= 70 ? 'high' : pct >= 40 ? 'mid' : 'low'
  return (
    <span className={`conf conf--${size}`} title={`置信度 ${pct}%`}>
      {label && <span className="conf__label">{label}</span>}
      <span className="conf__track">
        <span className={`conf__fill conf__fill--${level}`} style={{ width: `${pct}%` }} />
      </span>
      <span className="conf__num num">{pct}%</span>
    </span>
  )
}

// ─────────────────────────────────────────────
// 人机协作状态
// ─────────────────────────────────────────────

const STATUS_META: Record<ReviewStatus, { zh: string; hint: string }> = {
  ai_proposed: { zh: '模型候选', hint: '系统产出，尚未经裁判确认，不构成事实' },
  human_confirmed: { zh: '已确认', hint: '裁判已核对证据并确认' },
  human_overridden: { zh: '已推翻', hint: '裁判推翻了系统结论并给出理由' },
  disputed: { zh: '有争议', hint: '存在冲突证据，待裁定' },
  insufficient: { zh: '证据不足', hint: '关键证据缺失，系统拒绝下结论' },
}

export function StatusTag({ status }: { status: ReviewStatus }) {
  const m = STATUS_META[status]
  return (
    <span className={`status status--${status}`} title={m.hint}>
      {m.zh}
    </span>
  )
}

// ─────────────────────────────────────────────
// 记分灯 —— 左红右绿，沿用 FIE 记分器的既有语言
// ─────────────────────────────────────────────

export function Lamp({
  verdict,
  size = 'md',
}: {
  verdict: Verdict
  size?: 'sm' | 'md' | 'lg'
}) {
  const on: Record<Verdict, [boolean, boolean, boolean]> = {
    left: [true, false, false],
    right: [false, false, true],
    simultaneous: [true, true, true],
    insufficient: [false, true, false],
  }
  const [l, w, r] = on[verdict]
  return (
    <span className={`lamps lamps--${size}`} aria-hidden="true">
      <span className={`lamps__l${l ? ' is-on' : ''}`} />
      <span className={`lamps__w${w ? ' is-on' : ''}`} />
      <span className={`lamps__r${r ? ' is-on' : ''}`} />
    </span>
  )
}

export const VERDICT_ZH: Record<Verdict, string> = {
  left: '判给左方',
  right: '判给右方',
  simultaneous: '同时 · 双方不得分',
  insufficient: '证据不足 · 不下结论',
}

export const SIDE_ZH: Record<Side, string> = { left: '左方', right: '右方' }

// ─────────────────────────────────────────────
// 通用容器
// ─────────────────────────────────────────────

export function Panel({
  title,
  subtitle,
  actions,
  children,
  dense,
  className = '',
}: {
  title?: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  children: ReactNode
  dense?: boolean
  className?: string
}) {
  return (
    <section className={`panel${dense ? ' panel--dense' : ''} ${className}`}>
      {(title || actions) && (
        <header className="panel__head">
          <div className="panel__titles">
            {title && <h3 className="panel__title">{title}</h3>}
            {subtitle && <p className="panel__sub">{subtitle}</p>}
          </div>
          {actions && <div className="panel__actions">{actions}</div>}
        </header>
      )}
      <div className="panel__body">{children}</div>
    </section>
  )
}

export function Chip({
  children,
  tone = 'neutral',
  onClick,
  active,
  title,
}: {
  children: ReactNode
  tone?: 'neutral' | 'left' | 'right' | 'warn' | 'ok'
  onClick?: () => void
  active?: boolean
  title?: string
}) {
  const Tag = onClick ? 'button' : 'span'
  return (
    <Tag
      className={`chip chip--${tone}${active ? ' is-active' : ''}`}
      onClick={onClick}
      title={title}
      type={onClick ? 'button' : undefined}
    >
      {children}
    </Tag>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>
}
