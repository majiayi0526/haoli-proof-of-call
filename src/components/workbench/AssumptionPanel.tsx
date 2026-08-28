import { useState } from 'react'
import { robustnessOf } from '../../domain/sensitivity'
import type { AssumptionSweep, RobustnessReport } from '../../domain/sensitivity'
import type { Assumption, PoseTrack, Verdict } from '../../domain/types'
import { useStore } from '../../store'
import { VERDICT_ZH } from '../ui/Primitives'
import './workbench.css'

const VERDICT_COLOR: Record<Verdict, string> = {
  left: 'var(--left)',
  right: 'var(--right)',
  simultaneous: 'var(--neutral-dim)',
  insufficient: 'var(--surface-3)',
}

interface Props {
  assumptions: Assumption[]
  track: PoseTrack
  caseId: string
}

/**
 * 假设面板。
 *
 * 这是整个产品对「模型采用了哪些假设」这个追问的正面回答：
 * 每一个会改变结论的数字都在这里，可以拖，拖完整条证据链立即重算。
 * 稳健性扫描进一步告诉你：这条结论离翻转还有多远。
 */
export function AssumptionPanel({ assumptions, track, caseId }: Props) {
  const setAssumption = useStore((s) => s.setAssumption)
  const resetAssumptions = useStore((s) => s.resetAssumptions)
  const [report, setReport] = useState<RobustnessReport | null>(null)
  const [busy, setBusy] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  const runSweep = () => {
    setBusy(true)
    // 让浏览器先把 busy 状态画出来，再跑同步扫描
    requestAnimationFrame(() => {
      setTimeout(() => {
        try {
          setReport(robustnessOf(caseId, track, assumptions))
        } finally {
          setBusy(false)
        }
      }, 0)
    })
  }

  const sweepOf = (id: string) => report?.sweeps.find((s) => s.assumptionId === id)

  return (
    <div className="asmp">
      <div className="asmp__bar">
        <button className="asmp__run" onClick={runSweep} disabled={busy} type="button">
          {busy ? '扫描中…' : report ? '重新检验稳健性' : '检验结论稳健性'}
        </button>
        <button className="asmp__reset" onClick={resetAssumptions} type="button">
          恢复默认
        </button>
      </div>

      {report && (
        <div className="asmp__overall">
          <span>整体稳健度</span>
          <div className="asmp__overallbar">
            <div
              className="asmp__overallfill"
              style={{
                width: `${Math.round(report.overall * 100)}%`,
                background:
                  report.overall > 0.5
                    ? 'var(--ok)'
                    : report.overall > 0.2
                      ? 'var(--warn)'
                      : 'var(--danger)',
              }}
            />
          </div>
          <strong className="num">{Math.round(report.overall * 100)}%</strong>
          <p className="asmp__overallnote">
            {report.decisiveAssumptions.length
              ? `本例结论由 ${report.decisiveAssumptions.length} 个假设决定——它们的取值稍作改动，判罚就会变。`
              : '在全部假设的可调范围内，结论都不翻转。'}
          </p>
        </div>
      )}

      <ul className="asmp__list">
        {assumptions.map((a) => {
          const sweep = sweepOf(a.id)
          const open = openId === a.id
          return (
            <li key={a.id} className={`asm${sweep?.decisive ? ' is-decisive' : ''}`}>
              <div className="asm__top">
                <button
                  className="asm__name"
                  onClick={() => setOpenId(open ? null : a.id)}
                  type="button"
                  aria-expanded={open}
                >
                  {a.label}
                  {sweep?.decisive && <span className="asm__flag">决定性</span>}
                </button>
                <output className="asm__out num">
                  {a.value} <span>{a.unit}</span>
                </output>
              </div>

              <input
                className="asm__range"
                type="range"
                min={a.range[0]}
                max={a.range[1]}
                step={a.step}
                value={a.value}
                onChange={(e) => setAssumption(a.id, Number(e.target.value))}
                aria-label={a.label}
              />

              {sweep && <SweepStrip sweep={sweep} current={a.value} range={a.range} />}

              {open && (
                <div className="asm__detail">
                  <p className="asm__rationale">{a.rationale}</p>
                  {sweep && (
                    <p className="asm__break">
                      {sweep.breakpoint === null
                        ? `在 ${a.range[0]}–${a.range[1]} ${a.unit} 全范围内，结论保持「${VERDICT_ZH[sweep.baseVerdict]}」不变。`
                        : `把它改到约 ${sweep.breakpoint} ${a.unit}，结论就会从「${VERDICT_ZH[sweep.baseVerdict]}」翻转。当前值距离这个临界点 ${Math.abs(sweep.breakpoint - a.value).toFixed(2)} ${a.unit}。`}
                    </p>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** 扫描条：横轴是假设取值，颜色是该取值下的结论 */
function SweepStrip({
  sweep,
  current,
  range,
}: {
  sweep: AssumptionSweep
  current: number
  range: [number, number]
}) {
  const [lo, hi] = range
  const span = hi - lo || 1
  return (
    <div className="sweep" title="横轴为该假设的取值，颜色为对应结论">
      <div className="sweep__strip">
        {sweep.points.map((p, i) => (
          <span
            key={i}
            className="sweep__cell"
            style={{ background: VERDICT_COLOR[p.verdict] }}
            title={`${p.value} ${sweep.unit} → ${VERDICT_ZH[p.verdict]}`}
          />
        ))}
      </div>
      <span
        className="sweep__cursor"
        style={{ left: `${((current - lo) / span) * 100}%` }}
        aria-hidden="true"
      />
      {sweep.breakpoint !== null && (
        <span
          className="sweep__break"
          style={{ left: `${((sweep.breakpoint - lo) / span) * 100}%` }}
          title={`结论在 ${sweep.breakpoint} ${sweep.unit} 处翻转`}
        />
      )}
    </div>
  )
}
