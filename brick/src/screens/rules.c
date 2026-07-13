// rules.c — 遊び方（ページ式）。文言は ../js/ui.js の rulesPages() から移植（変更禁止）。
#include <stdio.h>

#include "../app.h"
#include "../render.h"
#include "../input.h"
#include "../audio.h"

#define PAGE_N 4
static int g_page;

void rules_enter(App *a)
{
    (void)a;
    g_page = 0;
}

static int para(int x, int y, int w, const char *text)
{
    return y + draw_wrapped(x, y, w, 19, C_TEXT, 30, text) + 14;
}

static void mini_card(int x, int y, int id)
{
    draw_card(x, y, 96, 136, id, 0);
}

static void page1(int x, int y, int w)
{
    draw_text(x, y, 26, C_GOLD, ALIGN_LEFT, "1. 同じ手札で、同時に出す");
    y += 44;
    y = para(x, y, w,
        "あなたと相手はまったく同じ12枚の妖怪カード（パワー0〜11）を持って、12ラウンド戦います。"
        "毎ラウンド同時に1枚出して、基本はパワーの高い方が勝ち。"
        "勝った方がそのラウンドの月光点をもらい、合計点で勝敗が決まります。");
    // 図: カード4 VS カード9
    int cx = x + w / 2;
    mini_card(cx - 150, y, 4);
    draw_text(cx, y + 58, 26, C_RED, ALIGN_CENTER, "VS");
    mini_card(cx + 54, y, 9);
    y += 152;
    para(x, y, w,
        "使ったカードは戻りません。お互い同じデッキだから、相手の残り手札は常に丸見え。"
        "「相手にはまだ月読(11)が残ってる…どこで切ってくる？」——この読み合いがすべてです。");
}

static void page2(int x, int y, int w)
{
    draw_text(x, y, 26, C_GOLD, ALIGN_LEFT, "2. 月齢カード＝そのラウンドの点数");
    y += 44;
    y = para(x, y, w,
        "12ラウンド分の月齢は最初から全部公開されています。"
        "高得点のラウンドがいつ来るかわかるので、強いカードの温存と投入が戦略になります。");
    // 月齢一覧
    struct { Moon m; int v; } items[5] = {
        { MOON_CRESCENT, 1 }, { MOON_HALF, 2 }, { MOON_FULL, 3 },
        { MOON_NEW, 3 }, { MOON_ECLIPSE, 4 },
    };
    for (int i = 0; i < 5; i++) {
        int ix = x + i * (w / 5);
        const MoonDef *md = jsb_moon(items[i].m);
        draw_moon_icon(ix + w / 10, y + 30, 26, items[i].m);
        char label[64];
        snprintf(label, sizeof label, "%s（%d点）", md->name, items[i].v);
        draw_text(ix + w / 10, y + 68, 17, C_GOLD, ALIGN_CENTER, label);
        // 説明は折り返し
        char lines[3][256];
        int n = wrap_text(md->desc, 14, w / 5 - 12, lines, 3);
        for (int k = 0; k < n; k++)
            draw_text(ix + w / 10, y + 92 + k * 19, 14, C_DIM, ALIGN_CENTER, lines[k]);
    }
    y += 150;
    para(x, y, w,
        "新月はパワーの低い方が勝ち、月蝕は能力がすべて無効。"
        "強いカードほど危ないラウンドがある——ここで形勢がひっくり返ります。");
}

