#!/usr/bin/env bash
# Mac / Linux 啟動：在終端機執行  bash start.sh
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "找不到 Node.js。請先到 https://nodejs.org 下載安裝 LTS 版。"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "第一次使用，安裝套件中，約 1 分鐘..."
  npm install --no-audit --no-fund || exit 1
fi

if [ ! -f dist/index.html ]; then
  echo "建置網頁中..."
  npm run build || exit 1
fi

echo "選股程式啟動中，瀏覽器會自動打開 http://localhost:3000（按 Ctrl+C 結束）"
OPEN_BROWSER=1 node server/index.js
