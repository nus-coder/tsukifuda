#!/usr/bin/env node
// tools/render_cards.mjs — cards.js の CARD_ART(SVG 12枚, viewBox 0 0 120 120) を
// 240x240 透過PNG にレンダリングして out/res/cards/00.png〜11.png を生成する。
'use strict';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Resvg } = require('@resvg/resvg-js');

const here = dirname(fileURLToPath(import.meta.url));
const brick = resolve(here, '..');
const root = resolve(brick, '..');
const { CARD_ART } = require(join(root, 'js', 'cards.js'));

// 千両箱の <text>千両</text>（カード0）を描画するための日本語フォント
const FONT = process.env.TSUKIFUDA_FONT ||
  '/Users/yota/trimui-popui/NextUI/skeleton/SYSTEM/res/font1.ttf';
if (!existsSync(FONT)) {
  console.error(`render_cards: font not found: ${FONT}`);
  process.exit(1);
}

const outDir = join(brick, 'out', 'res', 'cards');
mkdirSync(outDir, { recursive: true });

// PNG ヘッダ検証: シグネチャ + IHDR の寸法と colorType(6 = RGBA = 透過対応)
function verifyPng(buf, path) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!buf.subarray(0, 8).equals(sig)) throw new Error(`${path}: PNG シグネチャ不正`);
  if (buf.toString('latin1', 12, 16) !== 'IHDR') throw new Error(`${path}: IHDR がない`);
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  const colorType = buf.readUInt8(25);
  if (w !== 240 || h !== 240) throw new Error(`${path}: サイズ ${w}x${h} (期待 240x240)`);
  if (colorType !== 6) throw new Error(`${path}: colorType ${colorType} (期待 6 = RGBA)`);
  return { w, h, colorType };
}

let count = 0;
for (let id = 0; id < 12; id++) {
  const svg = CARD_ART[id];
  if (!svg) throw new Error(`CARD_ART[${id}] が見つからない`);
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: 240 },
    background: 'rgba(0,0,0,0)', // 透過（カード枠側で夜空背景を敷く）
    font: {
      fontFiles: [FONT],
      loadSystemFonts: false,
      defaultFontFamily: 'Rounded M+ 1c',
    },
  });
  const png = resvg.render().asPng();
  const path = join(outDir, String(id).padStart(2, '0') + '.png');
  writeFileSync(path, png);
  verifyPng(Buffer.from(png), path);
  count++;
  console.log(`render_cards: ${path} (${png.length} bytes, 240x240 RGBA)`);
}
console.log(`render_cards: ${count}/12 ok`);
