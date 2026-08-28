import { RULES } from '../../domain/rules'
import { WEAPONS } from '../../domain/weapons'
import type { Weapon } from '../../domain/weapons'
import { useStore } from '../../store'
import { PisteRule, WeaponGlyph } from '../ui/FencingMarks'
import './roadmap.css'

/** 各剑种扩展时真正要做的事，按「能复用什么、必须重做什么」拆开 */
const PLAN: Record<
  Exclude<Weapon, 'sabre'>,
  { reuse: string[]; rebuild: string[]; blocker?: string }
> = {
  foil: {
    reuse: [
      '证据链本体与推理引擎——花剑同为优先权制，「手臂伸展先于弓步」的判据结构完全一致',
      '骨骼提取、几何门控、双时间轴、敏感性扫描等全部管线',
      '两套判据口径并行与冲突报告机制',
    ],
    rebuild: [
      '规则条款替换为 t.75 – t.85，逐字原文重新校对',
      '有效部位改为躯干（含背部），排除四肢与头部——这会改变「触及」的判定区域',
      '判定窗口从 120ms 放宽到 300ms，可分辨阈值需重新标定',
      '「剑尖在线」（point in line）在花剑中更常见，需要更可靠的剑身估计',
    ],
  },
  epee: {
    reuse: [
      '骨骼提取与追踪、几何门控、证据帧导出',
      '人机协作机制：模型候选、人工确认与推翻、裁决留痕',
    ],
    rebuild: [
      '判罚逻辑整体重写——重剑没有优先权，不存在「谁先发起攻击」这个问题',
      '核心判据变成「两次击中相差多少毫秒」，40ms 内互中即双方各得一分',
      '全身皆为有效部位，触及判定不再需要区分部位',
    ],
    blocker:
      '重剑的核心判据是毫秒级的击中时间差，这恰恰是视觉分析最弱、而裁判器电信号最强的地方。'
      + '因此重剑版本的正确做法不是硬用视觉去测，而是等硬件接入之后以裁判器信号为主依据，'
      + '视觉退居为动作复核与争议留证。在硬件就位前强行做，只会做出一个不该被信任的东西。',
  },
}

/**
 * 非佩剑剑种的说明页。
 *
 * 与其把花剑重剑做成两个灰掉的按钮，不如把「为什么还没做、做的时候要改什么」
 * 摊开讲。三个剑种的判罚逻辑本来就不同构，说清这件事本身对使用者有价值，
 * 也让扩展路径不是一句空的「后续支持」。
 */
export function WeaponRoadmap({ weapon }: { weapon: Exclude<Weapon, 'sabre'> }) {
  const setWeapon = useStore((s) => s.setWeapon)
  const setScoringBox = useStore((s) => s.setScoringBox)
  const spec = WEAPONS[weapon]
  const plan = PLAN[weapon]
  const sabre = WEAPONS.sabre

  return (
    <div className="rmap">
      <header className="rmap__head">
        <div className="rmap__badge">
          <WeaponGlyph weapon={weapon} size={30} />
        </div>
        <div>
          <p className="rmap__kicker">
            {spec.en} · {spec.ruleRange}
          </p>
          <h1>{spec.zh}版本尚未开放</h1>
        </div>
      </header>

      <PisteRule className="rmap__piste" />

      <p className="rmap__lede">{spec.approach}</p>

      <section className="rmap__compare">
        <h2>为什么不是「换个数据集再训一遍」</h2>
        <div className="rmap__cards">
          <article className="rcard rcard--now">
            <header>
              <WeaponGlyph weapon="sabre" size={19} />
              <strong>{sabre.zh}（当前）</strong>
            </header>
            <dl>
              <div>
                <dt>判罚核心</dt>
                <dd>{sabre.core}</dd>
              </div>
              <div>
                <dt>判定窗口</dt>
                <dd className="num">{sabre.lockoutMs} ms</dd>
              </div>
              <div>
                <dt>规则条款</dt>
                <dd className="num">{sabre.ruleRange}</dd>
              </div>
            </dl>
          </article>

          <article className="rcard">
            <header>
              <WeaponGlyph weapon={weapon} size={19} />
              <strong>{spec.zh}</strong>
            </header>
            <dl>
              <div>
                <dt>判罚核心</dt>
                <dd>{spec.core}</dd>
              </div>
              <div>
                <dt>判定窗口</dt>
                <dd className="num">{spec.lockoutMs} ms</dd>
              </div>
              <div>
                <dt>规则条款</dt>
                <dd className="num">{spec.ruleRange}</dd>
              </div>
            </dl>
          </article>
        </div>
      </section>

      <section className="rmap__split">
        <div className="rmap__col rmap__col--reuse">
          <h3>可以直接复用</h3>
          <ul>
            {plan.reuse.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
        <div className="rmap__col rmap__col--rebuild">
          <h3>必须重做</h3>
          <ul>
            {plan.rebuild.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      </section>

      {plan.blocker && (
        <section className="rmap__blocker">
          <h3>为什么要等硬件</h3>
          <p>{plan.blocker}</p>
          <button
            className="rmap__act"
            onClick={() => setScoringBox('simulated')}
            type="button"
          >
            看看裁判器接入后的形态 →
          </button>
        </section>
      )}

      <footer className="rmap__foot">
        <p>
          规则条款已在系统内收录并逐字校对的部分：
          {Object.values(RULES).length} 条（佩剑 t.100 – t.106）。
          扩展到其他剑种时，条款库按同样标准补齐——引用原文、标注版本、附官方链接。
        </p>
        <button className="rmap__back" onClick={() => setWeapon('sabre')} type="button">
          ← 回到佩剑
        </button>
      </footer>
    </div>
  )
}
