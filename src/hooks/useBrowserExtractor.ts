import { useCallback, useRef, useState } from 'react'
import type { FrameSample, JointName, PoseTrack, Skeleton } from '../domain/types'

/**
 * 浏览器端骨骼提取。
 *
 * 诚实说明：内置案例的骨骼数据由离线的 YOLOv8-Pose + BoT-SORT 管线生成，
 * 而浏览器里跑的是 MediaPipe Pose Landmarker。后者在双人对抗画面上的
 * 漏检率明显更高（实测同一段素材，MediaPipe 有 69% 的帧只认出一个人，
 * YOLOv8 只有 21%）。选择它是因为它能在纯前端跑，评委点开链接就能用
 * 自己的视频试。提取结果里的 extractor 字段会如实标出来源，
 * 质量指标也会直接显示——不掩饰这条路径更弱。
 */

const MP_TO_COCO: Array<[JointName, number]> = [
  ['nose', 0],
  ['left_eye', 2],
  ['right_eye', 5],
  ['left_ear', 7],
  ['right_ear', 8],
  ['left_shoulder', 11],
  ['right_shoulder', 12],
  ['left_elbow', 13],
  ['right_elbow', 14],
  ['left_wrist', 15],
  ['right_wrist', 16],
  ['left_hip', 23],
  ['right_hip', 24],
  ['left_knee', 25],
  ['right_knee', 26],
  ['left_ankle', 27],
  ['right_ankle', 28],
]

const TORSO_IDX = [11, 12, 23, 24]

interface Landmark {
  x: number
  y: number
  visibility?: number
}

export interface ExtractProgress {
  phase: 'idle' | 'loading-model' | 'extracting' | 'done' | 'error'
  done: number
  total: number
  message?: string
}

function toSkeleton(lms: Landmark[], w: number, h: number): Skeleton {
  const sk: Skeleton = {}
  for (const [name, idx] of MP_TO_COCO) {
    const l = lms[idx]
    if (!l) continue
    sk[name] = {
      x: Math.round(l.x * w * 100) / 100,
      y: Math.round(l.y * h * 100) / 100,
      c: Math.round((l.visibility ?? 0) * 1000) / 1000,
    }
  }
  return sk
}

function torsoOf(lms: Landmark[], w: number, h: number): [number, number] | null {
  const pts = TORSO_IDX.map((i) => lms[i]).filter((l) => l && (l.visibility ?? 0) > 0.2)
  if (!pts.length) return null
  return [
    (pts.reduce((a, p) => a + p.x, 0) / pts.length) * w,
    (pts.reduce((a, p) => a + p.y, 0) / pts.length) * h,
  ]
}

function bboxArea(lms: Landmark[], w: number, h: number): number {
  const vis = lms.filter((l) => (l.visibility ?? 0) > 0.2)
  if (vis.length < 4) return 0
  const xs = vis.map((l) => l.x * w)
  const ys = vis.map((l) => l.y * h)
  return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys))
}

