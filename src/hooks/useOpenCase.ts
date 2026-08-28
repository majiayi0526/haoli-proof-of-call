import { useCallback, useState } from 'react'
import type { CaseMeta, PoseTrack } from '../domain/types'
import { useStore } from '../store'

/**
 * 打开一剑：取骨骼数据，进裁判回放台。
 *
 * 抽出来是因为现在有两个入口——案例库里点一张卡片，
 * 以及裁判员选完身份直接落到裁判回放台。两处不能各写一份取数逻辑，
 * 否则错误处理和忙碌态迟早会长得不一样。
 */
export function useOpenCase() {
  const openCase = useStore((s) => s.openCase)
  const setLoading = useStore((s) => s.setLoading)
  const setError = useStore((s) => s.setError)
  const [busyId, setBusyId] = useState<string | null>(null)

  const open = useCallback(
    async (meta: CaseMeta): Promise<boolean> => {
      setBusyId(meta.id)
      setLoading(true)
      try {
        const r = await fetch(`${import.meta.env.BASE_URL}tracks/${meta.id}.json`)
        if (!r.ok) throw new Error('这一剑的分析数据没取到。换一剑，或者刷新页面再试。')
        const track: PoseTrack = await r.json()
        openCase(meta, track)
        return true
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : '这一剑打不开。换一剑，或者刷新页面再试。')
        return false
      } finally {
        setBusyId(null)
        setLoading(false)
      }
    },
    [openCase, setLoading, setError],
  )

  return { open, busyId }
}

/**
 * 首屏与裁判员进场默认打开哪一剑。
 *
 * 优先挑对攻类——那是产品真正要解决的场景；再退到样本最多的那类。
 * 不随机：演示效果不该靠运气。可播性由调用方先筛过，
 * 线上第一次点开就是「画面未分发」的说明板，先入为主之后再解释也晚了。
 */
export function pickFeatured(cases: readonly CaseMeta[]): CaseMeta | undefined {
  const prefer = ['simultaneous_start', 'attack_derobement', 'preparation_vs_attack']
  for (const key of prefer) {
    const hit = cases.find((c) => c.scenario === key)
    if (hit) return hit
  }
  return cases[0]
}
