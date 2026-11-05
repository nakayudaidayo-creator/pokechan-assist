#!/bin/sh
# 計算エンジンを JavaScriptCore 用の1ファイルにまとめる(bun が必要)。
# 中身が変わったときだけ、版の情報(engine-version.json)の番号を上げる。
# アプリは起動時に GitHub 上のこの2ファイルを見て、新しければ取り込む。
set -e
cd "$(dirname "$0")/../.."
OUT=App/Resources/pokechan-engine.js
VER=App/Resources/engine-version.json

bun build Engine/src/ios-entry.js --outfile "$OUT" --target=browser --format=iife --minify

SHA=$(sha256sum "$OUT" | cut -d' ' -f1)
OLD_SHA=$(sed -n 's/.*"sha256": *"\([0-9a-f]*\)".*/\1/p' "$VER" 2>/dev/null || true)
if [ "$SHA" != "$OLD_SHA" ]; then
  # 版番号は日時(UTC)の数字。大きいほど新しい
  VERSION=$(date -u +%Y%m%d%H%M%S)
  printf '{\n  "version": %s,\n  "sha256": "%s"\n}\n' "$VERSION" "$SHA" > "$VER"
  echo "計算エンジンを更新しました(版 $VERSION)"
else
  echo "計算エンジンに変更はありません"
fi
