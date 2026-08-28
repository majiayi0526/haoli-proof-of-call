import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { assumptionValue } from '../../domain/assumptions'
import { frameAtTime, playbackTimeOfFrame, timeOfFrame } from '../../domain/kinematics'
import type { JointName, MotionEvent, Side } from '../../domain/types'
import { narrateEvent } from '../../domain/narrate'
import { captureEvidenceFrame, downloadDataUrl } from '../../lib/capture'
import { CLIP_WITHHELD_NOTE } from '../../lib/clipAccess'
import { drawFocus, drawSkeleton, fitContain } from '../../lib/draw'
import { useStore } from '../../store'
import './replay.css'

/** 当前被追问的证据看的是哪几个关节 —— 让「依据」在画面上有落点 */
const FOCUS_JOINTS: Record<string, JointName[]> = {
  arm_extension_start: ['left_elbow', 'right_elbow'],
  front_foot_start: ['left_ankle', 'right_ankle'],
  rear_foot_advance: ['left_ankle', 'right_ankle'],
  front_foot_land: ['left_ankle', 'right_ankle'],
  arm_withdraw: ['left_elbow', 'right_elbow'],
  blade_contact: ['left_wrist', 'right_wrist'],
}

interface Props {
  /** 转播画面地址。线上未分发该片段时为空，此时只跑骨骼与证据链 */
  src?: string | null
  /** 与当前选中证据关联的事件，用于在画面上打标记 */
  focusEvent?: MotionEvent | null
  /** 全部检出事件，用于截图时标注该帧对应的证据 */
  events?: MotionEvent[]
  /** 结论一句话，写进截图 */
  verdictLine?: string
  caseTitle?: string
}

/** 截图时把这个时间窗内的事件算作「该帧的证据」 */
const CAPTURE_WINDOW_S = 0.15

