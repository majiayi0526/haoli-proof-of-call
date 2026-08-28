/**
 * 把构建好的 dist 作为静态站点部署到 Vercel。
 *
 * 为什么要这个脚本，而不是直接 `cd dist && npx vercel --prod`：
 * vercel 首次部署会在当前目录写一个 .vercel/project.json 记住「这次发的是
 * 哪个项目」，之后再发才会更新同一个网址。但 dist 每次构建都会被 vite
 * 整个清空，那个文件跟着没了——下次部署就变成新建项目、换一个新网址，
 * 之前发给评委的链接会指向旧内容。
 *
 * 这里把链接信息存在 dist 之外（.vercel-cache/），部署前放回去、部署后收起来，
 * 于是「网址不变」这件事不再依赖一个会被删掉的目录。
 */

import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const DIST = 'dist'
const CACHE = '.vercel-cache'
const LINK = 'project.json'

if (!existsSync(join(DIST, 'index.html'))) {
  console.error(`${DIST}/ 里没有 index.html。先跑 npm run build:public`)
  process.exit(1)
}

/**
 * 先确认登录状态。
 *
 * 新版 vercel CLI 在未登录时不再自动弹登录流程，而是直接报一句英文错误退出。
 * 构建刚跑完、素材也裁好了，卡在这一步只给一行 no-credentials-found，
 * 不好懂也不知道下一步该干什么。这里提前检测，把该做的事直接写出来。
 */
const who = spawnSync('npx', ['vercel', 'whoami'], { encoding: 'utf8' })
if (who.status !== 0) {
  console.error(
    [
      '',
      'Vercel 还没登录，部署没法继续。',
      '',
      '先跑这一条，浏览器会打开授权页面（选 Continue with GitHub）：',
      '',
      '    npx vercel login',
      '',
      '登录成功后再跑一次 npm run deploy 就行。构建产物已经在 dist/ 里，不用重来。',
      '',
    ].join('\n'),
  )
  process.exit(1)
}
console.log(`已登录 Vercel：${who.stdout.trim()}`)

// 把上次的链接信息放回 dist，让 vercel 认出这是同一个项目
const cached = join(CACHE, LINK)
const live = join(DIST, '.vercel', LINK)
if (existsSync(cached)) {
  mkdirSync(join(DIST, '.vercel'), { recursive: true })
  copyFileSync(cached, live)
  console.log('已恢复上次的项目链接，本次部署会更新同一个网址')
} else {
  console.log('首次部署：vercel 会问你登录、项目名等几个问题，按提示走完即可')
}

const r = spawnSync('npx', ['vercel', '--prod'], { cwd: DIST, stdio: 'inherit' })

// 收起链接信息，免得下次构建把它清掉
if (existsSync(live)) {
  mkdirSync(CACHE, { recursive: true })
  copyFileSync(live, cached)
  console.log(`\n项目链接已存到 ${CACHE}/，下次 npm run deploy 会发到同一个网址`)
}

process.exit(r.status ?? 1)
