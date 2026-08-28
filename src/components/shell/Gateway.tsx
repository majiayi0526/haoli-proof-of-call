import { useState } from 'react'
import { ROLES } from '../../domain/roles'
import type { Role, RoleProfile } from '../../domain/roles'
import { CrossedBlades, PisteRule } from '../ui/FencingMarks'
import { CoachGlyph, RefereeGlyph, ResearcherGlyph } from '../ui/RoleGlyphs'
import './gateway.css'

interface Props {
  /** 选定身份。裁判员那一路要去取骨骼数据，所以是异步的 */
  onEnter: (role: Role) => void
  /** 正在进场的身份——按下之后到界面切换之间的那段等待 */
  entering: Role | null
}

/** 每个身份画本行当里的具体东西，不用通用图标——理由见 RoleGlyphs.tsx */
const GLYPH: Record<Role, (p: { size?: number; className?: string }) => React.ReactElement> = {
  referee: RefereeGlyph,
  coach: CoachGlyph,
  researcher: ResearcherGlyph,
}

type Phase = 'brand' | 'choose'

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  )
}

/**
 * 入场页。
 *
 * 先报名字，再问「你是谁」。这个顺序不是排场：三个身份进去看到的界面
 * 本来就不一样，先让人知道这是什么东西，再让他选自己是谁，
 * 比一上来甩三张卡片要讲得通。
 *
 * 品牌页不自动翻篇——由看的人点一下才进入身份选择。自动划走会让人
 * 还没读完就没了，尤其是路演时讲解的节奏未必跟动画对得上。
 * 「减少动效」只关掉动画，不跳过这一步：那是动效偏好，不是流程偏好。
 */
export function Gateway({ onEnter, entering }: Props) {
  // 惰性初始化读一次即可：这个偏好在会话中途改变的情况可以不管
  const [reduced] = useState(prefersReducedMotion)
  const [phase, setPhase] = useState<Phase>('brand')

  return (
    <div className={`gate gate--${phase}${reduced ? ' gate--still' : ''}`}>
      <div className="gate__brand">
        <CrossedBlades size={34} className="gate__blades" />
        <h1 className="gate__name">
          毫厘
          <span className="gate__en">PROOF OF CALL</span>
        </h1>
        <PisteRule className="gate__piste" />
        <p className="gate__slogan">不代替裁判，只让判决有据可查</p>
      </div>

      {phase === 'brand' ? (
        /* 覆盖整屏的按钮：点哪儿都能进，同时白拿键盘可达与回车触发。
           不用全局 keydown 监听——那样没有焦点提示，键盘用户不知道能按。 */
        <button className="gate__enter" onClick={() => setPhase('choose')} type="button">
          <span className="gate__enterHint">点击进入</span>
        </button>
      ) : (
        <section className="gate__choose" aria-labelledby="gate-q">
          <h2 className="gate__q" id="gate-q">
            请选择您的身份
          </h2>

          <ul className="gate__roles">
            {ROLES.map((r, i) => (
              <RoleCard
                key={r.id}
                role={r}
                index={i}
                busy={entering === r.id}
                disabled={entering !== null && entering !== r.id}
                onPick={() => onEnter(r.id)}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

interface CardProps {
  role: RoleProfile
  index: number
  busy: boolean
  disabled: boolean
  onPick: () => void
}

function RoleCard({ role, index, busy, disabled, onPick }: CardProps) {
  const Glyph = GLYPH[role.id]
  return (
    <li
      className="gate__role"
      style={
        {
          '--accent': role.accent,
          '--i': index,
        } as React.CSSProperties
      }
    >
      <button onClick={onPick} disabled={disabled} type="button">
        {/* 图标在上、名字居中在下。入场页只回答「我是谁」，
            权限的细则留给进去之后的身份条——那里有地方把理由写清楚。 */}
        <span className="gate__roleHead">
          <span className="gate__roleGlyph">
            <Glyph size={46} />
          </span>
          <span className="gate__roleName">{role.zh}</span>
        </span>

        <ul className="gate__can">
          {role.can.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>

        <span className="gate__go">{busy ? '进入中…' : '以此身份进入 →'}</span>
      </button>
    </li>
  )
}
