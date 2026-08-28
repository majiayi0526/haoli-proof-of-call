import { useMemo, useState } from 'react'
import {
  RULES,
  RULE_EDITION,
  RULE_INDEX_URL,
  RULE_SOURCE_URL,
  rulePdfUrl,
} from '../../domain/rules'
import './rulebook.css'

/** 佩剑优先权在规则手册中的章节范围 */
const SABRE_RANGE = { from: 33, to: 36 }

/**
 * 规则手册。
 *
 * 「信源可核对」如果需要人翻五分钟，在场边就等于不可核对。
 * 所以原件随应用一起分发（断网也能查），每条引用都带页码，
 * 点一下右边的 PDF 就翻到那一页——核对成本必须低到裁判愿意真去核对。
 */
export function RulebookPage() {
  const clauses = useMemo(() => Object.values(RULES), [])
  const [page, setPage] = useState<number>(SABRE_RANGE.from)
  const [active, setActive] = useState<string | null>(null)

  const jump = (code: string, p: number) => {
    setActive(code)
    // 同一页重复点击时，加一个无害的变化量强制 iframe 重新定位
    setPage(p === page ? p + 0.0001 : p)
  }

  return (
    <div className="rb">
      <header className="rb__head">
        <div>
          <p className="rb__kicker">信源 · FIE 规则手册原件</p>
          <h1>{RULE_EDITION}</h1>
          <p className="rb__note">
            现行最新版，取自 FIE 官网。原件随应用分发，断网也能查。
            左侧是本系统实际引用的条款，点任意一条，右侧翻到官方 PDF 的那一页。
          </p>
        </div>
        <div className="rb__links">
          <a href={rulePdfUrl()} target="_blank" rel="noreferrer" className="rb__link">
            打开完整 PDF ↗
          </a>
          <a href={RULE_SOURCE_URL} target="_blank" rel="noreferrer" className="rb__link">
            FIE 官网原始下载 ↗
          </a>
          <a href={RULE_INDEX_URL} target="_blank" rel="noreferrer" className="rb__link">
            FIE 规则总目录 ↗
          </a>
        </div>
      </header>

      <p className="rb__version">
        <strong>版本核对记录：</strong>
        2026 年 8 月版与此前使用的 2021 年 12 月版，佩剑优先权 t.100 – t.106
        经逐字比对<strong>完全一致</strong>。这套判罚约定四年多未变，
        因此系统中基于旧版建立的操作化定义全部继续有效——
        这一条本身也可核对：两版 PDF 的对应页码都在下方给出。
      </p>

      <div className="rb__grid">
        <nav className="rb__list" aria-label="本系统引用的条款">
          <h2>本系统引用的条款</h2>
          <p className="rb__listnote">
            共 {clauses.length} 条，全部来自佩剑章节（t.96 – t.106）
          </p>
          <ul>
            {clauses.map((r) => (
              <li key={r.id}>
                <button
                  className={`rbc${active === r.code ? ' is-active' : ''}`}
                  onClick={() => jump(r.code, r.page)}
                  type="button"
                >
                  <span className="rbc__top">
                    <code className="rbc__code num">{r.code}</code>
                    <span className="rbc__page num">p.{r.page}</span>
                  </span>
                  <span className="rbc__title">{r.title}</span>
                  <span className="rbc__quote">{r.quote}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <section className="rb__viewer">
          <header className="rb__viewerhead">
            <span className="num">
              第 {Math.floor(page)} 页
              {active && ` · ${active}`}
            </span>
            <span className="rb__jumps">
              跳章节
              <button onClick={() => jump('', SABRE_RANGE.from)} type="button">
                佩剑 p.{SABRE_RANGE.from}
              </button>
              <button onClick={() => jump('', 1)} type="button">
                目录 p.1
              </button>
            </span>
          </header>
          <iframe
            className="rb__frame"
            src={rulePdfUrl(Math.floor(page))}
            title={`${RULE_EDITION} 第 ${Math.floor(page)} 页`}
            key={page}
          />
          <p className="rb__fallback">
            浏览器若未内嵌显示 PDF，可
            <a href={rulePdfUrl(Math.floor(page))} target="_blank" rel="noreferrer">
              在新标签页打开
            </a>
            。
          </p>
        </section>
      </div>

      <footer className="rb__foot">
        规则条文版权归国际击剑联合会（FIE）所有。本项目仅作条款引用与页面定位，
        不改写规则；界面上的中文均为本项目译文，与英文原文并列显示，供使用者自行核对。
      </footer>
    </div>
  )
}
