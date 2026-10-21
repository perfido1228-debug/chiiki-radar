#!/bin/bash
# 地域密着レーダー（PC版）を1回だけ巡回する。
cd "$(dirname "$0")" || exit 1
for p in /opt/homebrew/bin /usr/local/bin; do [ -x "$p/node" ] && export PATH="$p:$PATH"; done
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js が見つかりません。はじめに.txt を読んで、Claude に設定を頼んでください。"
  read -r -p "Enter キーで閉じます" _
  exit 1
fi
node app/crawl.mjs --max-pages=30
read -r -p "Enter キーで閉じます" _
