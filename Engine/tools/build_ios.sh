#!/bin/sh
# 計算エンジンを JavaScriptCore 用の1ファイルにまとめる(bun が必要)
cd "$(dirname "$0")/../.." || exit 1
bun build Engine/src/ios-entry.js --outfile App/Resources/pokechan-engine.js --target=browser --format=iife --minify
