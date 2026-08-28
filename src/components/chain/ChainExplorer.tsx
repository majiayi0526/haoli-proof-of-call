import { useMemo, useState } from 'react'
import { RULES, rulePdfUrl } from '../../domain/rules'
import type { Assumption, CaseAnalysis, ChainNode } from '../../domain/types'
import { useStore } from '../../store'
import { Confidence, EpistemicTag, StatusTag } from '../ui/Primitives'
import './chain.css'

interface Props {
  analysis: CaseAnalysis
  assumptions: Assumption[]
}

/**
 * 追问链。
 *
 * 交互的核心只有一个动作：对任何一条陈述问「这是从哪来的」，
 * 然后它的上游依据就摊开在下面。一路问下去必然落到两种终点之一：
 * 某一帧上的一个测量值，或者 FIE 规则里的一句原文。
 * 如果哪条链问不到底，那说明系统在这里其实是在猜。
 */
export function ChainExplorer({ analysis, assumptions }: Props) {
  const byId = useMemo(
    () => new Map(analysis.nodes.map((n) => [n.id, n])),
    [analysis.nodes],
  )
  const root = byId.get('con.verdict') ?? analysis.nodes[analysis.nodes.length - 1]

  if (!root) return null

  return (
    <div className="chain">
      <ChainBranch
        node={root}
        byId={byId}
        assumptions={assumptions}
        depth={0}
        path={new Set()}
      />
    </div>
  )
}

interface BranchProps {
  node: ChainNode
  byId: Map<string, ChainNode>
  assumptions: Assumption[]
  depth: number
  path: Set<string>
}