export function ReplayStage({
  src,
  focusEvent,
  events = [],
  verdictLine,
  caseTitle = '',
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const seekingRef = useRef(false)

  const track = useStore((s) => s.track)
  const frame = useStore((s) => s.frame)
  const playing = useStore((s) => s.playing)
  const rate = useStore((s) => s.rate)
  const showSkeleton = useStore((s) => s.showSkeleton)
  const showBlade = useStore((s) => s.showBlade)
  const assumptions = useStore((s) => s.assumptions)
  const setFrame = useStore((s) => s.setFrame)
  const setPlaying = useStore((s) => s.setPlaying)

  const [box, setBox] = useState({ w: 0, h: 0 })
  const [videoReady, setVideoReady] = useState(false)

  /**
   * 无画面模式。转播片段未随线上版本分发时走这条路：
   * 骨骼、证据链、逐帧、慢放、假设重算全部照常，只是没有画面垫在底下。
   */
  const videoless = !src
  const ready = videoless || videoReady

  const fps = track?.fps ?? 60
  const bladeRatio = useMemo(
    () => assumptionValue(assumptions, 'blade_tip_ratio'),
    [assumptions],
  )

  // 容器尺寸
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => {
      const r = e.contentRect
      setBox({ w: r.width, h: r.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // 播放/暂停
  useEffect(() => {
    const v = videoRef.current
    if (!v || videoless) return
    v.playbackRate = rate
    if (playing) void v.play().catch(() => setPlaying(false))
    else v.pause()
  }, [playing, rate, setPlaying, videoless])

  // 外部改帧 → seek 视频（播放中不 seek，避免抖动）
  // 目标时间取自该帧的真实时间戳：素材是可变帧率，用 frame/fps 会错位
  useEffect(() => {
    const v = videoRef.current
    if (!v || videoless || !track || playing || !ready) return
    const target = playbackTimeOfFrame(track, frame)
    if (Math.abs(v.currentTime - target) > 0.5 / fps) {
      seekingRef.current = true
      v.currentTime = target
    }
  }, [frame, fps, playing, ready, track, videoless])

  // 播放中：跟随视频时间推进帧号。
  //
  // 优先用 requestVideoFrameCallback——它在每个「视频帧真正被合成」时回调一次，
  // 和画面严格同步。这正是「证据跟随慢放实时点亮」需要的语义：
  // 0.1 倍速下视频每秒只出几帧，rAF 却仍以 60Hz 空转，既浪费也会让
  // 证据条的点亮时机和画面对不齐。rVFC 还能在标签页被节流时保持与视频一致，
  // 避免回到前台时帧号突然跳一大段。老浏览器回退到 rAF。
  useEffect(() => {
    const v = videoRef.current
    if (!v || videoless || !playing || !track) return

    const total = track.frames.length
    let cancelled = false
    let rafId = 0
    let vfcId = 0

    const advance = () => {
      const f = frameAtTime(track, v.currentTime)
      if (f >= total - 1) {
        setPlaying(false)
        setFrame(total - 1)
        return false
      }
      setFrame(f)
      return true
    }

    type WithVFC = HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: () => void) => number
      cancelVideoFrameCallback?: (id: number) => void
    }
    const vv = v as WithVFC

    if (typeof vv.requestVideoFrameCallback === 'function') {
      const onFrame = () => {
        if (cancelled) return
        if (advance()) vfcId = vv.requestVideoFrameCallback!(onFrame)
      }
      vfcId = vv.requestVideoFrameCallback(onFrame)
      return () => {
        cancelled = true
        vv.cancelVideoFrameCallback?.(vfcId)
      }
    }

    const tick = () => {
      if (cancelled) return
      if (advance()) rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => {
      cancelled = true
      cancelAnimationFrame(rafId)
    }
  }, [playing, track, setFrame, setPlaying, videoless])

  /**
   * 无画面时的播放时钟。
   *
   * 有视频时帧号由 requestVideoFrameCallback 跟着画面走；没有视频就没有那个
   * 时基，改用挂钟时间乘以倍速，再换算回 track 的真实时间戳取帧。
   * 用 track 的 t 而不是 frame/fps——素材是可变帧率，按帧率推算中位误差
   * 267ms，而判「同时」的阈值只有 40ms。
   */
  useEffect(() => {
    if (!videoless || !playing || !track) return
    const total = track.frames.length

    // 进度按每帧的实际间隔累加，而不是「现在 - 起播时刻」。
    // 后者在标签页被切走时会照常累计挂钟时间，切回来那一下直接跳过
    // 中间几秒——在 0.1× 逐帧核对证据的场景里，这等于把要看的那一段跳没了。
    // 单帧步长再设个上限，掉帧或断点续跑时也不会一下冲过头。
    const MAX_STEP_MS = 100
    // 起播帧直接从 store 现取：放进依赖里会让时钟每帧重建
    let contentT = playbackTimeOfFrame(track, useStore.getState().frame)
    let lastWall = performance.now()
    let id = 0
    let cancelled = false

    const tick = () => {
      if (cancelled) return
      const now = performance.now()
      const stepMs = Math.min(MAX_STEP_MS, now - lastWall)
      lastWall = now
      contentT += (stepMs / 1000) * rate
      // 起点与步进都走 clip 时间轴——frameAtTime 内部搜的就是这条轴
      const f = frameAtTime(track, contentT)
      if (f >= total - 1) {
        setFrame(total - 1)
        setPlaying(false)
        return
      }
      setFrame(f)
      id = requestAnimationFrame(tick)
    }

    id = requestAnimationFrame(tick)
    return () => {
      cancelled = true
      cancelAnimationFrame(id)
    }
  }, [videoless, playing, rate, track, setFrame, setPlaying])

  // 绘制骨骼
  const paint = useCallback(() => {
    const cv = canvasRef.current
    if (!cv || !track) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const w = box.w
    const h = box.h
    if (!w || !h) return
    if (cv.width !== w * dpr || cv.height !== h * dpr) {
      cv.width = w * dpr
      cv.height = h * dpr
      cv.style.width = `${w}px`
      cv.style.height = `${h}px`
    }
    const ctx = cv.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    const fit = fitContain(track.width, track.height, w, h)
    const sample = track.frames[Math.min(frame, track.frames.length - 1)]
    if (!sample) return

    const opts = {
      ...fit,
      showSkeleton,
      showBlade,
      bladeRatio,
      emphasise: (focusEvent?.side ?? null) as Side | null,
    }

    for (const side of ['left', 'right'] as Side[]) {
      const sk = sample[side]
      if (sk) drawSkeleton(ctx, sk, side, opts)
    }

    // 当前证据的关节落点
    if (focusEvent && Math.abs(focusEvent.frame - frame) <= 4) {
      const sk = sample[focusEvent.side]
      const joints = FOCUS_JOINTS[focusEvent.kind]
      if (sk && joints) {
        drawFocus(ctx, sk, joints, focusEvent.side, opts, `f${focusEvent.frame}`)
      }
    }
  }, [track, frame, box, showSkeleton, showBlade, bladeRatio, focusEvent])

  useEffect(() => {
    paint()
  }, [paint])

  const total = track?.frames.length ?? 1

  // 把当前这一帧连同骨骼、时间码和对应证据导出成一张图。
  // 场边最常见的诉求不是点开证据链，而是「把那一帧给我，告诉我第几秒」。
  const capture = useCallback(() => {
    const v = videoRef.current
    if (!track) return
    const sample = track.frames[Math.min(frame, track.frames.length - 1)]
    const now = timeOfFrame(track, frame)
    const near = events
      .filter((e) => Math.abs(e.t - now) <= CAPTURE_WINDOW_S)
      .sort((a, b) => Math.abs(a.t - now) - Math.abs(b.t - now))
      .map(narrateEvent)

    const url = captureEvidenceFrame({
      video: videoless ? null : v,
      skeletons: { left: sample?.left, right: sample?.right },
      videoWidth: track.width,
      videoHeight: track.height,
      frame,
      timeMs: Math.round(now * 1000),
      bladeRatio,
      events: near,
      caseTitle,
      verdictLine,
    })
    if (url) {
      downloadDataUrl(url, `证据帧_${caseTitle || 'case'}_${Math.round(now * 1000)}ms.png`)
    }
  }, [track, frame, events, bladeRatio, caseTitle, verdictLine, videoless])

  return (
    <div className="replay">
      <div className="replay__stage" ref={wrapRef}>
        {videoless ? (
          /* 画面缺席时不留空白：说清楚缺的是什么、没缺的是什么，
             否则看的人只会以为视频加载失败。 */
          <div className="replay__withheld" onClick={() => setPlaying(!playing)}>
            <p className="replay__withheld-title">{CLIP_WITHHELD_NOTE.title}</p>
            <p className="replay__withheld-body">{CLIP_WITHHELD_NOTE.body}</p>
            <p className="replay__withheld-hint">{CLIP_WITHHELD_NOTE.hint}</p>
          </div>
        ) : (
          <video
            ref={videoRef}
            src={src ?? undefined}
            className="replay__video"
            playsInline
            muted
            preload="auto"
            onLoadedMetadata={() => setVideoReady(true)}
            onSeeked={() => {
              seekingRef.current = false
              paint()
            }}
            onClick={() => setPlaying(!playing)}
          />
        )}
        <canvas ref={canvasRef} className="replay__canvas" />

        <div className="replay__lamps" aria-hidden="true">
          <span className="lamp lamp--left" />
          <span className="lamp lamp--right" />
        </div>

        <button
          className="replay__capture"
          onClick={capture}
          type="button"
          title="把这一帧连同骨骼、时间码与对应证据导出为图片"
        >
          截取此帧证据
        </button>

        <div className="replay__timecode num">
          <span className="replay__frame">f{String(frame).padStart(3, '0')}</span>
          <span className="replay__ms">
            {track ? Math.round(timeOfFrame(track, frame) * 1000) : 0} ms
          </span>
          <span className="replay__total">
            / {total} 帧 · {track?.timebase === 'pts' ? '真实时间戳' : `标称 ${fps.toFixed(1)}fps`}
          </span>
        </div>
      </div>
    </div>
  )
}
