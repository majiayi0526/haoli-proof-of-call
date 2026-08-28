#!/bin/bash
# 下载浏览器端姿态提取所需的模型与 WASM 运行时。
# 这些文件不进仓库（共约 30MB），但演示与上传自测功能依赖它们。
# 全部放在 public/ 下本地加载，因此断网也能运行。
set -e
cd "$(dirname "$0")/.."

mkdir -p public/models public/wasm

if [ ! -f public/models/pose_landmarker_full.task ]; then
  echo "下载 MediaPipe Pose Landmarker (full)…"
  curl -sL -o public/models/pose_landmarker_full.task \
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task"
fi

if [ ! -f public/wasm/vision_wasm_internal.wasm ]; then
  echo "复制 MediaPipe WASM 运行时…"
  if [ ! -d node_modules/@mediapipe/tasks-vision ]; then
    echo "请先运行 npm install" >&2
    exit 1
  fi
  cp node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.* public/wasm/
  cp node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_nosimd_internal.* public/wasm/
fi

echo "资源就绪：$(du -sh public/models public/wasm | tr '\n' ' ')"
