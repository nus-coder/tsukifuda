# ツキフダ TRIMUI Brick 移植 設計書

対象: TRIMUI Brick / PopUI JP (NextUIフォーク, tg5040) 上の Pak アプリ。
方式: **ハイブリッド** — ゲームロジック(engine/ai/cards/story定義)は QuickJS 上で既存JSを無改変実行。描画・入力・音・画面遷移は C + SDL2 で新規実装。

## 絶対条件

- **ゲームルールを変えない**。`../js/engine.js` `../js/ai.js` `../js/cards.js` `../js/story.js` は1行も変更せずバンドルする（シム＝前置コードで環境差を吸収）。
- 画面 1024x768 固定（`SDL_RenderSetLogicalSize(1024, 768)`）。実機はフルスクリーン、macはウィンドウ。
- 日本語表示は同梱TTF（Rounded M+ 1c Bold）+ SDL2_ttf。
- 外部動的依存は SDL2 / SDL2_image / SDL2_ttf のみ（QuickJSは静的リンク）。SDL2_mixerは使わない（自前ミキサー）。
- オンライン対戦・PWA・絵文字リアクションは移植対象外。

## ディレクトリ構成

```
brick/
  DESIGN.md
  Makefile              # native(mac) / tg5040(podman内) / assets / pak / zip
  src/                  # C ソース
    main.c              # SDL初期化・メインループ・画面ディスパッチ
    jsbridge.c/.h       # QuickJS 埋め込み・ゲームAPI
    render.c/.h         # 描画ヘルパ(テキストキャッシュ、カード枠、月アイコン)
    input.c/.h          # 入力抽象化(実機ジョイスティック/macキーボード)
    audio.c/.h          # WAVロード + 自前加算ミキサー(SDL_AudioCallback)
    save.c/.h           # 進行/戦績/設定の JSON 保存
    screens/            # title.c rules.c story.c dialogue.c game.c (必要なら分割)
  jsshim/
    prelude.js          # structuredClone / localStorage / console シム
    api.js              # BRIDGE グローバル(下記)
  tools/                # mac側ビルド時ツール(Node)
    bundle_js.mjs       # ../js/*.js + シム → out/res/game.js 生成
    render_cards.mjs    # cards.js の CARD_ART を抽出し rsvg-convert で PNG 化
    render_sfx.mjs      # sound.js の FX 定義をオフライン合成 → WAV
    render_bgm.mjs      # sound.js の BGM(8小節進行×6声) をオフライン合成 → ループWAV
  vendor/quickjs/       # QuickJS ソース一式(バージョン固定でコミット)
  pak/
    launch.sh
    LICENSES/           # OFL.txt(フォント), QuickJS MIT, 本体ライセンス表記
  out/                  # 生成物(gitignore): obj, tsukifuda.elf(実機)/tsukifuda(mac), res/, Tsukifuda.pak/, Tsukifuda.pak.zip
```

生成アセット(`out/res/`): `cards/00.png..11.png`(240x240透過), `sfx/*.wav`, `bgm/loop.wav`, `font/font.ttf`, `game.js`。

## JS ブリッジ

QuickJS は quickjs-ng または bellard/quickjs の最新安定タグを `vendor/` に取り込み静的リンク（mac は clang、実機は aarch64-nextui-linux-gnu-gcc でビルドできること）。

バンドル順: `prelude.js` → `cards.js` → `engine.js` → `ai.js` → `story.js` → `api.js`。

prelude.js のシム:
- `structuredClone(x)` → `JSON.parse(JSON.stringify(x))`（engineの状態はプレーンJSONなので等価）
- `localStorage` → メモリ上のダミー（story.js の progress は使わず C 側 save.c が管理）
- `module` は未定義のままで良い（各ファイル末尾の `typeof module !== 'undefined'` ガードで安全）

api.js が公開する `BRIDGE` グローバル（状態はJS側に保持、Cは値を読むだけ）:
```js
BRIDGE = {
  newGame(bossIndex /* -1=通常CPU戦 */, startPot, poolJson /* nullなら標準 */),
  aiPick(level),               // → カードid (AIは常にplayer 1)
  resolve(p0, p1),             // → result オブジェクト(engineのresolveRound結果のresult)
  state(),                     // → 現在の state オブジェクト
  cards(), moons(), bosses(),  // → 定義(名前/テキスト/フレーバー/ボス会話等)
  gameWinner(),                // → 0|1|-1|null
}
```
C側は `JS_GetPropertyStr` / `JS_GetPropertyUint32` の薄いヘルパで直接オブジェクトを読む（CでのJSONパーサ不要）。ボスの `pool` は bosses() から取得して newGame に渡す。

## 画面と入力

物理ボタン → 論理ボタン対応。実機は SDL ジョイスティック/キーイベント（ボタンコードは `/Users/yota/trimui-popui/NextUI/workspace/all/common/defines.h` の tg5040 定義を参照）。macキーボード: 矢印=十字キー, `x`=A, `z`=B, `s`=X, `a`=Y, Enter=START, Space=SELECT。

