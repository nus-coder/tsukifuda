// cards.js — カード定義・月齢定義・インラインSVGイラスト
'use strict';

// 各イラストは viewBox 0 0 120 120。カード枠側で夜空背景を敷くので背景は透過。
const CARD_ART = {
  0: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
    <circle cx="92" cy="24" r="14" fill="#f5e6a8" opacity=".9"/>
    <path d="M20 96 Q22 70 42 62 L36 50 Q34 42 42 40 Q50 38 52 46 L56 56 Q74 54 84 68 Q92 80 88 96 Z" fill="#8d93a8"/>
    <circle cx="44" cy="34" r="13" fill="#8d93a8"/>
    <circle cx="34" cy="24" r="7" fill="#8d93a8"/><circle cx="54" cy="24" r="7" fill="#8d93a8"/>
    <circle cx="34" cy="24" r="3.5" fill="#f2c4cf"/><circle cx="54" cy="24" r="3.5" fill="#f2c4cf"/>
    <circle cx="40" cy="33" r="2" fill="#1c1e2a"/><circle cx="49" cy="33" r="2" fill="#1c1e2a"/>
    <circle cx="44.5" cy="38" r="1.6" fill="#e08a9b"/>
    <path d="M44 39 Q38 44 32 41 M44 39 Q50 44 56 41" stroke="#5a5f73" stroke-width="1" fill="none"/>
    <path d="M88 92 Q108 88 106 70 Q105 60 96 60" stroke="#8d93a8" stroke-width="5" fill="none" stroke-linecap="round"/>
    <rect x="52" y="60" width="26" height="18" rx="3" fill="#c9a24b" transform="rotate(12 65 69)"/>
    <rect x="52" y="60" width="26" height="18" rx="3" fill="none" stroke="#8a6b26" stroke-width="1.5" transform="rotate(12 65 69)"/>
    <text x="65" y="73" transform="rotate(12 65 69)" font-size="10" text-anchor="middle" fill="#5c4614">千両</text>
    <path d="M30 52 L20 44 M30 52 L18 54" stroke="#8d93a8" stroke-width="4" stroke-linecap="round"/>
  </svg>`,
  1: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
    <path d="M60 14 L60 8" stroke="#6b4a2b" stroke-width="3"/>
    <ellipse cx="60" cy="18" rx="16" ry="6" fill="#b34a3c"/>
    <path d="M44 18 Q36 52 44 88 Q60 100 76 88 Q84 52 76 18 Z" fill="#e8d8b0"/>
    <path d="M48 24 Q42 52 48 84 M60 20 Q56 52 60 92 M72 24 Q78 52 72 84" stroke="#c9b284" stroke-width="1.5" fill="none"/>
    <ellipse cx="60" cy="92" rx="14" ry="5" fill="#b34a3c"/>
    <path d="M50 46 Q54 40 58 46" stroke="#2a2536" stroke-width="3" fill="none" stroke-linecap="round"/>
    <circle cx="70" cy="44" r="4" fill="#2a2536"/><circle cx="71.5" cy="42.5" r="1.3" fill="#fff"/>
    <path d="M48 62 Q60 76 74 60 Q66 68 58 64 Z" fill="#8c2f24"/>
    <path d="M52 64 Q60 72 70 62" stroke="#2a2536" stroke-width="2" fill="none"/>
    <path d="M60 70 Q58 82 62 86" stroke="#e06a6a" stroke-width="4" fill="none" stroke-linecap="round"/>
    <circle cx="60" cy="52" r="26" fill="#ffdf8a" opacity=".18"/>
  </svg>`,
  2: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
    <circle cx="26" cy="22" r="10" fill="#f5e6a8" opacity=".8"/>
    <path d="M60 96 Q30 96 32 66 Q34 44 52 40 L46 26 L58 34 Q60 32 64 34 L76 26 L70 40 Q88 46 88 66 Q90 96 60 96 Z" fill="#3d3a4f"/>
    <path d="M46 26 L52 36 L44 34 Z M76 26 L70 36 L78 34 Z" fill="#c98ba4"/>
    <ellipse cx="50" cy="56" rx="5" ry="7" fill="#ffd34d"/><ellipse cx="72" cy="56" rx="5" ry="7" fill="#ffd34d"/>
    <ellipse cx="50" cy="57" rx="1.8" ry="5" fill="#1c1e2a"/><ellipse cx="72" cy="57" rx="1.8" ry="5" fill="#1c1e2a"/>
    <path d="M58 66 L61 69 L64 66 M61 69 L61 73 M55 74 Q61 79 67 74" stroke="#e8e4f0" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <path d="M40 64 L24 60 M40 70 L25 72 M82 64 L98 60 M82 70 L97 72" stroke="#8f8aa8" stroke-width="1.5"/>
    <path d="M52 94 Q46 108 58 110 M68 94 Q76 108 64 110" stroke="#3d3a4f" stroke-width="7" fill="none" stroke-linecap="round"/>
    <circle cx="58" cy="110" r="4" fill="#e0b34d"/><circle cx="64" cy="110" r="4" fill="#e0b34d"/>
  </svg>`,
  3: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="60" cy="104" rx="34" ry="8" fill="#2e5d6b" opacity=".5"/>
    <path d="M60 34 Q34 34 32 62 Q30 92 60 94 Q90 92 88 62 Q86 34 60 34 Z" fill="#4f8f5f"/>
    <ellipse cx="60" cy="30" rx="17" ry="6" fill="#356b8c"/>
    <ellipse cx="60" cy="29" rx="11" ry="3.5" fill="#9fd8f0"/>
    <circle cx="50" cy="48" r="5" fill="#fff"/><circle cx="72" cy="48" r="5" fill="#fff"/>
    <circle cx="51" cy="49" r="2.4" fill="#1c1e2a"/><circle cx="71" cy="49" r="2.4" fill="#1c1e2a"/>
    <path d="M52 60 Q60 56 70 60 L66 68 Q60 71 56 68 Z" fill="#e8c93e"/>
    <path d="M52 60 Q60 66 70 60" stroke="#b39a1e" stroke-width="1.5" fill="none"/>
    <ellipse cx="60" cy="76" rx="13" ry="9" fill="#d9e8b8"/>
    <path d="M50 72 Q60 70 70 72 M50 78 Q60 76 70 78" stroke="#a8bd7f" stroke-width="1.2" fill="none"/>
    <path d="M36 58 Q22 62 24 74 M84 58 Q98 62 96 74" stroke="#4f8f5f" stroke-width="6" fill="none" stroke-linecap="round"/>
    <path d="M20 76 L26 72 L28 78 Z M100 76 L94 72 L92 78 Z" fill="#4f8f5f"/>
  </svg>`,
  4: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
    <path d="M60 100 L34 64 Q30 40 60 96 Q90 40 86 64 Z" fill="#7b5a3c" opacity="0"/>
    <path d="M28 78 Q10 60 22 40 L44 56 Z" fill="#f0f0f4"/>
    <path d="M92 78 Q110 60 98 40 L76 56 Z" fill="#f0f0f4"/>
    <path d="M24 44 L40 56 M22 52 L38 60" stroke="#c9c9d6" stroke-width="1.5"/>
    <path d="M96 44 L80 56 M98 52 L82 60" stroke="#c9c9d6" stroke-width="1.5"/>
    <path d="M60 98 Q40 98 40 72 Q40 50 60 50 Q80 50 80 72 Q80 98 60 98 Z" fill="#8c3a3a"/>
    <circle cx="60" cy="42" r="20" fill="#c96a4f"/>
    <path d="M48 30 Q60 20 72 30 L70 38 L50 38 Z" fill="#2a2536"/>
    <circle cx="60" cy="24" r="5" fill="#e8c93e"/>
    <path d="M52 42 L57 45 M68 42 L63 45" stroke="#1c1e2a" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M56 48 L56 62 Q56 66 60 66 Q64 66 64 62 L64 48 Z" fill="#e0937a"/>
    <path d="M50 56 Q46 60 50 64 M70 56 Q74 60 70 64" stroke="#c96a4f" stroke-width="3" fill="none"/>
    <path d="M60 74 L60 92 M52 80 L68 80" stroke="#5c2626" stroke-width="2"/>
    <rect x="70" y="66" width="26" height="8" rx="4" transform="rotate(-30 83 70)" fill="#d9cfa8"/>
  </svg>`,
  5: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
    <circle cx="60" cy="30" r="22" fill="#5ec9d8" opacity=".25"/>
    <path d="M60 20 Q44 24 42 40 L36 30 Q30 44 40 54 Q34 56 30 52 Q32 68 48 68 L46 92 Q60 100 74 92 L72 68 Q88 68 90 52 Q86 56 80 54 Q90 44 84 30 L78 40 Q76 24 60 20 Z" fill="#e8a13c"/>
    <path d="M42 40 L36 30 L44 46 Z M84 30 L78 40 L76 46 Z" fill="#fff" opacity=".7"/>
    <path d="M46 92 Q60 98 74 92 L72 74 Q60 80 48 74 Z" fill="#f5f0e0"/>
    <ellipse cx="50" cy="50" rx="4.5" ry="3" fill="#1c1e2a" transform="rotate(14 50 50)"/>
    <ellipse cx="70" cy="50" rx="4.5" ry="3" fill="#1c1e2a" transform="rotate(-14 70 50)"/>
    <path d="M56 60 L60 63 L64 60" stroke="#1c1e2a" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M44 44 Q50 40 55 44 M65 44 Q70 40 76 44" stroke="#b3701c" stroke-width="1.5" fill="none"/>
    <path d="M74 90 Q100 86 102 62 Q104 46 92 40 Q100 52 92 60 Q86 66 88 78 Q88 88 74 90 Z" fill="#e8a13c"/>
    <path d="M92 40 Q98 52 90 60" stroke="#fff" stroke-width="2" fill="none" opacity=".6"/>
    <circle cx="34" cy="80" r="3" fill="#5ec9d8"/><circle cx="26" cy="68" r="2" fill="#5ec9d8"/><circle cx="96" cy="28" r="2.5" fill="#5ec9d8"/>
  </svg>`,
  6: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
    <path d="M60 100 Q38 100 40 74 Q42 56 60 56 Q78 56 80 74 Q82 100 60 100 Z" fill="#3f4a6b" opacity=".85"/>
    <path d="M42 78 L26 90 M78 78 L94 90" stroke="#3f4a6b" stroke-width="8" stroke-linecap="round" opacity=".85"/>
    <circle cx="60" cy="40" r="17" fill="#cfd6e8" opacity=".9"/>
    <path d="M43 36 Q42 18 60 16 Q78 18 77 36 L72 30 L66 34 L60 28 L54 34 L48 30 Z" fill="#2a2f45"/>
    <path d="M40 24 L34 14 M80 24 L86 14" stroke="#2a2f45" stroke-width="3" stroke-linecap="round"/>
    <path d="M51 40 L57 42 M69 40 L63 42" stroke="#1c1e2a" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M54 50 L66 50" stroke="#8a90a8" stroke-width="2"/>
    <path d="M94 92 L74 46" stroke="#b8c4d9" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M74 46 L70 38" stroke="#8a6b26" stroke-width="5" stroke-linecap="round"/>
    <circle cx="73" cy="44" r="3" fill="#c9a24b"/>
    <path d="M60 100 L60 108 M50 104 L70 104" stroke="#cfd6e8" stroke-width="2" opacity=".5"/>
    <circle cx="30" cy="34" r="2" fill="#9fe8ff" opacity=".8"/><circle cx="92" cy="60" r="2.5" fill="#9fe8ff" opacity=".6"/>
  </svg>`,
  7: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
    <path d="M60 58 Q34 60 32 100 L88 100 Q86 60 60 58 Z" fill="#d94f4f"/>
    <path d="M46 58 Q44 80 46 100 M74 58 Q76 80 74 100" stroke="#a83030" stroke-width="1.5" fill="none"/>
    <path d="M46 56 Q60 66 74 56 L74 72 Q60 80 46 72 Z" fill="#f5f0ea"/>
    <circle cx="60" cy="38" r="16" fill="#f0d9c4"/>
    <path d="M44 34 Q44 18 60 18 Q76 18 76 34 Q70 26 60 26 Q50 26 44 34 Z" fill="#2a2536"/>
    <path d="M44 34 Q42 48 46 54 M76 34 Q78 48 74 54" stroke="#2a2536" stroke-width="5" stroke-linecap="round"/>
    <path d="M52 38 Q55 36 57 38 M63 38 Q65 36 68 38" stroke="#1c1e2a" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <path d="M57 46 Q60 48 63 46" stroke="#c46a6a" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    <rect x="57" y="20" width="6" height="4" fill="#e8c93e"/>
    <path d="M84 66 L96 46 M96 46 L92 44 M96 46 L100 48" stroke="#f0d9c4" stroke-width="3" stroke-linecap="round"/>
    <path d="M96 40 L104 32 M99 46 L109 44 M94 36 L98 26" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".85"/>
    <path d="M36 68 Q28 74 30 84" stroke="#d94f4f" stroke-width="7" fill="none" stroke-linecap="round"/>
  </svg>`,
  8: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
    <circle cx="88" cy="22" r="15" fill="#ffe9a8"/>
    <circle cx="83" cy="19" r="3" fill="#e8cf8a"/><circle cx="92" cy="27" r="2.2" fill="#e8cf8a"/>
    <path d="M34 100 Q30 72 44 60 Q36 58 34 48 L46 52 Q44 38 56 32 L58 44 Q64 34 76 38 L70 48 Q84 48 86 62 Q94 76 88 100 Z" fill="#6b7287"/>
    <path d="M56 32 L58 44 M76 38 L70 48" stroke="#535a70" stroke-width="1.5"/>
    <path d="M46 52 Q54 46 62 50 Q72 44 78 52 Q84 58 80 66 Q70 74 58 70 Q48 72 44 62 Q42 56 46 52 Z" fill="#8d94ab"/>
    <ellipse cx="56" cy="57" rx="3.5" ry="4" fill="#ffd34d"/><ellipse cx="70" cy="57" rx="3.5" ry="4" fill="#ffd34d"/>
    <circle cx="56" cy="58" r="1.6" fill="#1c1e2a"/><circle cx="70" cy="58" r="1.6" fill="#1c1e2a"/>
    <path d="M56 66 Q63 72 72 66 L69 70 L65 67 L61 71 L57 68 Z" fill="#f0f0f4"/>
    <path d="M52 78 Q62 84 74 78" stroke="#535a70" stroke-width="2" fill="none"/>
    <path d="M40 84 L28 90 M82 84 L94 92" stroke="#6b7287" stroke-width="7" stroke-linecap="round"/>
    <path d="M28 90 L22 86 M28 90 L21 92 M28 90 L24 96" stroke="#8d94ab" stroke-width="2.5" stroke-linecap="round"/>
  </svg>`,
  9: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
    <path d="M18 96 Q6 84 20 76 Q34 70 44 78 Q56 86 68 78 Q80 70 74 58 Q68 48 56 52 Q44 56 46 66" stroke="#4f7d54" stroke-width="11" fill="none" stroke-linecap="round"/>
    <path d="M18 96 Q6 84 20 76 Q34 70 44 78 Q56 86 68 78 Q80 70 74 58" stroke="#78a87c" stroke-width="4" fill="none" stroke-linecap="round" stroke-dasharray="1 7"/>
    <path d="M50 60 Q40 34 62 26 Q84 20 90 40 Q92 50 84 56 L72 50 Q64 46 60 54 Z" fill="#4f7d54"/>
    <path d="M62 26 Q56 16 62 10 Q64 20 70 22 Z" fill="#4f7d54"/>
    <ellipse cx="74" cy="38" rx="4" ry="5" fill="#ffd34d"/>
    <ellipse cx="74" cy="39" rx="1.6" ry="4" fill="#1c1e2a"/>
    <path d="M86 46 Q98 48 102 44 Q98 54 88 52" fill="#c94f4f"/>
    <path d="M102 44 L108 40 M102 44 L108 46" stroke="#c94f4f" stroke-width="2" stroke-linecap="round"/>
    <path d="M58 30 Q66 24 76 26 M56 40 Q66 34 80 36" stroke="#38593c" stroke-width="1.5" fill="none"/>
    <circle cx="26" cy="30" r="2" fill="#9fe8ff" opacity=".6"/><circle cx="36" cy="20" r="1.5" fill="#9fe8ff" opacity=".6"/>
  </svg>`,
  10: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
    <path d="M14 90 Q30 82 38 66 Q46 50 62 44 Q80 38 90 46" stroke="#4a6d9c" stroke-width="13" fill="none" stroke-linecap="round"/>
    <path d="M20 88 L14 78 M32 76 L24 68 M44 60 L36 52 M58 48 L52 38 M74 42 L70 32" stroke="#7da3cc" stroke-width="4" stroke-linecap="round"/>
    <path d="M84 40 Q76 28 88 22 Q86 32 94 34 Z" fill="#4a6d9c"/>
    <path d="M86 46 Q80 34 92 30 Q104 28 108 40 Q110 50 100 54 L90 50 Q84 50 86 46 Z" fill="#4a6d9c"/>
    <path d="M92 30 L88 18 L96 26 M100 30 L102 18 L106 28" fill="#e0e6f0"/>
    <ellipse cx="98" cy="40" rx="3.5" ry="4.5" fill="#ffd34d"/>
    <ellipse cx="98" cy="41" rx="1.4" ry="3.5" fill="#1c1e2a"/>
    <path d="M104 48 Q114 50 118 46" stroke="#c94f4f" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <path d="M100 54 L96 60 M104 52 L104 60" stroke="#e8c93e" stroke-width="2" stroke-linecap="round"/>
    <circle cx="60" cy="70" r="9" fill="#ffe9a8" opacity=".9"/>
    <circle cx="60" cy="70" r="13" fill="none" stroke="#ffe9a8" stroke-width="1.5" opacity=".5"/>
    <path d="M30 100 Q44 94 52 82" stroke="#4a6d9c" stroke-width="8" fill="none" stroke-linecap="round" opacity=".5"/>
  </svg>`,
  11: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
    <circle cx="60" cy="34" r="26" fill="#fff3c4"/>
    <circle cx="60" cy="34" r="32" fill="none" stroke="#fff3c4" stroke-width="2" opacity=".4"/>
    <circle cx="60" cy="34" r="40" fill="none" stroke="#fff3c4" stroke-width="1" opacity=".2"/>
    <path d="M60 62 Q36 66 34 104 L86 104 Q84 66 60 62 Z" fill="#2f2a4a"/>
    <path d="M60 62 Q48 66 44 76 L60 104 L76 76 Q72 66 60 62 Z" fill="#4a4370"/>
    <path d="M46 74 L60 104 L74 74" stroke="#8f86c4" stroke-width="1.5" fill="none"/>
    <circle cx="60" cy="40" r="15" fill="#f0e6d4"/>
    <path d="M46 36 Q46 22 60 22 Q74 22 74 36 Q68 28 60 28 Q52 28 46 36 Z" fill="#3d3654"/>
    <path d="M52 40 L58 40 M62 40 L68 40" stroke="#1c1e2a" stroke-width="2" stroke-linecap="round"/>
    <path d="M57 48 L63 48" stroke="#b39a8a" stroke-width="1.5" stroke-linecap="round"/>
    <path d="M56 22 L54 12 L60 18 L66 10 L64 22" fill="#e8c93e"/>
    <circle cx="60" cy="80" r="6" fill="#ffe9a8"/>
    <path d="M60 74 L60 66 M54 78 L46 74 M66 78 L74 74" stroke="#ffe9a8" stroke-width="1.5" opacity=".7"/>
    <circle cx="24" cy="70" r="2" fill="#fff" opacity=".8"/><circle cx="98" cy="80" r="2.5" fill="#fff" opacity=".7"/><circle cx="90" cy="98" r="1.5" fill="#fff" opacity=".6"/>
  </svg>`,
};

