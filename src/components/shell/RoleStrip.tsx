import { roleProfile } from '../../domain/roles'
import type { Role } from '../../domain/roles'
import { useStore } from '../../store'
import { MaskGlyph } from '../ui/FencingMarks'
import './gateway.css'

/**
 * 身份条。
 *
 * 三个身份看到的界面不一样，所以要让人随时知道自己是哪个身份，
 * 以及从哪儿换。只说「我是谁」，不解释「我少了什么」——
 * 能做的都列在入场页了，没列的自然就是不做，
 * 在工作界面上反复申明限制，读起来像是在为功能缺失道歉。
 */
export function RoleStrip({ role }: { role: Role }) {
  const p = roleProfile(role)
  const signOut = useStore((s) => s.signOut)
  const closeCase = useStore((s) => s.closeCase)

  return (
    <div className="rstrip" style={{ '--accent': p.accent } as React.CSSProperties}>
      <div className="rstrip__row">
        <MaskGlyph size={14} className="rstrip__glyph" />
        <strong className="rstrip__name">{p.zh}</strong>
        <span className="rstrip__stand">{p.standfirst}</span>

        <span className="rstrip__spacer" />

        <button
          className="rstrip__switch"
          onClick={() => {
            closeCase()
            signOut()
          }}
          type="button"
        >
          切换身份
        </button>
      </div>
    </div>
  )
}