1. **タイトル**: 縦メニュー(上下+A): CPU見習い / CPU大妖怪 / ストーリー / 遊び方。下部に戦績(勝敗数)を小さく表示。
2. **遊び方**: ページ式(左右でページ送り、Bで戻る)。内容は `../js/ui.js` のルールページ文言を移植（文言は変えない）。
3. **ストーリー選択**: 5ボスのリスト(上下+A)。未到達ボスはロック表示。進行は save.c。
4. **会話**: ボス絵(カードPNG流用)+名前+テキスト。A=次へ、START=スキップ。勝利/敗北後の台詞も表示。
5. **ゲーム画面** (Webのレイアウトを踏襲し1024x768に再構成):
   - 上段: 相手名+得点、相手の残り手札(全公開・小カード)
   - 中段: 月齢トラック12枚(現在ラウンド強調)、場(相手スロット/賭点・ポット表示/自分スロット)、直近ログ数行
   - 下段: 自分の名前+得点+バフ表示、手札(左右カーソル+A=選択→確認、B=取消)、Y=カーソル位置カードの詳細(名前/効果/フレーバー)
   - 十字キー上=月齢トラックへフォーカス移動(左右で各ラウンドの月齢詳細確認)、下=手札へ戻る
   - START=中断メニュー(対戦に戻る/ルール/効果音ON-OFF/BGM ON-OFF/投了)
6. **ラウンド公開演出**: 賭点5以上でカットイン(tension音と同期)→両者同時公開→勝敗・能力イベントをログ+効果音(ui.jsのイベント→sfx対応を踏襲: lantern/tengu/kappa/orochi/samurai/fox_draw/eclipse/howl等)。演出は簡略化して良いがログ文言と音の対応は維持。
7. **結果**: 勝敗表示+ストーリー時はボス台詞。A=もう一回/再挑戦、B=タイトル(ストーリー時はストーリー選択)へ。

AI思考は同期実行で速いが、300〜600msの演出ディレイを入れる。

## 音

- render_sfx.mjs: sound.js の `tone()`/`noise()` を 22050Hz mono float で数値合成し 16bit WAV へ。FX全種(click select flip win lose draw pot coin eclipse howl fox lantern steal start ほか)。`tension`/`tensionBig` はライザー部とヒット部を別WAVに分割し、C側でカットイン演出に同期スケジュール。
- render_bgm.mjs: BGM(8小節進行、弦/チェロ/ピチカート/チェレスタ/フルート/ティンパニ)を1ループ分レンダリングしシームレスループWAV化。
- audio.c: SDL_OpenAudioDevice(22050Hz)、同時発音8ch程度の加算ミキサー+BGMループch。ミュート設定は保存。

## 保存 (save.c)

保存先: `getenv("USERDATA_PATH")` があれば `$USERDATA_PATH/Tsukifuda/save.json`、なければ実行ファイルと同じディレクトリの `userdata/save.json`。内容: `{ story: 0-5, stats: {novice:{w,l,d}, hard:{...}}, muted: bool, bgm: bool }`。書き込みは都度・アトミック(テンポラリ→rename)。

## ビルド

- `make assets` — tools/ 一式を実行して out/res/ を生成（mac側のみ。PNG/WAV/game.jsはコミットせず、pak生成時に含める）
- `make native` — mac: clang + homebrew SDL2。動作確認用。`TSUKIFUDA_AUTOPLAY=1` でSDLダミードライバ+自動プレイ1試合のスモークテストが走ること
- `make tg5040` — NextUIリポジトリのコンテナ (`cd /Users/yota/trimui-popui/NextUI && make PLATFORM=tg5040 shell` 相当を podman run で非対話実行) 内で aarch64 ビルド → tsukifuda.elf
- `make pak` — out/Tsukifuda.pak/ に launch.sh + tsukifuda.elf + res/ + LICENSES/ を集約
- `make zip` — out/Tsukifuda.pak.zip

launch.sh は Clock.pak と同形式:
```sh
#!/bin/sh
cd $(dirname "$0")
./tsukifuda.elf > ./log.txt 2>&1
```

## テスト

1. `node ../test/engine.test.js` が引き続き全パス（ソース無改変の確認）
2. バンドル後の game.js を QuickJS(qjs) で実行するテストハーネスで engine テスト相当を再実行（QuickJS環境での動作保証）
3. mac ネイティブビルドで AUTOPLAY スモーク + 手動プレイ確認
4. クロスビルド成果物の `file` チェック(aarch64) + 依存so確認(readelf -d が SDL2系のみ)

## ライセンス

- フォント: Rounded M+ 1c Bold (M+ FONTS派生, SIL OFL 1.1) — OFL.txt を LICENSES/ に同梱
- QuickJS: MIT — ライセンス文同梱
- カード絵・文言: 本リポジトリのもの
