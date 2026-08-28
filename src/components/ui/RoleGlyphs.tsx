/**
 * 三个身份的图形标记。
 *
 * 不用通用图标库：那种「一个人形代表教练、一个放大镜代表研究」的图，
 * 放在击剑判罚工具里会显得是随手拼的。这里三个都画本行当里的具体东西——
 * 裁判员是电子计分器和红黄牌、教练员是带训剪影、研究者是数据面板。
 *
 * 颜色策略：结构线走 currentColor（由卡片的强调色驱动），
 * 只有本身带语义的元素用固定色——计分器的左红右绿是记分灯语义，
 * 红黄牌是罚牌语义，这两处不能跟着强调色变，否则就说错了。
 */

interface GlyphProps {
  size?: number
  className?: string
}

const BASE = {
  fill: 'none',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

/** 裁判员：电子计分器 + 红黄牌 */
export function RefereeGlyph({ size = 48, className }: GlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={className}
      aria-hidden="true"
      role="presentation"
    >
      {/* 罚牌：黄牌在后、红牌在前，微微扇开 */}
      <g>
        <rect
          x="29"
          y="4"
          width="10.5"
          height="15"
          rx="1.6"
          transform="rotate(-13 34.25 11.5)"
          fill="var(--warn)"
          opacity="0.85"
        />
        <rect
          x="34"
          y="7"
          width="10.5"
          height="15"
          rx="1.6"
          transform="rotate(11 39.25 14.5)"
          fill="var(--left)"
        />
      </g>

      {/* 计分器机箱 */}
      <rect
        x="3"
        y="21"
        width="30"
        height="17"
        rx="3"
        {...BASE}
        stroke="currentColor"
        strokeWidth="2"
      />
      {/* 记分灯：左红右绿，这是击剑既有语义，不跟强调色变 */}
      <circle cx="12" cy="29.5" r="3.6" fill="var(--left)" />
      <circle cx="24" cy="29.5" r="3.6" fill="var(--right)" />
      {/* 机脚 */}
      <path d="M10 38v3.5M26 38v3.5" {...BASE} stroke="currentColor" strokeWidth="2" opacity="0.5" />
    </svg>
  )
}

/** 教练员：带学员训练的剪影——一人示范、一人弓步 */
export function CoachGlyph({ size = 48, className }: GlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={className}
      aria-hidden="true"
      role="presentation"
    >
      <g fill="currentColor">
        {/* 教练：站姿，手臂前伸指点 */}
        <circle cx="10" cy="10.5" r="4" />
        <path d="M6.5 16h7l1 13.5 2.5 12h-4l-2.2-9.5-2.2 9.5h-4l2.5-12z" />
        <path d="M13.5 18.5l11-1.8v3.4l-11 1.8z" />
      </g>

      <g fill="currentColor" opacity="0.62">
        {/* 学员：弓步，持剑臂前伸 */}
        <circle cx="30.5" cy="14" r="3.6" />
        <path d="M27 19h7l1.4 9.5h-9.8z" />
        {/* 前腿蹬出 */}
        <path d="M34.4 28.5l8.6 9.6-2.9 2.6-8.4-9.4z" />
        {/* 后腿撑直 */}
        <path d="M27.2 28.5l-6.6 9.4 2.9 2.6 6.4-9.2z" />
      </g>
      {/* 学员的剑 */}
      <path
        d="M34 21.5L45.5 18"
        {...BASE}
        stroke="currentColor"
        strokeWidth="1.6"
        opacity="0.62"
      />
    </svg>
  )
}

/** 研究者：数据面板——柱状分布加一条趋势线 */
export function ResearcherGlyph({ size = 48, className }: GlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={className}
      aria-hidden="true"
      role="presentation"
    >
      <rect
        x="3.5"
        y="7.5"
        width="41"
        height="33"
        rx="3"
        {...BASE}
        stroke="currentColor"
        strokeWidth="2"
      />
      {/* 柱：高度不齐才像真数据，等高会读成装饰条纹 */}
      <g fill="currentColor">
        <rect x="9" y="27" width="4.5" height="8" rx="1" opacity="0.4" />
        <rect x="16.5" y="22" width="4.5" height="13" rx="1" opacity="0.55" />
        <rect x="24" y="29" width="4.5" height="6" rx="1" opacity="0.4" />
        <rect x="31.5" y="18" width="4.5" height="17" rx="1" opacity="0.75" />
      </g>
      {/* 趋势线与观测点 */}
      <path
        d="M9 24l7.5-5 7.5 3.5 7.5-8"
        {...BASE}
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <g fill="currentColor">
        <circle cx="9" cy="24" r="1.7" />
        <circle cx="16.5" cy="19" r="1.7" />
        <circle cx="24" cy="22.5" r="1.7" />
        <circle cx="31.5" cy="14.5" r="1.7" />
      </g>
    </svg>
  )
}
