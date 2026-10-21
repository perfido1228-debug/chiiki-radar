@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 地域密着レーダー 巡回
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js が見つかりません。はじめに.txt を読んで、Claude に設定を頼んでください。
  pause
  exit /b 1
)
node app\crawl.mjs --max-pages=30
pause
