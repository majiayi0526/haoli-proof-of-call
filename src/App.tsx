import { useCallback, useEffect, useState } from 'react'
import { CaseLibrary } from './components/library/CaseLibrary'
import { InsightBoard } from './components/insight/InsightBoard'
import { MethodPage } from './components/method/MethodPage'
import { RulebookPage } from './components/rulebook/RulebookPage'
import { AccountMenu } from './components/shell/AccountMenu'
import { Gateway } from './components/shell/Gateway'
import { RoleStrip } from './components/shell/RoleStrip'
import { ScoringBox } from './components/shell/ScoringBox'
import { WeaponRoadmap } from './components/shell/WeaponRoadmap'
import { WeaponSwitch } from './components/shell/WeaponSwitch'
import { CrossedBlades } from './components/ui/FencingMarks'
import { Workbench } from './components/workbench/Workbench'
import { hasOnlineClip } from './lib/clipAccess'
import { pickFeatured, useOpenCase } from './hooks/useOpenCase'
import { roleProfile } from './domain/roles'
import type { Role } from './domain/roles'
import type { CaseMeta } from './domain/types'
import { useStore } from './store'
import type { View } from './store'
import './app.css'

const NAV: Array<{ id: View; label: string; hint: string }> = [
  { id: 'library', label: '案例库', hint: '巴黎奥运会佩剑争议判罚基准集' },
  { id: 'insight', label: '循证分析', hint: '把单剑证据聚合成可下钻的项目研究' },
  { id: 'rulebook', label: 'FIE 规则手册', hint: 'FIE 技术规则原件，条款一键跳页核对' },
  { id: 'method', label: '系统架构', hint: '判据、假设与已知边界' },
]

export default function App() {
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  const setCases = useStore((s) => s.setCases)
  const setError = useStore((s) => s.setError)
  const error = useStore((s) => s.error)
  const activeCase = useStore((s) => s.activeCase)
  const weapon = useStore((s) => s.weapon)
  const viewer = useStore((s) => s.viewer)
  const signIn = useStore((s) => s.signIn)
  const cases = useStore((s) => s.cases)
  const { open } = useOpenCase()
  const [entering, setEntering] = useState<Role | null>(null)

  /**
   * 选定身份进场。
   *
   * 裁判员要的是「坐下就能判」，所以直接开一剑落到裁判回放台，
   * 而不是先看一屏案例卡再点一次。其余身份落在自己的起点页。
   * 开哪一剑只在有画面的案例里挑——线上第一次点开就是
   * 「画面未分发」的说明板，先入为主之后再解释也晚了。
   */
  const enter = useCallback(
    async (role: Role) => {
      setEntering(role)
      const profile = roleProfile(role)
      signIn({ name: `演示${profile.zh}`, role })
      if (profile.opensCaseOnEntry) {
        const playable = cases.filter((c) => hasOnlineClip(c.id))
        const featured = pickFeatured(playable.length ? playable : cases)
        // 案例还没加载出来就先落到案例库，不把人卡在入场页
        if (featured && (await open(featured))) {
          setEntering(null)
          return
        }
      }
      setView(profile.landing === 'workbench' ? 'library' : profile.landing)
      setEntering(null)
    },
    [cases, open, setView, signIn],
  )

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}cases.json`)
      .then((r) => {
        if (!r.ok) throw new Error('案例库这会儿没取到，多半是网络断了。刷新页面再试一次。')
        return r.json()
      })
      .then((data: { cases: CaseMeta[] }) => setCases(data.cases))
      .catch((e: unknown) =>
        setError(
          e instanceof Error ? e.message : '案例库这会儿没取到。刷新页面再试一次。',
        ),
      )
  }, [setCases, setError])

  if (!viewer) return <Gateway onEnter={(r) => void enter(r)} entering={entering} />

  return (
    <div className="app">
      <header className="app__bar">
        <button className="app__brand" onClick={() => setView('library')} type="button">
          <CrossedBlades size={19} className="app__blades" />
          <span className="app__name">
            毫厘<span className="app__en">PROOF OF CALL</span>
          </span>
        </button>

        <WeaponSwitch />

        <span className="app__spacer" />

        {roleProfile(viewer.role).canConnectScoringBox && <ScoringBox />}

        <nav className="app__nav">
          {NAV.map((n) => (
            <button
              key={n.id}
              className={view === n.id ? 'is-active' : ''}
              onClick={() => setView(n.id)}
              title={n.hint}
              type="button"
            >
              {n.label}
            </button>
          ))}
          {activeCase && (
            <button
              className={view === 'workbench' ? 'is-active' : ''}
              onClick={() => setView('workbench')}
              type="button"
            >
              裁判回放台
            </button>
          )}
        </nav>

        <AccountMenu />
      </header>

      <RoleStrip role={viewer.role} />

      {error && (
        <p className="app__error">{error}</p>
      )}

      <main className="app__main">
        {weapon !== 'sabre' ? (
          <WeaponRoadmap weapon={weapon} />
        ) : (
          <>
        {view === 'library' && <CaseLibrary />}
        {view === 'workbench' && <Workbench />}
        {view === 'insight' && <InsightBoard />}
        {view === 'rulebook' && <RulebookPage />}
        {view === 'method' && <MethodPage />}
          </>
        )}
      </main>
    </div>
  )
}
