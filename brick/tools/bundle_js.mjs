#!/usr/bin/env node
// tools/bundle_js.mjs — シム + 元JS(無改変) を連結して out/res/game.js を生成
'use strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));   // brick/tools
const brick = resolve(here, '..');                      // brick
const root = resolve(brick, '..');                      // リポジトリルート

// バンドル順は DESIGN.md のとおり
const parts = [
  join(brick, 'jsshim', 'prelude.js'),
  join(root, 'js', 'cards.js'),
  join(root, 'js', 'engine.js'),
  join(root, 'js', 'ai.js'),
  join(root, 'js', 'story.js'),
  join(brick, 'jsshim', 'api.js'),
];

let out = '// game.js — 自動生成 (brick/tools/bundle_js.mjs)。直接編集しないこと。\n';
for (const p of parts) {
  out += `\n// ===== ${relative(root, p)} =====\n`;
  out += readFileSync(p, 'utf8');
  if (!out.endsWith('\n')) out += '\n';
}

const dest = join(brick, 'out', 'res', 'game.js');
mkdirSync(dirname(dest), { recursive: true });
writeFileSync(dest, out);
console.log(`bundle_js: wrote ${dest} (${Buffer.byteLength(out)} bytes)`);
