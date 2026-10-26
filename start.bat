@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 找不到 Node.js，請先安裝：https://nodejs.org
  pause
  exit /b 1
)
if not exist .env (
  copy .env.example .env >nul
  echo 已建立 .env，請用記事本打開並填入 THREADS_ACCESS_TOKEN，存檔後再執行一次本檔案。
  notepad .env
  pause
  exit /b 0
)
start "" http://localhost:3000
node src/server.js
pause
