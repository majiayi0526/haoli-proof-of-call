import { useMemo, useState } from 'react'
import { narrateVerdict } from '../../domain/narrate'
import { applyDecisions, useStore } from '../../store'
import type { MotionEvent } from '../../domain/types'
import { ChainExplorer } from '../chain/ChainExplorer'
import { LiveEvidenceFeed } from '../replay/LiveEvidenceFeed'
import { clipSrcFor } from '../../lib/clipAccess'
import { ReplayStage } from '../replay/ReplayStage'
import { TransportBar } from '../replay/TransportBar'
import { EvidenceTimeline } from '../timeline/EvidenceTimeline'
import { AssumptionPanel } from './AssumptionPanel'
import { ConflictList, VerdictPanel } from './VerdictPanel'
import './workbench.css'

type Tab = 'chain' | 'assumptions' | 'conflicts'

/**
 * 裁判回放台。
 *
 * 布局按裁判实际的动作排：左边是画面，右边是依据，眼睛在两者之间横向移动。
 * 判罚依据占据右栏主体而不是塞进标签页——裁判要做的事就是「看一眼画面、
 * 对一条依据」，依据必须始终在视野里，且能逐条往下走。
 *
 * 追问链、假设扫描这些深入工具收进下方的折叠区：它们是复核时才用的，
 * 平时不该跟判罚依据抢位置。
 */
export function Workbench() {
  const meta = useStore((s) => s.activeCase)
  const track = useStore((s) => s.track)
  const bundle = useStore((s) => s.bundle)
  const assumptions = useStore((s) => s.assumptions)
  const decisions = useStore((s) => s.decisions)
  const closeCase = useStore((s) => s.closeCase)

  const [tab, setTab] = useState<Tab>('chain')
  const [focusEvent, setFocusEvent] = useState<MotionEvent | null>(null)

  const analysis = useMemo(
    () => (bundle ? applyDecisions(bundle.analysis, decisions) : null),
    [bundle, decisions],
  )
  const said = useMemo(() => (analysis ? narrateVerdict(analysis) : null), [analysis])

  if (!meta || !track || !bundle || !analysis) {
    return (
      <div className="wb__loading">
        <p>正在解析骨骼时序…</p>
      </div>
    )
  }

  return (
    <div className="wb">
      <header className="wb__head">
        <button className="wb__back" onClick={closeCase} type="button">
          ← 案例库
        </button>
        <div className="wb__title">
          <h1>{meta.title}</h1>
          <p>
            <span className="wb__scenario">{meta.scenarioZh}</span>
            {meta.scenarioDesc}
          </p>
        </div>
        <dl className="wb__stats">
          <div>
            <dt>提取器</dt>
            <dd className="num">{track.extractor}</dd>
          </div>
        </dl>
      </header>

      <div className="wb__grid">
        {/* 左：画面 */}
        <section className="wb__stage">
          <ReplayStage
            src={clipSrcFor(meta)}
            focusEvent={focusEvent}
            events={analysis.events}
            verdictLine={said?.headline}
            caseTitle={meta.title}
          />
          <TransportBar />
          <details className="wb__tl">
            <summary>证据时间轴</summary>
            <EvidenceTimeline
              events={analysis.events}
              window={bundle.phrase.window}
              track={track}
              assumptions={assumptions}
              onPickEvent={setFocusEvent}
              focusEvent={focusEvent}
            />
          </details>
        </section>

        {/* 右：判罚依据 —— 裁判逐条对照的地方 */}
        <aside className="wb__panel">
          <VerdictPanel analysis={analysis} meta={meta} />

          <section className="wb__evidence">
            <header className="wb__evhead">
              <h3>判罚依据</h3>
              <span>跟随播放逐条点亮 · 建议 0.1× 慢放</span>
            </header>
            <LiveEvidenceFeed
              analysis={analysis}
              track={track}
              onPickEvent={setFocusEvent}
              focusEvent={focusEvent}
            />
          </section>

          <details className="wb__deep">
            <summary>
              复核工具
              <span className="wb__deephint">追问链 · 假设扫描 · 冲突</span>
              {analysis.conflicts.length > 0 && (
                <span className="wb__badge">{analysis.conflicts.length}</span>
              )}
            </summary>

            <nav className="wb__tabs" role="tablist">
              <button
                role="tab"
                aria-selected={tab === 'chain'}
                className={tab === 'chain' ? 'is-active' : ''}
                onClick={() => setTab('chain')}
                type="button"
              >
                追问链
              </button>
              <button
                role="tab"
                aria-selected={tab === 'assumptions'}
                className={tab === 'assumptions' ? 'is-active' : ''}
                onClick={() => setTab('assumptions')}
                type="button"
              >
                假设与稳健性
              </button>
              <button
                role="tab"
                aria-selected={tab === 'conflicts'}
                className={tab === 'conflicts' ? 'is-active' : ''}
                onClick={() => setTab('conflicts')}
                type="button"
              >
                冲突
                {analysis.conflicts.length > 0 && (
                  <span className="wb__badge">{analysis.conflicts.length}</span>
                )}
              </button>
            </nav>

            <div className="wb__tabbody">
              {tab === 'chain' && (
                <ChainExplorer analysis={analysis} assumptions={assumptions} />
              )}
              {tab === 'assumptions' && (
                <AssumptionPanel assumptions={assumptions} track={track} caseId={meta.id} />
              )}
              {tab === 'conflicts' && <ConflictList analysis={analysis} />}
            </div>
          </details>
        </aside>
      </div>
    </div>
  )
}
