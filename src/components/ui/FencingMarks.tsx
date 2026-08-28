import type { Weapon } from '../../domain/weapons'

/**
 * 击剑图形元素。
 *
 * 三个剑种在现实里最直观的区别就是护手：佩剑是护住手背的弯形护手，
 * 花剑是小圆盘，重剑是大得多的钟形护盘。击剑的人一眼就能认出来，
 * 所以剑种切换用它做标识比用文字标签或通用图标都自然。
 * 线条按剑的实际比例画，不做卡通化。
 */
export function WeaponGlyph({
  weapon,
  size = 20,
  className,
}: {
  weapon: Weapon
  size?: number
  className?: string
}) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.4,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    'aria-hidden': true as const,
  }

  if (weapon === 'sabre') {
    return (
      <svg {...common}>
        {/* 佩剑：弯形护手包住手背，刃略带弧度 */}
        <path d="M20.5 3.5 8.8 15.2" />
        <path d="M8.6 15.4c-1.6-1.6-3.6-1.5-4.6-.4-1 1.1-.9 3 .5 4.4 1.4 1.4 3.3 1.5 4.4.5" />
        <path d="m6.2 17.8 2.6 2.6" />
        <path d="m4.4 19.6-1.6 1.6" />
      </svg>
    )
  }

  if (weapon === 'foil') {
    return (
      <svg {...common}>
        {/* 花剑：小圆护手，细直刃 */}
        <path d="M20.5 3.5 9.6 14.4" />
        <circle cx="8.2" cy="15.8" r="2.6" />
        <path d="m6.3 17.7-3.5 3.5" />
      </svg>
    )
  }

  return (
    <svg {...common}>
      {/* 重剑：明显更大的钟形护盘 */}
      <path d="M20.5 3.5 10.6 13.4" />
      <path d="M13.2 12.1a5 5 0 0 0-6.8 6.8" />
      <path d="m6.4 18.9-3.6 2.3" />
      <path d="m9.4 11.9 2.4 2.4" />
    </svg>
  )
}

/** 剑道端线与中线：用作页面的结构性装饰，不承载信息 */
export function PisteRule({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 400 12"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <line x1="0" y1="6" x2="400" y2="6" stroke="currentColor" strokeWidth="1" opacity="0.35" />
      <line x1="200" y1="0" x2="200" y2="12" stroke="currentColor" strokeWidth="1.4" />
      <line x1="80" y1="2" x2="80" y2="10" stroke="currentColor" strokeWidth="1" opacity="0.6" />
      <line x1="320" y1="2" x2="320" y2="10" stroke="currentColor" strokeWidth="1" opacity="0.6" />
    </svg>
  )
}

/** 击剑面罩剪影 */
export function MaskGlyph({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 2.6c3.6 0 5.9 2.4 5.9 6.2 0 3.4-1 6.6-2.3 8.7-.7 1.1-1.5 1.7-2.3 1.9l-.5 2.2h-1.6l-.5-2.2c-.8-.2-1.6-.8-2.3-1.9C7.1 15.4 6.1 12.2 6.1 8.8 6.1 5 8.4 2.6 12 2.6Z" />
      <path d="M7.4 9.4h9.2M7.8 12.4h8.4M8.8 15.4h6.4" opacity="0.55" />
    </svg>
  )
}

/** 交叉双剑：用于品牌标识 */
export function CrossedBlades({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M4 3.5 17 16.5" />
      <path d="M20 3.5 7 16.5" />
      <path d="m5.5 18.5 3-3M18.5 18.5l-3-3" />
    </svg>
  )
}
