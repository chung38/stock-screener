@echo off
chcp 65001 >nul
title 三重共振選股
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo 找不到 Node.js。請先到 https://nodejs.org 下載安裝 LTS 版，裝完再雙擊這個檔案。
  pause
  exit /b
)

if not exist node_modules (
  echo 第一次使用，安裝套件中，約 1 分鐘...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo 套件安裝失敗，請檢查網路後再試一次。
    pause
    exit /b
  )
)

if not exist dist\index.html (
  echo 建置網頁中...
  call npm run build
  if errorlevel 1 (
    pause
    exit /b
  )
)

echo.
echo 選股程式啟動中，瀏覽器會自動打開 http://localhost:3000
echo 用完直接關掉這個視窗即可。
echo.
set OPEN_BROWSER=1
node server/index.js
pause
