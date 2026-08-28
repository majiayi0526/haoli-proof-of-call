import { useMemo, useState } from 'react'
import { roleProfile } from '../../domain/roles'
import { pickFeatured, useOpenCase } from '../../hooks/useOpenCase'
import type { CaseMeta, Verdict } from '../../domain/types'
import { useStore } from '../../store'
import { PisteRule } from '../ui/FencingMarks'
import { Empty, Lamp, VERDICT_ZH } from '../ui/Primitives'
import { IS_PUBLIC_BUILD, hasOnlineClip } from '../../lib/clipAccess'
import { UploadPanel } from './UploadPanel'
import './library.css'

interface Group {
  key: string
  zh: string
  desc: string
  cases: CaseMeta[]
  tally: Record<Verdict, number>
}

export function CaseLibrary() {
  const cases = useStore((s) => s.cases)
  const loading = useStore((s) => s.loading)
  const viewer = useStore((s) => s.viewer)
  const { open, busyId } = useOpenCase()
  // 上传是教练员的能力。裁判员回放席上用赛场既定素材，
  // 研究者要结论可复现只跑固定基准集——理由写在 domain/roles.ts。
  const canUpload = viewer ? roleProfile(viewer.role).canUpload : false
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set())

  /**
   * 按判罚情境分组。
   *
   * 十几段素材平铺成一片网格，看的人第一眼只会觉得「视频好多」，
   * 而不是「原来争议判罚分这几类」。分组之后，情境本身成了目录——
   * 这批素材的价值恰恰在于它是被专家按判罚类型归好类的。
   */
  const groups = useMemo<Group[]>(() => {
    const m = new Map<string, Group>()
    for (const c of cases) {
      let g = m.get(c.scenario)
      if (!g) {
        g = {
          key: c.scenario,
          zh: c.scenarioZh,
          desc: c.scenarioDesc,
          cases: [],
          tally: { left: 0, right: 0, simultaneous: 0, insufficient: 0 },
        }
        m.set(c.scenario, g)
      }
      g.cases.push(c)
      g.tally[c.expertVerdict] = (g.tally[c.expertVerdict] ?? 0) + 1
    }
    return [...m.values()].sort((a, b) => b.cases.length - a.cases.length)
  }, [cases])

  // 默认只展开样本最多的一组，其余收起——先看清有哪几类，再决定看哪类
  const [initialised, setInitialised] = useState(false)
  if (!initialised && groups.length) {
    setOpenGroups(new Set([groups[0].key]))
    setInitialised(true)
  }

  const toggle = (key: string) =>
    setOpenGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const allOpen = openGroups.size === groups.length && groups.length > 0

  /**
   * 首屏 CTA 打开哪一剑。
   *
   * 优先挑对攻类——那是产品真正要解决的场景；退而求其次挑样本最多的那类。
   * 不随机：演示效果不该靠运气。
   */
  const featured = useMemo(() => {
    // 首屏这一下必须有画面：线上第一次点开就是「画面未分发」，
    // 观感上像是坏了，先入为主之后再解释也晚了。
    const playable = cases.filter((c) => hasOnlineClip(c.id))
    return pickFeatured(playable.length ? playable : cases)
  }, [cases])

  const openFeatured = async () => {
    if (featured) await open(featured)
  }

  const tally = useMemo(() => {
    const t: Record<Verdict, number> = { left: 0, right: 0, simultaneous: 0, insufficient: 0 }
    for (const c of cases) t[c.expertVerdict] = (t[c.expertVerdict] ?? 0) + 1
    return t
  }, [cases])

  return (
    <div className="lib">
      {/* 3 秒钩子：先让人产生疑问，再说我们是谁。
          手机首屏原先被顶栏与导航占满，打开只看到一排按钮，
          不知道这是干什么的——先摆问题，再给一个动作。 */}
      <section className="hook">
        <p className="hook__q">
          双方同时命中，
          <br />
          <strong>判给谁？</strong>
        </p>
        <div className="hook__act">
          <button className="hook__cta" onClick={() => void openFeatured()} type="button">
            看系统怎么判 →
          </button>
          <span className="hook__hint">
            打开一剑巴黎奥运争议判罚，0.1× 慢放，逐条对照依据
          </span>
        </div>
      </section>

      <section className="lib__hero">
        <div className="lib__heroText">
          <h1>
            佩剑对攻的每一次判罚，
            <br />
            都应该经得起逐帧追问
          </h1>
          <p className="lib__lede">
            佩剑的电子判定窗口在 2004 年从 300ms 缩到 120ms。对攻时双方几乎同时出手，
            裁判要在毫秒内判断谁先取得优先权——这是全项目争议最大的场景。
            现有的 AI 裁判工具直接给出结果，却说不出依据。
            本系统反过来：<strong>不给最终答案，只把答案所依赖的每一项证据、
            每一个假设、每一处冲突摊开，让裁判自己决策。</strong>
          </p>
          <PisteRule className="lib__piste" />

          <dl className="lib__facts">
            <div>
              <dt>基准素材</dt>
              <dd>
                <strong className="num">{cases.length}</strong> 段
              </dd>
              <p>使用巴黎 2024 奥运会佩剑争议判罚</p>
            </div>
            <div>
              <dt>专家标注</dt>
              <dd>
                <span className="num">左 {tally.left}</span>
                <span className="num">右 {tally.right}</span>
              </dd>
              <p>由国际级裁判按情境分类并标注归属</p>
            </div>
            <div>
              <dt>判罚情境</dt>
              <dd>
                <strong className="num">{groups.length}</strong> 类
              </dd>
              <p>暂时归纳为对攻抢攻、准备进攻、收手、还击链等</p>
            </div>
          </dl>
        </div>
        {canUpload && <UploadPanel />}
      </section>

      <section className="lib__list">
        <header className="lib__listhead">
          <div>
            <h2>按判罚情境浏览</h2>
            <p>
              情境分类来自国际级裁判的人工归类，不是模型聚类。
              点开任一类看该类的案例。
            </p>
          </div>
          <button
            className="lib__expandall"
            onClick={() =>
              setOpenGroups(allOpen ? new Set() : new Set(groups.map((g) => g.key)))
            }
            type="button"
          >
            {allOpen ? '全部收起' : '全部展开'}
          </button>
        </header>

        {!cases.length && !loading && (
          <Empty>这里还没有案例。</Empty>
        )}

        <div className="lib__groups">
          {groups.map((g) => {
            const isOpen = openGroups.has(g.key)
            return (
              <section key={g.key} className={`grp${isOpen ? ' is-open' : ''}`}>
                <button
                  className="grp__head"
                  onClick={() => toggle(g.key)}
                  aria-expanded={isOpen}
                  type="button"
                >
                  <span className={`grp__caret${isOpen ? ' is-open' : ''}`} aria-hidden="true">
                    ▸
                  </span>
                  <span className="grp__name">{g.zh}</span>
                  <span className="grp__count num">{g.cases.length}</span>

                  {/* 该类里专家判给哪边——用记分灯直接表达，不用文字 */}
                  <span className="grp__tally">
                    {g.tally.left > 0 && (
                      <span className="grp__t grp__t--left num" title={`判给左方 ${g.tally.left} 例`}>
                        <i /> {g.tally.left}
                      </span>
                    )}
                    {g.tally.right > 0 && (
                      <span className="grp__t grp__t--right num" title={`判给右方 ${g.tally.right} 例`}>
                        <i /> {g.tally.right}
                      </span>
                    )}
                    {g.tally.simultaneous > 0 && (
                      <span className="grp__t grp__t--sim num" title={`同时 ${g.tally.simultaneous} 例`}>
                        <i /> {g.tally.simultaneous}
                      </span>
                    )}
                  </span>

                  <span className="grp__desc">{g.desc}</span>
                </button>

                {isOpen && (
                  <ul className="lib__grid">
                    {g.cases.map((c) => (
                      <li key={c.id}>
                        <button
                          className="ccard"
                          onClick={() => void open(c)}
                          disabled={busyId === c.id}
                          type="button"
                        >
                          <span className="ccard__thumb">
                            <img
                              src={`${import.meta.env.BASE_URL}thumbs/${c.id}.jpg`}
                              alt=""
                              loading="lazy"
                              width={320}
                              height={200}
                            />
                            <span
                              className={`ccard__verdict ccard__verdict--${c.expertVerdict}`}
                            >
                              <Lamp verdict={c.expertVerdict} size="sm" />
                              {VERDICT_ZH[c.expertVerdict]}
                            </span>
                            {IS_PUBLIC_BUILD && !hasOnlineClip(c.id) && (
                              <span
                                className="ccard__nofilm"
                                title="转播画面未随线上版本分发（版权），骨骼与证据链完整可查"
                              >
                                无画面 · 证据链完整
                              </span>
                            )}
                            {busyId === c.id && <span className="ccard__busy">解析中…</span>}
                          </span>
                          <span className="ccard__body">
                            <span className="ccard__title">{c.title}</span>
                            <span className="ccard__meta num">
                              {c.frames} 帧 · {c.fps.toFixed(0)}fps · {c.duration.toFixed(1)}s
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )
          })}
        </div>
      </section>
    </div>
  )
}