static void page3(int x, int y, int w)
{
    draw_text(x, y, 26, C_GOLD, ALIGN_LEFT, "3. 引き分けは「持ち越し」で膨らむ");
    y += 44;
    y = para(x, y, w,
        "引き分けたラウンドの月光点はポットに持ち越され、次のラウンドの賭け金に上乗せされます。"
        "妖狐（強制引き分け）や同カード対決（ミラー）が続くと、1ラウンドに8点以上かかる大勝負に！");
    int cx = x + w / 2;
    mini_card(cx - 150, y, 5);
    draw_text(cx, y + 58, 26, C_GOLD, ALIGN_CENTER, "＝");
    mini_card(cx + 54, y, 7);
    y += 152;
    draw_text(x, y, 24, C_GOLD, ALIGN_LEFT, "能力の処理順（細かいルール）");
    y += 40;
    const char *items[4] = {
        "月蝕 → 猫又 → パワー修正（人狼・侍の霊）→ 妖狐の強制引き分け → 勝敗判定 の順。",
        "ねずみ小僧は「修正後」パワー10以上の相手に勝つ（満月の人狼13にも勝てる）。",
        "妖狐の引き分けは巫女でも覆せない。同カード対決は必ず引き分け。",
        "最終ラウンドの持ち越しは消滅する。",
    };
    for (int i = 0; i < 4; i++) {
        draw_text(x, y, 18, C_GOLD, ALIGN_LEFT, "・");
        y += draw_wrapped(x + 26, y, w - 26, 18, C_TEXT, 27, items[i]) + 6;
    }
}

static void page4(int x, int y, int w)
{
    draw_text(x, y, 26, C_GOLD, ALIGN_LEFT, "4. カード一覧");
    y += 44;
    // ヘッダ
    int col1 = x + 8, col2 = x + 96, col3 = x + 260;
    draw_text(col1, y, 17, C_DIM, ALIGN_LEFT, "パワー");
    draw_text(col2, y, 17, C_DIM, ALIGN_LEFT, "名前");
    draw_text(col3, y, 17, C_DIM, ALIGN_LEFT, "能力");
    y += 28;
    fill_rect(x, y - 4, w, 1, C_BORDER, 180);
    for (int i = 0; i < 12; i++) {
        const CardInfo *c = jsb_card(i);
        char num[8];
        snprintf(num, sizeof num, "%d", c->id);
        if (i % 2 == 1) fill_rect(x, y - 2, w, 34, C_PANEL, 120);
        draw_text(col1 + 20, y, 18, C_GOLD, ALIGN_LEFT, num);
        draw_text(col2, y, 18, C_TEXT, ALIGN_LEFT, c->name);
        draw_text(col3, y, 17, C_TEXT, ALIGN_LEFT, c->text);
        y += 34;
    }
}

void rules_frame(App *a)
{
    if (input_pressed(BTN_LEFT) && g_page > 0) { g_page--; audio_play("click"); }
    if (input_pressed(BTN_RIGHT) && g_page < PAGE_N - 1) { g_page++; audio_play("click"); }
    if (input_pressed(BTN_B)) {
        audio_play("click");
        a->screen = a->rules_return;
        if (a->rules_return == SCR_TITLE) title_enter(a);
        // SCR_GAME へ戻る場合は game 側の状態を維持（enterし直さない）
        return;
    }
    bool want_shot = input_pressed(BTN_SELECT) && a->shot_dir[0];

    draw_night_sky();
    draw_text(SCREEN_W / 2, 28, 30, C_TEXT, ALIGN_CENTER, "遊び方");

    int px = 90, py = 100, pw = SCREEN_W - 180;
    panel(px - 24, py - 20, pw + 48, 580, 235);
    switch (g_page) {
    case 0: page1(px, py, pw); break;
    case 1: page2(px, py, pw); break;
    case 2: page3(px, py, pw); break;
    case 3: page4(px, py, pw); break;
    }

    // ページドット
    char dots[64] = "";
    for (int i = 0; i < PAGE_N; i++)
        strncat(dots, i == g_page ? "●" : "○", sizeof dots - strlen(dots) - 1);
    draw_text(SCREEN_W / 2, 692, 20, C_GOLD, ALIGN_CENTER, dots);

    const char *back = a->rules_return == SCR_GAME ? "対戦に戻る" : "タイトルへ戻る";
    char help[128];
    snprintf(help, sizeof help, "←→:ページ送り  B:%s", back);
    draw_text(SCREEN_W / 2, 726, 17, C_DIM, ALIGN_CENTER, help);

    if (want_shot) app_screenshot(a, "rules");
}