// カード定義。id = パワー
const CARDS = [
  { id: 0,  name: 'ねずみ小僧', kana: 'ねずみこぞう', short: 'パワー10以上に勝つ。', text: '相手のパワーが10以上なら勝つ。', flavor: '大物ほど、盗みがいがある。' },
  { id: 1,  name: '提灯おばけ', kana: 'ちょうちんおばけ', short: '負けたら点はポットへ。', text: '負けたとき、月光点は相手に渡らず持ち越しになる。', flavor: 'ふっ、と灯りが消えた。' },
  { id: 2,  name: '猫又', kana: 'ねこまた', short: '相手の能力を無効化。', text: '相手カードの能力を無効化する。', flavor: '化かし合いはお断りだにゃ。' },
  { id: 3,  name: '河童', kana: 'かっぱ', short: '負けても1点得る。', text: '負けたとき、自分は1点得る。', flavor: '転んでも皿の水はこぼさない。' },
  { id: 4,  name: '天狗', kana: 'てんぐ', short: '勝ったら追加+1点。', text: '勝ったとき、追加で1点得る。', flavor: '勝って驕るは天狗の華よ。' },
  { id: 5,  name: '妖狐', kana: 'ようこ', short: '強制的に引き分けにする。', text: 'このラウンドは強制的に引き分けになる（月光点は持ち越し）。', flavor: '勝負はお預け。月は逃げぬ。' },
  { id: 6,  name: '侍の霊', kana: 'さむらいのれい', short: '勝ったら次戦パワー+2。', text: '勝ったとき、次のラウンドの自分のカードのパワー+2。', flavor: '一太刀目は、二太刀目のために。' },
  { id: 7,  name: '巫女', kana: 'みこ', short: '同点なら勝つ。', text: 'パワーが同点なら勝つ。', flavor: '神慮は常にわたしの側に。' },
  { id: 8,  name: '人狼', kana: 'じんろう', short: '満月ならパワー+5。', text: '満月のラウンドならパワー+5。', flavor: '月が満ちる。血が騒ぐ。' },
  { id: 9,  name: '大蛇', kana: 'おろち', short: '勝ったら相手から1点奪う。', text: '勝ったとき、相手の得点を1点奪う。', flavor: '呑まれたものは、還らない。' },
  { id: 10, name: '竜神', kana: 'りゅうじん', short: '能力なし。純粋な力。', text: '能力なし。ただ純粋に強い。', flavor: '小細工は雲の下に置いてきた。' },
  { id: 11, name: '月読', kana: 'つくよみ', short: '能力なし。最強。', text: '能力なし。最高のパワー。', flavor: '夜のすべては我が管轄である。' },
];

// 月齢の表示情報
const MOONS = {
  crescent: { name: '三日月', desc: '効果なし', icon: 'M60 20 A40 40 0 1 0 60 100 A32 40 0 1 1 60 20' },
  half:     { name: '半月',   desc: '効果なし', icon: 'M60 20 A40 40 0 0 0 60 100 Z' },
  full:     { name: '満月',   desc: '人狼のパワー+5', icon: 'FULL' },
  new:      { name: '新月',   desc: 'パワーの低い方が勝つ', icon: 'NEW' },
  eclipse:  { name: '月蝕',   desc: '全カードの能力無効', icon: 'ECLIPSE' },
};

if (typeof module !== 'undefined') module.exports = { CARDS, CARD_ART, MOONS };
