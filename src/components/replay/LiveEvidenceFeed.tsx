import { useEffect, useMemo, useRef } from 'react'
import { timeOfFrame } from '../../domain/kinematics'
import { narrateTimeline } from '../../domain/narrate'
import type { NarratedEvent } from '../../domain/narrate'
import type { CaseAnalysis, MotionEvent, PoseTrack } from '../../domain/types'
import { useStore } from '../../store'
import './feed.css'

/** 事件发生后维持「刚刚发生」高亮的时长 */
const FLASH_SECONDS = 0.45

interface Props {
  analysis: CaseAnalysis
  track: PoseTrack
  onPickEvent: (e: MotionEvent) => void
  focusEvent?: MotionEvent | null
}

/**
 * 实时证据流。
 *
 * 这是裁判在回放时真正盯着的东西：视频慢放到 0.1 倍速，下面这条流
 * 跟着时间一条条亮起来——就像转播里的鹰眼。已经发生的留在上面可以回看，
 * 还没发生的压暗，刚刚发生的那条高亮。
 *
 * 性能上有意做得很轻：只有这个组件订阅播放帧，判定「哪条该亮」靠一次
 * 线性扫描（事件通常不超过十几条），高亮切换全部走 CSS 类，
 * 不做 JS 动画、不重排列表。证据链那棵递归树不订阅帧，
 * 所以慢放时不会跟着每帧重渲染。
 */
export function LiveEvidenceFeed({ analysis, track, onPickEvent, focusEvent }: Props) {
  const frame = useStore((s) => s.frame)
  const setFrame = useStore((s) => s.setFrame)
  const listRef = useRef<HTMLOListElement>(null)
  const lastActiveRef = useRef<number>(-1)

  const items = useMemo(() => narrateTimeline(analysis), [analysis])
  const now = timeOfFrame(track, frame)

  // 当前已经发生了几条 —— 一次线性扫描，事件数很小
  const passedCount = useMemo(() => {
    let n = 0
    for (const it of items) {
      if (it.event.t <= now) n++
      else break
    }
    return n
  }, [items, now])

  const activeIndex = passedCount - 1

  // 让最新亮起的那条保持可见。只在「亮起的那条变了」时滚动，
  // 否则慢放时每帧都调用 scrollIntoView 会让列表一直在抖。
  useEffect(() => {
    if (activeIndex < 0 || activeIndex === lastActiveRef.current) return
    lastActiveRef.current = activeIndex
    const el = listRef.current?.children[activeIndex] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [activeIndex])

  const stateOf = (it: NarratedEvent, i: number): string => {
    if (it.event.t > now) return 'future'
    if (now - it.event.t <= FLASH_SECONDS && i === activeIndex) return 'flash'
    return 'past'
  }

  if (!items.length) {
    return (
      <p className="feed__empty">
        这段画面里没有检出可用于判罚的时刻。可能是机位不是侧面、两人没同时入画，
        或画面中有其他人体干扰。
      </p>
    )
  }

  return (
    <div className="feed">
      <div className="feed__head">
        <span className="feed__count num">
          {passedCount} / {items.length}
        </span>
        <span className="feed__hint">
          跟随播放实时点亮 · 点任意一条跳到该帧
        </span>
      </div>

      <ol className="feed__list" ref={listRef}>
        {items.map((it, i) => {
          const state = stateOf(it, i)
          const focused =
            focusEvent?.kind === it.event.kind && focusEvent?.side === it.event.side
          return (
            <li key={`${it.event.side}-${it.event.kind}-${it.event.frame}`}>
              <button
                className={`fev fev--${it.event.side} fev--${state} fev--${it.weight}${
                  focused ? ' is-focused' : ''
                }${it.estimated ? ' is-estimated' : ''}`}
                onClick={() => {
                  onPickEvent(it.event)
                  setFrame(it.event.frame)
                }}
                type="button"
              >
                <span className="fev__time num">
                  {(it.ms / 1000).toFixed(2)}
                  <em>s</em>
                </span>

                <span className="fev__body">
                  <span className="fev__headline">
                    {it.headline}
                    {it.estimated && <span className="fev__est">估算</span>}
                  </span>
                  <span className="fev__why">{it.why}</span>
                </span>

                <span className="fev__meta">
                  {it.rule && <code className="fev__rule num">{it.rule}</code>}
                  <span className="fev__frame num">f{it.event.frame}</span>
                  <span className="fev__conf num">
                    {Math.round(it.event.confidence * 100)}%
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