function ChainBranch({ node, byId, assumptions, depth, path }: BranchProps) {
  const expandedNodes = useStore((s) => s.expandedNodes)
  const toggleExpanded = useStore((s) => s.toggleExpanded)
  const selectNode = useStore((s) => s.selectNode)
  const selectedNodeId = useStore((s) => s.selectedNodeId)
  const setFrame = useStore((s) => s.setFrame)
  const decisions = useStore((s) => s.decisions)
  const decide = useStore((s) => s.decide)
  const clearDecision = useStore((s) => s.clearDecision)

  const [showOverride, setShowOverride] = useState(false)
  const [reason, setReason] = useState('')

  const open = expandedNodes.has(node.id)
  const selected = selectedNodeId === node.id
  const decision = decisions[node.id]
  const upstream = node.basis.map((id) => byId.get(id)).filter((n): n is ChainNode => !!n)
  const canRecurse = depth < 8 && !path.has(node.id)

  const status = decision
    ? decision.action === 'confirm'
      ? 'human_confirmed'
      : 'human_overridden'
    : node.status

  return (
    <article
      className={`cnode cnode--${node.layer}${selected ? ' is-selected' : ''}${
        decision ? ' is-decided' : ''
      }`}
      data-actor={node.actor}
    >
      <button
        className="cnode__head"
        onClick={() => {
          selectNode(node.id)
          toggleExpanded(node.id)
          if (node.keyFrame !== undefined) setFrame(node.keyFrame)
        }}
        aria-expanded={open}
      >
        <span className={`cnode__caret${open ? ' is-open' : ''}`} aria-hidden="true">
          ▸
        </span>
        <span className="cnode__main">
          <span className="cnode__claim">
            {decision?.action === 'override' && decision.claim ? (
              <>
                <s className="cnode__struck">{node.claim}</s>
                <strong className="cnode__revised">{decision.claim}</strong>
              </>
            ) : (
              node.claim
            )}
          </span>
          <span className="cnode__meta">
            <EpistemicTag kind={node.epistemic} compact />
            <StatusTag status={status} />
            <Confidence value={decision?.action === 'confirm' ? 1 : node.confidence} size="sm" />
            {node.keyFrame !== undefined && (
              <span className="cnode__frame num">f{node.keyFrame}</span>
            )}
          </span>
        </span>
      </button>

      {open && (
        <div className="cnode__body">
          {node.detail && <p className="cnode__detail">{node.detail}</p>}

          {node.formula && (
            <div className="cnode__row">
              <span className="cnode__rowlabel">公式</span>
              <code className="cnode__formula num">{node.formula}</code>
            </div>
          )}

          {node.value !== undefined && (
            <div className="cnode__row">
              <span className="cnode__rowlabel">取值</span>
              <span className="cnode__value num">
                {node.value} {node.unit}
              </span>
            </div>
          )}

          {node.sources.length > 0 && (
            <div className="cnode__sources">
              <span className="cnode__rowlabel">信源</span>
              <ul>
                {node.sources.map((sid) => {
                  const r = RULES[sid]
                  if (!r) return null
                  return (
                    <li key={sid} className="rule">
                      <div className="rule__head">
                        <code className="rule__code num">{r.code}</code>
                        <span className="rule__title">{r.title}</span>
                        <a
                          className="rule__link"
                          href={rulePdfUrl(r.page)}
                          target="_blank"
                          rel="noreferrer"
                          title={`打开 FIE 规则手册第 ${r.page} 页自行核对（原件随应用分发，断网可查）`}
                        >
                          原文 p.{r.page} ↗
                        </a>
                      </div>
                      <blockquote className="rule__quote">{r.quote}</blockquote>
                      <p className="rule__zh">{r.zh}</p>
                      {r.operationalises && (
                        <p className="rule__op">
                          <span>本系统如何量化它：</span>
                          {r.operationalises}
                        </p>
                      )}
                      <p className="rule__edition">{r.edition}</p>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {node.assumptions.length > 0 && (
            <div className="cnode__assumptions">
              <span className="cnode__rowlabel">所用假设</span>
              <ul>
                {node.assumptions.map((aid) => {
                  const a = assumptions.find((x) => x.id === aid)
                  if (!a) return null
                  return (
                    <li key={aid}>
                      <span className="asm__label">{a.label}</span>
                      <span className="asm__value num">
                        {a.value} {a.unit}
                      </span>
                      <p className="asm__why">{a.rationale}</p>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          <div className="cnode__acts">
            {node.frameRange && (
              <button
                className="cnode__act"
                onClick={() => setFrame(node.frameRange![0])}
                type="button"
              >
                定位到证据帧 f{node.frameRange[0]}–{node.frameRange[1]}
              </button>
            )}
            {!decision && (
              <>
                <button
                  className="cnode__act cnode__act--ok"
                  type="button"
                  onClick={() =>
                    decide({
                      nodeId: node.id,
                      action: 'confirm',
                      reason: '裁判已核对证据并确认',
                      at: new Date().toISOString(),
                    })
                  }
                >
                  核对无误
                </button>
                <button
                  className="cnode__act cnode__act--warn"
                  type="button"
                  onClick={() => setShowOverride((v) => !v)}
                >
                  推翻这条
                </button>
              </>
            )}
            {decision && (
              <button
                className="cnode__act"
                type="button"
                onClick={() => clearDecision(node.id)}
              >
                撤销裁决
              </button>
            )}
          </div>

          {showOverride && !decision && (
            <form
              className="override"
              onSubmit={(e) => {
                e.preventDefault()
                if (!reason.trim()) return
                decide({
                  nodeId: node.id,
                  action: 'override',
                  claim: `（裁判改判）${reason.trim()}`,
                  reason: reason.trim(),
                  at: new Date().toISOString(),
                })
                setShowOverride(false)
                setReason('')
              }}
            >
              <label htmlFor={`ov-${node.id}`}>
                推翻理由（会作为人工裁决记录进证据链，AI 结论不会覆盖它）
              </label>
              <textarea
                id={`ov-${node.id}`}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder="例：回放逐帧确认左方在 f163 已开始伸臂，系统因手部遮挡漏检"
              />
              <div className="override__acts">
                <button type="submit" className="cnode__act cnode__act--warn">
                  提交裁决
                </button>
                <button
                  type="button"
                  className="cnode__act"
                  onClick={() => setShowOverride(false)}
                >
                  取消
                </button>
              </div>
            </form>
          )}

          {decision && (
            <p className="cnode__decision">
              <strong>
                {decision.action === 'confirm' ? '裁判已确认' : '裁判已推翻'}
              </strong>
              ：{decision.reason}
            </p>
          )}

          {upstream.length > 0 && (
            <div className="cnode__up">
              <p className="cnode__uplabel">这条结论从哪来 · {upstream.length} 项依据</p>
              {canRecurse &&
                upstream.map((u) => (
                  <ChainBranch
                    key={u.id}
                    node={u}
                    byId={byId}
                    assumptions={assumptions}
                    depth={depth + 1}
                    path={new Set([...path, node.id])}
                  />
                ))}
            </div>
          )}

          {upstream.length === 0 && node.layer !== 'question' && (
            <p className="cnode__leaf">
              追问到底：本条直接来自
              {node.epistemic === 'ruled'
                ? '规则条文'
                : node.epistemic === 'observed'
                  ? '画面上的测量'
                  : node.epistemic === 'estimated'
                    ? '模型估算（非观测）'
                    : '人工设定'}
              ，没有更上游的依据。
            </p>
          )}
        </div>
      )}
    </article>
  )
}
