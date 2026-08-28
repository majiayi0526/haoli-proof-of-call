import { useMemo, useState } from 'react'
import { narrateVerdict } from '../../domain/narrate'
import type { CaseAnalysis, CaseMeta } from '../../domain/types'
import { useStore } from '../../store'
import { Lamp, StatusTag, VERDICT_ZH } from '../ui/Primitives'
import './workbench.css'

interface Props {
  analysis: CaseAnalysis
  meta: CaseMeta
}

/**
 * 判罚结论。
 *
 * 顶部只说人话——裁判读完标题和紧跟的那一句就该知道判给谁、为什么。
 * 技术细节（帧号、角速度、阈值）一律收进下面的追问链，
 * 想核对的人点进去，不想核对的人不必被它挡住。
 */
export function VerdictPanel({ analysis, meta }: Props) {
  const decisions = useStore((s) => s.decisions)
  const setFrame = useStore((s) => s.setFrame)

  const said = useMemo(() => narrateVerdict(analysis), [analysis])
  const agrees = analysis.verdict === meta.expertVerdict
  const decidedCount = Object.keys(decisions).length
  const [showCaveats, setShowCaveats] = useState(false)

  return (
    <div className="verdict">
      <div className={`verdict__main verdict__main--${analysis.verdict}`}>
        <Lamp verdict={analysis.verdict} size="lg" />
        <div className="verdict__text">
          <h2 className="verdict__headline">{said.headline}</h2>
        </div>
        <StatusTag status={analysis.verdictStatus} />
      </div>

      {/* 一句话理由：整个界面上最该被读到的一句 */}
      <p className="verdict__because">{said.because}</p>

      {said.keyEvents.length > 0 && (
        <div className="verdict__jump">
          <span>跳到关键帧</span>
          {said.keyEvents.map((e) => (
            <button
              key={`${e.side}-${e.kind}-${e.frame}`}
              className={`verdict__jumpbtn verdict__jumpbtn--${e.side}`}
              onClick={() => setFrame(e.frame)}
              type="button"
            >
              {(e.t).toFixed(2)}s
            </button>
          ))}
        </div>
      )}

      {said.caveats.length > 0 && (
        <div className="verdict__caveatbox">
          <button
            className="verdict__caveattoggle"
            onClick={() => setShowCaveats(!showCaveats)}
            aria-expanded={showCaveats}
            type="button"
          >
            <span className="verdict__caveatcount">⚠ {said.caveats.length} 项需注意</span>
            <span className="verdict__caveatarrow">{showCaveats ? '收起' : '展开'}</span>
          </button>
          {showCaveats && (
            <ul className="verdict__caveats">
              {said.caveats.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="verdict__foot">
        <span
          className={`verdict__expert${agrees ? ' is-agree' : ' is-disagree'}`}
          title={`专家标注：${VERDICT_ZH[meta.expertVerdict]}`}
        >
          <Lamp verdict={meta.expertVerdict} size="sm" />
          专家 {agrees ? '一致' : '不一致'}
        </span>
        {decidedCount > 0 && (
          <span className="verdict__decided">已裁决 {decidedCount}</span>
        )}
      </div>
    </div>
  )
}

export function ConflictList({ analysis }: { analysis: CaseAnalysis }) {
  const selectNode = useStore((s) => s.selectNode)
  const toggleExpanded = useStore((s) => s.toggleExpanded)
  const expandedNodes = useStore((s) => s.expandedNodes)

  if (!analysis.conflicts.length) {
    return (
      <p className="conflict__none">
        未检出冲突。这不等于结论正确——只说明系统的各条判据之间没有互相矛盾。
      </p>
    )
  }

  return (
    <ul className="conflicts">
      {analysis.conflicts.map((c) => (
        <li key={c.id} className={`conflict conflict--${c.severity}`}>
          <div className="conflict__head">
            <span className="conflict__sev">
              {c.severity === 'high' ? '严重' : c.severity === 'medium' ? '需注意' : '提示'}
            </span>
            <h4 className="conflict__title">{c.title}</h4>
          </div>
          <p className="conflict__detail">{c.detail}</p>
          <p className="conflict__suggestion">
            <span>处理建议</span>
            {c.suggestion}
          </p>
          {c.nodeIds.length > 0 && (
            <div className="conflict__links">
              {c.nodeIds.map((id) => (
                <button
                  key={id}
                  type="button"
                  className="conflict__link"
                  onClick={() => {
                    selectNode(id)
                    if (!expandedNodes.has(id)) toggleExpanded(id)
                  }}
                >
                  查看 {id}
                </button>
              ))}
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}
