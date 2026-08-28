import { useEffect, useMemo, useState } from 'react'
import type { PoseTrack, Verdict } from '../../domain/types'
import { useStore } from '../../store'
import { Empty, Lamp, VERDICT_ZH } from '../ui/Primitives'
import './insight.css'

interface BenchCase {
  id: string
  scenario: string
  scenarioZh: string
  expertVerdict: Verdict | 'unlabeled'
  verdict: Verdict
  confidence: number
  fieVerdict: Verdict
  practiceVerdict: Verdict
  fieDeltaMs: number | null
  practiceDeltaMs: number | null
  doctrinesDisagree: boolean
  agreesWithExpert: boolean | null
  validCoverage: number
  bothCoverage: number
  robustness: number | null
  conflicts: Array<{ id: string; severity: string; title: string }>
}

interface DoctrineStat {
  decided: number
  agree: number
  rate: number
}

interface Benchmark {
  generatedAt: string
  doctrineComparison: { sidedCases: number; fie: DoctrineStat; practice: DoctrineStat }
  totals: { cases: number; labelled: number; decided: number; simultaneous: number; insufficient: number }
  accuracy: { overall: number; whenDecided: number; decidedCount: number; decidedAgree: number }
  doctrineDisagreement: { count: number; rate: number; ids: string[] }
  abstention: { simultaneousIds: string[]; insufficientIds: string[]; rate: number }
  fragile: { count: number; ids: string[] }
  byScenario: Array<{
    scenario: string
    scenarioZh: string
    total: number
    decided: number
    agree: number
    disagreeDoctrines: number
    simultaneous: number
    insufficient: number
    meanValidCoverage: number
    ids: string[]
  }>
  cases: BenchCase[]
}

type Drill = { title: string; note: string; ids: string[] } | null

