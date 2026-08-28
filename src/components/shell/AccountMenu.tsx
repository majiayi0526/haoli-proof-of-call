import { useState } from 'react'
import { roleProfile } from '../../domain/roles'
import { useStore } from '../../store'
import { MaskGlyph } from '../ui/FencingMarks'
import './shell.css'

/**
 * 账号入口。
 *
 * 身份的选择与切换在入场页和身份条上完成，这里只回答两个问题：
 * 「我现在是谁、能做什么」，以及「真正的账号体系打算怎么做」。
 *
 * 仍然不做假的密码框。没有真实鉴权就不摆输入框，
 * 免得让人以为数据受了保护。
 */
export function AccountMenu() {
  const viewer = useStore((s) => s.viewer)
  const signOut = useStore((s) => s.signOut)
  const closeCase = useStore((s) => s.closeCase)
  const [open, setOpen] = useState(false)

  if (!viewer) return null
  const p = roleProfile(viewer.role)

  return (
    <div className="acct">
      <button className="acct__btn is-in" onClick={() => setOpen(!open)} type="button">
        <MaskGlyph size={16} />
        <span>{p.zh}</span>
      </button>

      {open && (
        <div className="acct__pop">
          <div className="acct__who">
            <MaskGlyph size={22} />
            <div>
              <strong>{p.zh}</strong>
              <span>{p.standfirst}（演示身份）</span>
            </div>
          </div>

          <ul className="acct__can">
            {p.can.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>

          <p className="acct__note">
            当前是演示身份，不做真实鉴权——这是界面收敛，不是安全边界。
            硬件一体机版本里，每一条人工裁决都会绑定到具体裁判员并带签名与时间戳，
            那时账号与权限分级是必需的，而不是锦上添花。
          </p>

          <button
            className="acct__act"
            onClick={() => {
              closeCase()
              signOut()
              setOpen(false)
            }}
            type="button"
          >
            切换身份
          </button>
        </div>
      )}
    </div>
  )
}
