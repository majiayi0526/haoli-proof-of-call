import { useState } from 'react'
import { WEAPON_ORDER, WEAPONS } from '../../domain/weapons'
import type { Weapon } from '../../domain/weapons'
import { useStore } from '../../store'
import { WeaponGlyph } from '../ui/FencingMarks'
import './shell.css'

/**
 * 剑种切换。
 *
 * 花剑和重剑现在还不能用，但入口就摆在这里而不是藏起来——
 * 一是因为它们的判罚逻辑本来就不同（花剑同为优先权制、重剑没有优先权），
 * 界面上说清楚这件事本身对使用者有价值；
 * 二是不做出「以后再加个下拉框」的欠债，扩展位现在就留好。
 */
export function WeaponSwitch() {
  const weapon = useStore((s) => s.weapon)
  const setWeapon = useStore((s) => s.setWeapon)
  const [open, setOpen] = useState<Weapon | null>(null)

  return (
    <div className="wsw">
      <div className="wsw__group" role="tablist" aria-label="剑种">
        {WEAPON_ORDER.map((id) => {
          const w = WEAPONS[id]
          const active = weapon === id
          return (
            <button
              key={id}
              role="tab"
              aria-selected={active}
              className={`wsw__btn${active ? ' is-active' : ''}${
                w.available ? '' : ' is-soon'
              }`}
              onClick={() => {
                // 未开放的剑种也允许切换——进入的是说明页而不是空白。
                // 把「为什么还没做、做的时候要改什么」讲清楚，
                // 比一个点不动的灰按钮有用。
                setWeapon(id)
                setOpen(null)
              }}
              onMouseEnter={() => setOpen(id)}
              onMouseLeave={() => setOpen(null)}
              type="button"
            >
              <WeaponGlyph weapon={id} size={17} />
              <span className="wsw__name">{w.zh}</span>
              {!w.available && <span className="wsw__soon">规划中</span>}
            </button>
          )
        })}
      </div>

      {open && (
        <div className="wsw__pop" role="tooltip">
          <div className="wsw__pophead">
            <WeaponGlyph weapon={open} size={22} />
            <div>
              <strong>
                {WEAPONS[open].zh} <em>{WEAPONS[open].en}</em>
              </strong>
              <span className="wsw__core">
                判罚核心：{WEAPONS[open].core} · 判定窗口 {WEAPONS[open].lockoutMs}ms ·{' '}
                {WEAPONS[open].ruleRange}
              </span>
            </div>
          </div>
          <p>{WEAPONS[open].approach}</p>
        </div>
      )}
    </div>
  )
}
