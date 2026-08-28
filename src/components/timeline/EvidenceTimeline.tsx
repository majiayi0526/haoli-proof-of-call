import { useMemo } from 'react'
import { assumptionValue } from '../../domain/assumptions'
import { frameAtTime, timeOfFrame } from '../../domain/kinematics'
import type { Assumption, EventKind, MotionEvent, PoseTrack, Side } from '../../domain/types'
import { useStore } from '../../store'
import './timeline.css'

const EVENT_ZH: Record<EventKind, string> = {
  arm_extension_start: '伸臂',
  front_foot_start: '前脚启动',
  rear_foot_advance: '后脚跟进',
  front_foot_land: '前脚落地',
  blade_contact: '触及(估算)',
  arm_withdraw: '收手',
}

/** 只有这两个事件决定优先权归属，视觉上必须比其他事件重 */
const DECISIVE: EventKind[] = ['arm_extension_start', 'front_foot_start']

interface Props {
  events: MotionEvent[]
  window: [number, number]
  track: PoseTrack
  assumptions: Assumption[]
  onPickEvent: (e: MotionEvent) => void
  focusEvent?: MotionEvent | null
}

/**
 * 证据时间轴。
 *
 * 两条泳道对应两名选手，颜色沿用记分灯（左红右绿）。
 * 中间那条灰带是「可分辨阈值」——落在带内的时差，系统认为无法区分先后。
 * 把这条带画出来，是为了让「同时」这个判断不再是一句口头结论，
 * 而是一个能看见宽度、能被质疑的量。
 */
export function EvidenceTimeline({
  events,
  window: phrase,
  track,
  assumptions,
  onPickEvent,
  focusEvent,
}: Props) {
  const frame = useStore((s) => s.frame)
  const setFrame = useStore((s) => s.setFrame)
  const simWindow = assumptionValue(assumptions, 'simultaneity_window')

  // 横轴是真实时间而非帧号。素材为可变帧率，按帧号等分会让
  // 帧间隔长的地方在视觉上被压缩，看起来像「动作变快了」。
  const PAD_S = 0.4
  const fromT = Math.max(0, timeOfFrame(track, phrase[0]) - PAD_S)
  const toT = timeOfFrame(track, phrase[1]) + PAD_S
  const spanT = Math.max(0.001, toT - fromT)

  const pctT = (t: number) => ((t - fromT) / spanT) * 100
  const pct = (f: number) => pctT(timeOfFrame(track, f))

  const lanes = useMemo(() => {
    const by: Record<Side, MotionEvent[]> = { left: [], right: [] }
    for (const e of events) {
      if (e.t >= fromT && e.t <= toT) by[e.side].push(e)
    }
    return by
  }, [events, fromT, toT])

  // 两个口径各自的时差带
  const deltaBands = useMemo(() => {
    const bands: Array<{ kind: EventKind; a: number; b: number; label: string }> = []
    for (const kind of DECISIVE) {
      const l = events.find((e) => e.side === 'left' && e.kind === kind)
      const r = events.find((e) => e.side === 'right' && e.kind === kind)
      if (!l || !r) continue
      const a = Math.min(l.t, r.t)
      const b = Math.max(l.t, r.t)
      const ms = Math.round((b - a) * 1000)
      bands.push({
        kind,
        a,
        b,
        label: `Δ ${ms} ms${ms < simWindow ? ' · 不可分辨' : ''}`,
      })
    }
    return bands
  }, [events, simWindow])

  const simWidthPct = (simWindow / 1000 / spanT) * 100

  return (
    <div className="tl">
      <div className="tl__scale">
        {[0, 0.25, 0.5, 0.75, 1].map((p) => (
          <span key={p} className="tl__tick num" style={{ left: `${p * 100}%` }}>
            {Math.round((fromT + spanT * p) * 1000)}ms
          </span>
        ))}
      </div>

      <div
        className="tl__track"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          const p = (e.clientX - r.left) / r.width
          setFrame(frameAtTime(track, fromT + spanT * p))
        }}
        role="presentation"
      >
        {/* 交锋窗口 */}
        <div
          className="tl__phrase"
          style={{ left: `${pct(phrase[0])}%`, width: `${pct(phrase[1]) - pct(phrase[0])}%` }}
        >
          <span className="tl__phraselabel">有效交锋窗口</span>
        </div>

        {/* 时差带 */}
        {deltaBands.map((b) => {
          const width = pctT(b.b) - pctT(b.a)
          const undecidable = width <= simWidthPct
          return (
            <div
              key={b.kind}
              className={`tl__delta${undecidable ? ' tl__delta--undecidable' : ''}`}
              style={{ left: `${pctT(b.a)}%`, width: `${Math.max(width, 0.4)}%` }}
              title={`${EVENT_ZH[b.kind]}：${b.label}`}
            >
              <span className="tl__deltalabel num">{b.label}</span>
            </div>
          )
        })}

        {/* 两条泳道 */}
        {(['left', 'right'] as Side[]).map((side) => (
          <div key={side} className={`tl__lane tl__lane--${side}`}>
            <span className="tl__lanename">{side === 'left' ? '左' : '右'}</span>
            {lanes[side].map((e) => {
              const decisive = DECISIVE.includes(e.kind)
              const active = focusEvent?.kind === e.kind && focusEvent?.side === e.side
              return (
                <button
                  key={`${e.kind}-${e.frame}`}
                  className={`tl__ev tl__ev--${side}${decisive ? ' is-decisive' : ''}${
                    active ? ' is-active' : ''
                  }${e.epistemic === 'estimated' ? ' is-estimated' : ''}`}
                  style={{ left: `${pctT(e.t)}%` }}
                  onClick={(ev) => {
                    ev.stopPropagation()
                    onPickEvent(e)
                    setFrame(e.frame)
                  }}
                  title={`${EVENT_ZH[e.kind]} · f${e.frame} · ${Math.round(e.t * 1000)}ms · 置信 ${Math.round(e.confidence * 100)}%\n${e.measure.name} = ${e.measure.value} ${e.measure.unit}（阈值 ${e.measure.threshold}）`}
                  type="button"
                >
                  <span className="tl__evdot" />
                  <span className="tl__evlabel">{EVENT_ZH[e.kind]}</span>
                </button>
              )
            })}
          </div>
        ))}

        {/* 当前帧游标 */}
        <div className="tl__cursor" style={{ left: `${pct(frame)}%` }}>
          <span className="tl__cursorhead num">f{frame}</span>
        </div>
      </div>

      <p className="tl__legend">
        <span className="tl__key tl__key--decisive" />
        决定优先权的时刻
        <span className="tl__key tl__key--estimated" />
        估算量（非观测）
        <span className="tl__key tl__key--band" />
        可分辨阈值 {simWindow} ms —— 时差落在带宽内即判为「同时」
      </p>
    </div>
  )
}