const d2 = (a: [number, number], b: [number, number]) =>
  (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2

export function useBrowserExtractor() {
  const [progress, setProgress] = useState<ExtractProgress>({
    phase: 'idle',
    done: 0,
    total: 0,
  })
  const landmarkerRef = useRef<unknown>(null)

  const extract = useCallback(
    async (file: File, fps = 30): Promise<{ track: PoseTrack; url: string }> => {
      setProgress({ phase: 'loading-model', done: 0, total: 0, message: '载入姿态模型…' })

      const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision')
      const base = import.meta.env.BASE_URL

      if (!landmarkerRef.current) {
        const vision = await FilesetResolver.forVisionTasks(`${base}wasm`)
        landmarkerRef.current = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `${base}models/pose_landmarker_full.task`,
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numPoses: 2,
          minPoseDetectionConfidence: 0.4,
          minPosePresenceConfidence: 0.4,
          minTrackingConfidence: 0.4,
        })
      }
      const landmarker = landmarkerRef.current as {
        detectForVideo: (
          v: HTMLVideoElement,
          ts: number,
        ) => { landmarks?: Landmark[][] }
      }

      const url = URL.createObjectURL(file)
      const video = document.createElement('video')
      video.src = url
      video.muted = true
      video.playsInline = true

      await new Promise<void>((res, rej) => {
        video.onloadedmetadata = () => res()
        video.onerror = () => rej(new Error('这个视频打不开。建议换成 MP4 或 MOV 格式。'))
      })

      const w = video.videoWidth
      const h = video.videoHeight
      const duration = video.duration
      const total = Math.max(1, Math.floor(duration * fps))

      setProgress({ phase: 'extracting', done: 0, total, message: '逐帧提取骨骼…' })

      const frames: FrameSample[] = []
      let prev: { left: [number, number] | null; right: [number, number] | null } = {
        left: null,
        right: null,
      }
      let both = 0

      for (let i = 0; i < total; i++) {
        const t = i / fps
        video.currentTime = t
        await new Promise<void>((res) => {
          const on = () => {
            video.removeEventListener('seeked', on)
            res()
          }
          video.addEventListener('seeked', on)
        })

        const res = landmarker.detectForVideo(video, Math.round(t * 1000))
        const sample: FrameSample = { frame: i, t: Math.round(t * 10000) / 10000 }

        const poses = (res.landmarks ?? [])
          .map((lms) => ({ lms, c: torsoOf(lms, w, h), area: bboxArea(lms, w, h) }))
          .filter((p): p is { lms: Landmark[]; c: [number, number]; area: number } => !!p.c)
          .sort((a, b) => b.area - a.area)
          .slice(0, 2)

        if (poses.length >= 2) {
          const [a, b] = poses
          let pair: [typeof a, typeof b]
          if (prev.left && prev.right) {
            const direct = d2(a.c, prev.left) + d2(b.c, prev.right)
            const swapped = d2(b.c, prev.left) + d2(a.c, prev.right)
            pair = direct <= swapped ? [a, b] : [b, a]
          } else {
            pair = a.c[0] <= b.c[0] ? [a, b] : [b, a]
          }
          sample.left = toSkeleton(pair[0].lms, w, h)
          sample.right = toSkeleton(pair[1].lms, w, h)
          prev = { left: pair[0].c, right: pair[1].c }
          both++
        } else if (poses.length === 1) {
          const p = poses[0]
          let side: 'left' | 'right' = 'left'
          if (prev.left && prev.right) {
            side = d2(p.c, prev.left) <= d2(p.c, prev.right) ? 'left' : 'right'
          }
          sample[side] = toSkeleton(p.lms, w, h)
          prev = { ...prev, [side]: p.c }
        }

        frames.push(sample)
        if (i % 8 === 0) {
          setProgress({ phase: 'extracting', done: i, total, message: '逐帧提取骨骼…' })
          await new Promise((r) => setTimeout(r, 0))
        }
      }

      const { findSegments } = await import('../lib/segment')
      const partial: PoseTrack = {
        fps,
        width: w,
        height: h,
        frames,
        extractor: 'mediapipe-pose-landmarker-full(browser)',
        extractedAt: new Date().toISOString(),
      }
      const { segments, rejections } = findSegments(partial)

      const track: PoseTrack = {
        ...partial,
        segments,
        gateRejections: rejections,
        quality: {
          totalFrames: frames.length,
          framesWithBothFencers: both,
          bothCoverage: Math.round((both / Math.max(1, frames.length)) * 1000) / 1000,
          validSegments: segments.length,
          validFrames: segments.reduce((a, s) => a + s.frames, 0),
          validCoverage:
            Math.round(
              (segments.reduce((a, s) => a + s.frames, 0) / Math.max(1, frames.length)) * 1000,
            ) / 1000,
        },
      }

      setProgress({ phase: 'done', done: total, total })
      return { track, url }
    },
    [],
  )

  return { extract, progress }
}
