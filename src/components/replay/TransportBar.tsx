import { useEffect } from 'react'
import { useStore } from '../../store'

const RATES = [0.1, 0.25, 0.5, 1]

/**
 * 传输控制。
 *
 * 佩剑对攻的胜负差常在 100ms 以内，1x 播放根本看不清。
 * 因此默认提供到 0.1x，并且逐帧步进用方向键——裁判在回放时
 * 真正需要的是「一帧一帧地挪」，不是一个漂亮的播放器。
 */
export function TransportBar() {
  const track = useStore((s) => s.track)
  const frame = useStore((s) => s.frame)
  const playing = useStore((s) => s.playing)
  const rate = useStore((s) => s.rate)
  const showSkeleton = useStore((s) => s.showSkeleton)
  const showBlade = useStore((s) => s.showBlade)
  const setFrame = useStore((s) => s.setFrame)
  const stepFrame = useStore((s) => s.stepFrame)
  const setPlaying = useStore((s) => s.setPlaying)
  const setRate = useStore((s) => s.setRate)
  const toggleSkeleton = useStore((s) => s.toggleSkeleton)
  const toggleBlade = useStore((s) => s.toggleBlade)

  const total = track?.frames.length ?? 1

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        stepFrame(e.shiftKey ? -10 : -1)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        stepFrame(e.shiftKey ? 10 : 1)
      } else if (e.key === ' ') {
        e.preventDefault()
        setPlaying(!useStore.getState().playing)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [stepFrame, setPlaying])

  return (
    <div className="transport">
      <div className="transport__group">
        <button
          className="transport__btn transport__btn--play"
          onClick={() => setPlaying(!playing)}
          type="button"
        >
          {playing ? '❚❚ 暂停' : '▶ 播放'}
        </button>
      </div>

      <div className="transport__group">
        <button className="transport__btn" onClick={() => stepFrame(-10)} type="button" title="后退 10 帧 (Shift+←)">
          ⏴⏴
        </button>
        <button className="transport__btn" onClick={() => stepFrame(-1)} type="button" title="后退 1 帧 (←)">
          ⏴
        </button>
        <button className="transport__btn" onClick={() => stepFrame(1)} type="button" title="前进 1 帧 (→)">
          ⏵
        </button>
        <button className="transport__btn" onClick={() => stepFrame(10)} type="button" title="前进 10 帧 (Shift+→)">
          ⏵⏵
        </button>
      </div>

      <input
        className="transport__scrub"
        type="range"
        min={0}
        max={Math.max(0, total - 1)}
        value={frame}
        onChange={(e) => {
          setPlaying(false)
          setFrame(Number(e.target.value))
        }}
        aria-label="时间轴"
      />

      <div className="transport__sep" />

      <div className="transport__group">
        {RATES.map((r) => (
          <button
            key={r}
            className={`transport__btn${rate === r ? ' is-active' : ''}`}
            onClick={() => setRate(r)}
            type="button"
            title={`${r}× 速度`}
          >
            {r}×
          </button>
        ))}
      </div>

      <div className="transport__sep" />

      <div className="transport__group">
        <button
          className={`transport__btn${showSkeleton ? ' is-active' : ''}`}
          onClick={toggleSkeleton}
          type="button"
        >
          骨骼
        </button>
        <button
          className={`transport__btn${showBlade ? ' is-active' : ''}`}
          onClick={toggleBlade}
          type="button"
          title="剑身为估算量，非观测"
        >
          估算剑身
        </button>
      </div>

      <span className="transport__hint">← → 逐帧 · Shift 加速 · 空格播放</span>
    </div>
  )
}
