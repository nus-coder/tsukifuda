#!/bin/sh
# tools/build_assets.sh — アセット一括生成（冪等）。mac側でのみ実行する。
# 生成物: brick/out/res/{game.js, cards/*.png, sfx/*.wav, bgm/loop.wav, font/font.ttf}
set -e
cd "$(dirname "$0")"

FONT="${TSUKIFUDA_FONT:-/Users/yota/trimui-popui/NextUI/skeleton/SYSTEM/res/font1.ttf}"

echo "== [1/6] npm 依存 =="
if [ ! -d node_modules ]; then
  npm install --no-audit --no-fund
fi

echo "== [2/6] JS バンドル =="
node bundle_js.mjs

echo "== [3/6] バンドル検証 =="
node test_bundle.mjs
node ../../test/engine.test.js

echo "== [4/6] カード PNG =="
node render_cards.mjs

echo "== [5/6] 効果音 / BGM =="
node render_sfx.mjs
node render_bgm.mjs

echo "== [6/6] フォント =="
mkdir -p ../out/res/font
cp "$FONT" ../out/res/font/font.ttf

echo "== 完了: out/res/ =="
find ../out/res -type f | sort