export function InsightBoard() {
  const [bench, setBench] = useState<Benchmark | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [drill, setDrill] = useState<Drill>(null)

  const cases = useStore((s) => s.cases)
  const openCase = useStore((s) => s.openCase)
  const setError = useStore((s) => s.setError)

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}benchmark.json`)
      .then((r) => {
        if (!r.ok) throw new Error('统计数据没取到。刷新页面再试一次。')
        return r.json()
      })
      .then(setBench)
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : '统计数据没取到。刷新页面再试一次。'))
  }, [])

  const caseById = useMemo(() => new Map((bench?.cases ?? []).map((c) => [c.id, c])), [bench])

  const openById = async (id: string) => {
    const meta = cases.find((c) => c.id === id)
    if (!meta) {
      setError('该案例未收录在可回放清单中（仅参与统计，未内置视频）')
      return
    }
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}tracks/${id}.json`)
      if (!r.ok) throw new Error('这一剑的分析数据没取到。换一剑再试。')
      const track: PoseTrack = await r.json()
      openCase(meta, track)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '这一剑打不开。换一剑再试。')
    }
  }

  if (err) return <Empty>{err}</Empty>
  if (!bench) return <Empty>正在载入评测数据…</Empty>

  const a = bench.accuracy
  const d = bench.doctrineDisagreement

  return (
    <div className="ins">
      <header className="ins__head">
        <p className="ins__kicker">循证分析 · 佩剑对攻判罚</p>
        <h1>
          大量案例分析后，
          <br />
          模型发现了什么？
        </h1>
        <p className="ins__lede">
          下面每一个数字都不是终点，而是一个入口——点开就能看到它由哪几剑构成，
          再点进去就能看到那一剑的逐帧证据。这是本项目的核心理念：
          <strong>聚合结论必须能原路拆回单条证据，让每一个判断都经得起追问。</strong>
        </p>
        <p className="ins__caveat">
          这批素材来自于由国际级裁判标注的疑难剑汇总——
          全部是当时就存在争议、值得反复观看的判罚。
          任何系统的一致率都会显著低于在普通片段上的表现。
          另外，「专家标注」是国际级裁判的判断，本身也是一个可被质疑的对象，
          所以下面的词是<strong>「与专家标注一致」</strong>，不是「准确率」。
        </p>
      </header>

      <section className="ins__finding">
        <p className="ins__findinglabel">本项目最主要的研究发现</p>
        <h2>
          按 FIE 条文「先看手」判，比临场通行的「先看脚」
          更接近专家判罚——高出 {Math.round(
            (bench.doctrineComparison.fie.rate - bench.doctrineComparison.practice.rate) * 100,
          )} 个百分点
        </h2>
        <div className="ins__versus">
          <div className="vs vs--win">
            <span className="vs__name">FIE 条文口径</span>
            <span className="vs__crit">第一判据：持剑臂开始伸展（t.101.2）</span>
            <span className="vs__num num">
              {Math.round(bench.doctrineComparison.fie.rate * 100)}%
            </span>
            <span className="vs__detail num">
              {bench.doctrineComparison.fie.agree} / {bench.doctrineComparison.fie.decided} 剑
            </span>
          </div>
          <div className="vs">
            <span className="vs__name">临场实践口径</span>
            <span className="vs__crit">第一判据：前脚开始向前</span>
            <span className="vs__num num">
              {Math.round(bench.doctrineComparison.practice.rate * 100)}%
            </span>
            <span className="vs__detail num">
              {bench.doctrineComparison.practice.agree} /{' '}
              {bench.doctrineComparison.practice.decided} 剑
            </span>
          </div>
        </div>
        <p className="ins__findingnote">
          两套口径跑的是同一批素材、同一套骨骼数据，唯一差别是第一判据取手还是取脚。
          在 {bench.doctrineComparison.sidedCases} 剑有明确归属标注的样本上，
          成文条文的口径稳定占优。这对裁判培训有直接含义：
          对攻场景下先盯手臂，比先盯脚更可靠。
          <br />
          该结论同样可以被追问——点上方卡片可以看到每一剑两套口径各自判了什么。
        </p>
      </section>

      <section className="ins__cards">
        <button
          className="icard icard--primary"
          type="button"
          onClick={() =>
            setDrill({
              title: '两套判据口径给出不同结论的案例',
              note: 'FIE 条文（t.101.2，以手臂伸展为准）与临场实践（以前脚启动为准）在这些剑上分歧。这不是模型误差，而是两套判据本身的差异。',
              ids: d.ids,
            })
          }
        >
          <span className="icard__num num">{Math.round(d.rate * 100)}%</span>
          <span className="icard__label">两套判据口径分歧率</span>
          <span className="icard__note">
            {d.count} / {bench.totals.cases} 剑上，「看手」与「看脚」给出不同答案
          </span>
          <span className="icard__cta">看是哪几剑 →</span>
        </button>

        <div className="icard icard--static">
          <span className="icard__num num">{Math.round(a.whenDecided * 100)}%</span>
          <span className="icard__label">给出结论时与专家一致</span>
          <span className="icard__note">
            在系统愿意下结论的 {a.decidedCount} 剑中，{a.decidedAgree} 剑与专家标注一致。
            弃权案例不计入分母——把「没答」算成「答对」会让数字虚高。
            这是一批公认的疑难剑，这个数字应当与其他系统在同类素材上的表现比较，
            而不是与普通片段上的成绩比较。
          </span>
        </div>

        <button
          className="icard"
          type="button"
          onClick={() =>
            setDrill({
              title: '需人工复核的案例',
              note: '这些剑的结论对判定阈值高度敏感：阈值在合理范围内小幅变动，判罚就会翻转。系统把它们标出来，就是要请裁判逐帧复核这几剑。',
              ids: bench.fragile.ids,
            })
          }
        >
          <span className="icard__num num">{bench.fragile.count}</span>
          <span className="icard__label">需人工复核的剑</span>
          <span className="icard__note">稳健度低于 15%，阈值稍动即翻转</span>
          <span className="icard__cta">看是哪几剑 →</span>
        </button>
      </section>

      <section className="ins__table">
        <header>
          <h2>按判罚情境拆解</h2>
          <p>
            情境分类来自国际级裁判对素材的人工归类，不是模型聚类。
            每一行都能点开看具体案例。
          </p>
        </header>
        <div className="scroll-x">
          <table>
            <thead>
              <tr>
                <th>判罚情境</th>
                <th className="num">样本</th>
                <th className="num">给出归属</th>
                <th className="num">与专家一致</th>
                <th className="num">口径分歧</th>
                <th className="num">弃权</th>
                <th>有效帧占比</th>
              </tr>
            </thead>
            <tbody>
              {bench.byScenario
                .slice()
                .sort((x, y) => y.total - x.total)
                .map((s) => {
                  const acc = s.decided ? s.agree / s.decided : 0
                  return (
                    <tr
                      key={s.scenario}
                      onClick={() =>
                        setDrill({
                          title: `${s.scenarioZh} · 全部案例`,
                          note: `共 ${s.total} 剑，其中系统给出明确归属 ${s.decided} 剑。`,
                          ids: s.ids,
                        })
                      }
                    >
                      <td className="ins__scen">{s.scenarioZh}</td>
                      <td className="num">{s.total}</td>
                      <td className="num">{s.decided}</td>
                      <td className="num">
                        <span className="ins__acc">
                          <span
                            className="ins__accbar"
                            style={{
                              width: `${Math.round(acc * 100)}%`,
                              background:
                                acc >= 0.7 ? 'var(--ok)' : acc >= 0.5 ? 'var(--warn)' : 'var(--danger)',
                            }}
                          />
                          {s.decided ? `${Math.round(acc * 100)}%` : '—'}
                        </span>
                      </td>
                      <td className="num">{s.disagreeDoctrines}</td>
                      <td className="num">{s.simultaneous + s.insufficient}</td>
                      <td className="num">{Math.round(s.meanValidCoverage * 100)}%</td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      </section>

      {drill && (
        <div className="drill" role="dialog" aria-modal="true">
          <div className="drill__panel">
            <header>
              <div>
                <h3>{drill.title}</h3>
                <p>{drill.note}</p>
              </div>
              <button onClick={() => setDrill(null)} type="button" aria-label="关闭">
                ✕
              </button>
            </header>
            {!drill.ids.length && <Empty>没有符合条件的案例。</Empty>}
            <ul>
              {drill.ids.map((id) => {
                const c = caseById.get(id)
                if (!c) return null
                const playable = cases.some((x) => x.id === id)
                return (
                  <li key={id}>
                    <button
                      onClick={() => void openById(id)}
                      type="button"
                      disabled={!playable}
                      title={playable ? '打开裁判回放台逐帧核对' : '该案例仅参与统计，未内置视频'}
                    >
                      <span className="drill__scen">{c.scenarioZh}</span>
                      <span className="drill__id num">{id}</span>
                      <span className="drill__verdicts">
                        <span className="drill__v">
                          条文 <Lamp verdict={c.fieVerdict} size="sm" />
                          {VERDICT_ZH[c.fieVerdict]}
                          {c.fieDeltaMs !== null && (
                            <em className="num">Δ{Math.abs(c.fieDeltaMs)}ms</em>
                          )}
                        </span>
                        <span className="drill__v">
                          实践 <Lamp verdict={c.practiceVerdict} size="sm" />
                          {VERDICT_ZH[c.practiceVerdict]}
                          {c.practiceDeltaMs !== null && (
                            <em className="num">Δ{Math.abs(c.practiceDeltaMs)}ms</em>
                          )}
                        </span>
                        {c.expertVerdict !== 'unlabeled' && (
                          <span
                            className={`drill__expert${c.agreesWithExpert ? ' is-agree' : ' is-off'}`}
                          >
                            专家 {VERDICT_ZH[c.expertVerdict as Verdict]}
                          </span>
                        )}
                      </span>
                      {playable && <span className="drill__go">逐帧核对 →</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
          <button className="drill__scrim" onClick={() => setDrill(null)} aria-label="关闭" type="button" />
        </div>
      )}

    </div>
  )
}
