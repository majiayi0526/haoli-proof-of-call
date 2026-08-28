/**
 * 哪些转播片段可以随线上版本一起分发。
 *
 * 素材是巴黎 2024 奥运会转播画面，版权归原转播方，本地研究用没问题，
 * 但公开托管是另一回事。所以线上只放少数几段，其余案例仍然可以打开——
 * 骨骼数据是我们自己的衍生数据，随仓库分发，证据链一条不少，
 * 只是画面这一层缺席。这不是降级：本项目交付的是证据链，不是播放器。
 *
 * 本地开发（npm run dev）不受限制，18 段全可播。
 * 公开构建（VITE_PUBLIC_BUILD=1）只放白名单里这几段。
 */

/**
 * 线上放这四段，是按「故事是否完整」挑的，不是按「结论是否好看」：
 * 前两段两套口径分歧且系统与专家一致；第三段系统主动判「证据不足」弃权；
 * 第四段系统与专家不一致，用来演示人工推翻。只放对的那些，
 * 等于在挑好看的给人看，与本项目的主张相悖。
 */
export const PUBLIC_CLIP_IDS: readonly string[] = [
  'attack_derobement__右_8',
  'preparation_vs_attack__右_9',
  'preparation_vs_attack__左s_4',
  'simultaneous__SVID_20240813_225935_1',
]

/** 公开构建下素材受限；本地与内网演示不受限 */
export const IS_PUBLIC_BUILD = import.meta.env.VITE_PUBLIC_BUILD === '1'

const PUBLIC_SET = new Set(PUBLIC_CLIP_IDS)

/** 这一剑的转播画面是否随当前构建一起分发 */
export function hasOnlineClip(caseId: string): boolean {
  return !IS_PUBLIC_BUILD || PUBLIC_SET.has(caseId)
}

/**
 * 这一剑的画面该从哪里取。
 *
 * 之前播放台自己按 id 拼 `clips/<id>.mp4`，上传的视频因此永远取不到——
 * 它的 id 是 `upload-<时间戳>`，磁盘上没有这个文件。真正的地址一直在
 * meta.file 里：内置案例是仓库里的相对路径，上传是浏览器给的 blob: 地址。
 * 统一从 meta.file 取，就不会再出现「存在 A、找去 B」。
 *
 * 返回 null 表示确实没有画面可放（内置案例且未随线上版本分发）。
 */
export function clipSrcFor(meta: { id: string; file: string }): string | null {
  // 上传的视频在使用者自己机器上，从没经过服务器，分发限制与它无关
  if (isOwnUpload(meta.file)) return meta.file
  if (!hasOnlineClip(meta.id)) return null
  return `${import.meta.env.BASE_URL}${meta.file}`
}

/** 使用者自己上传的视频（浏览器本地对象地址），不是仓库里的素材 */
export function isOwnUpload(file: string): boolean {
  return file.startsWith('blob:') || file.startsWith('data:')
}

/** 画面缺席时给使用者的说明——说清楚缺的是什么、没缺的是什么 */
export const CLIP_WITHHELD_NOTE = {
  title: '本剑的转播画面未随线上版本分发',
  body: '素材为巴黎 2024 奥运会转播片段，版权归原转播方所有，仅在本地用于研究。骨骼序列与完整证据链在此可查，逐帧、慢放、假设重算、敏感性扫描均不受影响。',
  hint: '需要连画面一起看的，请在案例库里选带「画面在线」标记的几剑。',
} as const
