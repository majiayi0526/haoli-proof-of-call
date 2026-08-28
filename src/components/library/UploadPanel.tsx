import { useRef, useState } from 'react'
import { useBrowserExtractor } from '../../hooks/useBrowserExtractor'
import type { CaseMeta } from '../../domain/types'
import { useStore } from '../../store'
import './library.css'

/**
 * 上传自己的视频。
 *
 * 这个入口的意义不只是「多一个功能」：它让整套判据可以被任何人拿自己的
 * 素材检验，而不是只能看我们挑好的案例。缺点也如实写在界面上——
 * 浏览器端用的是 MediaPipe，双人漏检比离线的 YOLOv8 管线明显更多。
 */
export function UploadPanel() {
  const inputRef = useRef<HTMLInputElement>(null)
  /** 上一段上传视频的对象地址。换片时释放，否则整个文件会一直留在内存里 */
  const lastUrlRef = useRef<string | null>(null)
  const { extract, progress } = useBrowserExtractor()
  const openCase = useStore((s) => s.openCase)
  const setError = useStore((s) => s.setError)
  const [note, setNote] = useState<string | null>(null)

  const onFile = async (file: File) => {
    setNote(null)
    try {
      const { track, url } = await extract(file, 30)
      const q = track.quality
      if (q && q.validCoverage < 0.05) {
        setNote(
          `这段视频里几乎没有可用于判罚的帧（有效帧 ${Math.round(q.validCoverage * 100)}%）。` +
            `常见原因：不是侧面机位、两人不同时在画面内、或画面中有其他人体干扰。` +
            `仍可打开查看，但结论会是「证据不足」。`,
        )
      }
      // 换片：上一段的对象地址此刻已无人引用（openCase 马上会换掉播放台）
      if (lastUrlRef.current) URL.revokeObjectURL(lastUrlRef.current)
      lastUrlRef.current = url

      const meta: CaseMeta = {
        id: `upload-${Date.now()}`,
        title: file.name.replace(/\.[^.]+$/, ''),
        scenario: 'simultaneous_start',
        scenarioZh: '自行上传',
        scenarioDesc: '未经专家分类，无标注答案可对照',
        expertVerdict: 'insufficient',
        file: url,
        fps: track.fps,
        width: track.width,
        height: track.height,
        duration: track.frames.length / track.fps,
        frames: track.frames.length,
        slowMotion: false,
        hasTrack: true,
      }
      openCase(meta, track)
    } catch (e: unknown) {
      setError(
        e instanceof Error
          ? e.message
          : '这段视频没能解析出来。换一段侧面机位、两人完整入画的片段试试。',
      )
    }
  }

  const busy = progress.phase === 'loading-model' || progress.phase === 'extracting'
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0

  return (
    <aside className="upl">
      <h2 className="upl__title">上传自己的视频</h2>
      <p className="upl__lede">
        尽量上传侧面机位、两人完整入画的佩剑片段。
      </p>

      <button
        className="upl__drop"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        type="button"
      >
        {busy ? (
          <>
            <span className="upl__pct num">{pct}%</span>
            <span className="upl__phase">{progress.message}</span>
            <span className="upl__bar">
              <span className="upl__fill" style={{ width: `${pct}%` }} />
            </span>
          </>
        ) : (
          <>
            <span className="upl__icon" aria-hidden="true">
              ⬒
            </span>
            <span className="upl__cta">选择一段佩剑视频</span>
            <span className="upl__hint">MP4 / MOV · 建议 10 秒内</span>
          </>
        )}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void onFile(f)
          e.target.value = ''
        }}
      />

      {note && <p className="upl__note">{note}</p>}

      <p className="upl__disclosure">
        <strong>关于这条路径的实话：</strong>
        浏览器端用 MediaPipe，在双人对抗画面上的漏检明显高于内置案例所用的
        YOLOv8-Pose 离线管线（实测同一段素材漏检率 69% vs 21%）。
        提取结果会标出来源与质量指标，不会假装两者一样准。
      </p>
    </aside>
  )
}
