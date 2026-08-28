import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
    // 监听所有网卡而不是只监听 localhost。
    // 默认配置在这台机器上只绑定到了 IPv6 回环 [::1]，
    // 浏览器若把 localhost 解析成 127.0.0.1 就会连不上。
    // 绑定 0.0.0.0 同时覆盖 IPv4/IPv6，也让现场可以用手机或平板
    // 通过局域网地址打开演示。
    host: '0.0.0.0',
  },
  preview: {
    port: 5174,
    strictPort: true,
    host: '0.0.0.0',
  },
  build: {
    // 姿态模型与 WASM 运行时体积大且按需加载，不必为它们报警
    chunkSizeWarningLimit: 1200,
  },
})
