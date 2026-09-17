@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 未检测到 Node.js。
  echo 请先安装 Node.js（https://nodejs.org），或直接双击 index.html 使用（此方式无法获取手机定位）。
  pause
  exit /b 1
)
echo 正在启动课表助手...
start "" http://localhost:8080/
node serve.js
pause
