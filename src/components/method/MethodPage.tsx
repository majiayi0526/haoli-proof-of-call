import { ASSUMPTION_DEFS } from '../../domain/assumptions'
import {
  DOCTRINES,
  RULES,
  RULE_EDITION,
  RULE_SOURCE_URL,
  rulePdfUrl,
} from '../../domain/rules'
import './method.css'

/**
 * 方法与边界。
 *
 * 这一页的存在是因为：一个声称「让判断经得起追问」的系统，
 * 必须先把自己的判据、假设和做不到的事写清楚。
 * 只讲能力不讲边界的研究产品，恰恰是这个命题要反对的东西。
 */
export function MethodPage() {
  return (
    <div className="mth">
      <header className="mth__head">
        <p className="mth__kicker">方法 · 假设 · 边界</p>
        <h1>这套系统凭什么这么判，又有哪些做不到</h1>
        <p className="mth__lede">
          判罚权在裁判。本系统只做三件事：把可测量的时刻测出来、把规则条文和
          测量对应起来、把每一处不确定和冲突显式标出来。下面是全部判据与已知局限，
          没有藏起来的部分。
        </p>
      </header>

      <section className="mth__sec">
        <h2>一、两套判据口径，系统都跑，不替你选</h2>
        <p className="mth__note">
          这是本项目最重要的设计决定。两套口径在多数剑上结论一致，
          但在疑难剑上会分歧——分歧时系统如实报告，不做投票也不做加权平均。
        </p>
        <div className="mth__doctrines">
          {Object.values(DOCTRINES).map((d) => (
            <article key={d.id} className="doc">
              <h3>{d.name}</h3>
              <p className="doc__crit">
                第一判据：<strong>{d.primaryCriterion}</strong>
              </p>
              <p className="doc__basis">{d.basis}</p>
              <p className="doc__prov">
                <span>来源性质</span>
                {d.provenance}
              </p>
              <p className="doc__refs num">{d.ruleRefs.join(' · ')}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mth__sec">
        <h2>二、全部可调假设</h2>
        <p className="mth__note">
          凡是能改变判罚结论的数字都在这里，没有藏在代码里的魔法常数。
          在裁判回放台里可以逐个拖动，整条证据链会立即重算。
        </p>
        <div className="scroll-x">
          <table className="mth__table">
            <thead>
              <tr>
                <th>假设</th>
                <th className="num">默认值</th>
                <th>为什么取这个值</th>
              </tr>
            </thead>
            <tbody>
              {ASSUMPTION_DEFS.map((a) => (
                <tr key={a.id}>
                  <td className="mth__aname">{a.label}</td>
                  <td className="num mth__aval">
                    {a.value} {a.unit}
                  </td>
                  <td className="mth__awhy">{a.rationale}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mth__sec">
        <h2>三、引用的规则条款</h2>
        <p className="mth__note">
          全部条款号与原文引自 {RULE_EDITION}（现行最新版）。
          FIE 规则手册原件随应用一起分发，断网也能查；下面每一条都标了页码，
          点开直接跳到那一页。也可对照
          <a href={RULE_SOURCE_URL} target="_blank" rel="noreferrer">
            FIE 官网原始下载 ↗
          </a>
          核验来源。系统只做转述与定位，不改写规则。
        </p>
        <ul className="mth__rules">
          {Object.values(RULES).map((r) => (
            <li key={r.id}>
              <a
                className="num mth__rulecode"
                href={rulePdfUrl(r.page)}
                target="_blank"
                rel="noreferrer"
                title={`打开 FIE 规则手册第 ${r.page} 页`}
              >
                {r.code}
                <em>p.{r.page}</em>
              </a>
              <div>
                <strong>{r.title}</strong>
                <p className="mth__zh">{r.zh}</p>
                {r.operationalises && <p className="mth__op">{r.operationalises}</p>}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mth__sec mth__sec--limits">
        <h2>四、已知边界：这些事系统做不到</h2>
        <ul className="mth__limits">
          <li>
            <h3>看不见剑</h3>
            <p>
              2D 姿态里不存在武器。剑尖位置由腕关节沿前臂方向外推估算，
              是结构性假设而非观测。因此凡涉及「剑是否触及」「剑尖是否在线」
              的判断，置信度一律封顶 0.6，不足以单独定案。界面上这类量
              一律标为紫色「估算」并画成虚线。
            </p>
          </li>
          <li>
            <h3>分不清「转换线路」与「收手」</h3>
            <p>
              系统只能观测到肘角度回落这一现象。它究竟是 t.106.4d 意义上
              丧失威胁的收手，还是正常的转移线路，取决于剑尖是否持续威胁有效部位
              ——而这正是上一条做不到的事。系统只报告现象，不下定性。
            </p>
          </li>
          <li>
            <h3>单机位、无深度</h3>
            <p>
              转播机位是侧面单视角，前后方向的深度信息全部丢失。选手正对镜头
              前后移动时，位移会被系统性低估。多机位或深度传感是后续方向，
              当前版本不具备。
            </p>
          </li>
          <li>
            <h3>受镜头切换与遮挡限制</h3>
            <p>
              素材是电视转播录屏，混有慢放特写、教练与观众镜头、画中画。
              系统用几何门控筛出「两人同时在画面内、间距合理、景深一致」的帧，
              其余一律不分析。被筛掉的原因会显示在案例信息里——
              有效帧占比低的案例，结论本身就该被打折看待。
            </p>
          </li>
          <li>
            <h3>它不是裁判</h3>
            <p>
              依 t.100，有效性与优先权由裁判员决定。本系统的一切输出都标记为
              「模型候选」，只有经人确认才转为已确认状态；被推翻时，
              人的结论覆盖 AI 的结论，反过来永远不会发生。
            </p>
          </li>
        </ul>
      </section>

      <section className="mth__sec">
        <h2>五、素材与可复现性</h2>
        <p className="mth__note">
          基准素材为巴黎 2024 奥运会佩剑比赛的争议判罚片段，由国际级裁判
          按判罚情境人工分类并标注归属，用于检验判据而非训练模型——
          本系统不含任何在该数据上训练的参数，全部判据来自规则条文与显式阈值。
          离线骨骼提取用 YOLOv8-Pose + BoT-SORT；浏览器端上传走 MediaPipe，
          两条路径的提取器标识都会记录在数据里。整条推理链是纯函数：
          同样的骨骼数据加同样的假设，任何人都能复现出同一条证据链。
        </p>
      </section>
    </div>
  )
}
