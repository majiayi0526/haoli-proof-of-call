import { useState } from 'react'
import { WEAPONS } from '../../domain/weapons'
import { useStore } from '../../store'
import './shell.css'

/**
 * 裁判器接入。
 *
 * 产品的下一步是一台内置本应用的机器，通过硬件盒子接到赛场的电子计分器上。
 * 这件事之所以重要，不是「多一个数据源」，而是它补上了视觉分析最硬的短板：
 *
 *   · 裁判器给的是「打没打中、两次击中相差几毫秒」——电信号，毫秒级，权威
 *   · 视觉分析给的是「这一剑该判给谁、凭什么」——优先权依据
 *
 * 两者不重叠。有了裁判器信号，「剑尖触及时刻」这个当前只能靠外推估算、
 * 置信度被压在 0.6 的量，就能升级成观测量；重剑更是直接以它为主依据。
 *
 * 这个面板现在只做状态展示与说明——没有硬件时不假装连上了。
 */
export function ScoringBox() {
  const state = useStore((s) => s.scoringBox)
  const setState = useStore((s) => s.setScoringBox)
  const weapon = useStore((s) => s.weapon)
  const [open, setOpen] = useState(false)

  const label =
    state === 'connected'
      ? '裁判器已连接'
      : state === 'simulated'
        ? '裁判器 · 模拟信号'
        : state === 'connecting'
          ? '正在连接裁判器'
          : '裁判器未连接'

  return (
    <div className="sbox">
      <button
        className={`sbox__btn sbox__btn--${state}`}
        onClick={() => setOpen(!open)}
        type="button"
        title="电子计分器接入状态"
      >
        <span className="sbox__dot" />
        <span className="sbox__label">{label}</span>
      </button>

      {open && (
        <div className="sbox__pop">
          <h4>裁判器接入</h4>
          <p className="sbox__lede">
            下一步的形态是一台内置本应用的机器，通过硬件盒子接到赛场的电子计分裁判器。
            用于补充视觉效果差／光源不稳定的情况，更加迅速地给出信号。
          </p>

          <dl className="sbox__split">
            <div>
              <dt>裁判器负责</dt>
              <dd>打没打中与两次击中相差几毫秒。</dd>
            </div>
            <div>
              <dt>视觉分析负责</dt>
              <dd>这一剑该判给谁、凭什么。</dd>
            </div>
          </dl>

          <p className="sbox__gain">
            接上之后，<strong>「剑尖触及时刻」</strong>这个目前只能靠外推估算、
            置信度被压在 0.6 的量，会直接升级成观测量——
            当前「已知边界」里最要紧的一条随之解除。
            {weapon === 'epee' && (
              <>
                {' '}
                重剑没有优先权规则（{WEAPONS.epee.lockoutMs}ms 内互中双方得分），
                将直接以裁判器信号为主依据。
              </>
            )}
          </p>

          <div className="sbox__acts">
            <button
              className="sbox__act"
              onClick={() => setState(state === 'simulated' ? 'disconnected' : 'simulated')}
              type="button"
            >
              {state === 'simulated' ? '关闭模拟信号' : '开启模拟信号（演示用）'}
            </button>
            <span className="sbox__note">
              没有硬件时不会假装连上。模拟信号仅用于演示接入后的界面形态。
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
