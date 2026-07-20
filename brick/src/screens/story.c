// story.c — ストーリー選択（5ボス + ロック表示）
#include <stdio.h>
#include <string.h>

#include "../app.h"
#include "../render.h"
#include "../input.h"
#include "../audio.h"
#include "../save.h"

static int g_cursor;
static int g_auto_frames;
static int g_pending_boss;

static void confirm_boss_pick(App *a)
{
    dialogue_enter(a, g_pending_boss);
    a->screen = SCR_DIALOGUE;
}

void story_enter(App *a)
{
    (void)a;
    int prog = save_data()->story;
    g_cursor = prog < jsb_boss_count() ? prog : jsb_boss_count() - 1;
    g_auto_frames = 0;
}

static void render(App *a)
{
    (void)a;
    draw_night_sky();
    draw_text(SCREEN_W / 2, 24, 30, C_TEXT, ALIGN_CENTER, "ストーリー");

    int prog = save_data()->story;
    int n = jsb_boss_count();

    int y = 80;
    if (prog >= n) {
        // 全クリアバナー（webの絵文字は月アイコン描画で代替）
        panel(SCREEN_W / 2 - 330, y - 6, 660, 44, 235);
        draw_moon_icon(SCREEN_W / 2 - 290, y + 16, 14, MOON_FULL);
        draw_moon_icon(SCREEN_W / 2 + 290, y + 16, 14, MOON_FULL);
        draw_text(SCREEN_W / 2, y + 4, 20, C_GOLD, ALIGN_CENTER,
                  "全妖怪制覇！今宵より月夜はあなたのもの");
        y += 58;
    }

    for (int i = 0; i < n; i++) {
        const BossInfo *b = jsb_boss(i);
        bool locked = i > prog;
        bool cleared = i < prog;
        bool cur = i == g_cursor;
        int bx = SCREEN_W / 2 - 380, bw = 760, bh = 108;
        panel(bx, y, bw, bh, cur ? 245 : 180);
        if (cur) {
            draw_frame(bx - 2, y - 2, bw + 4, bh + 4, C_GOLD);
            draw_text(bx - 26, y + bh / 2 - 14, 24, C_GOLD, ALIGN_LEFT, "▶");
        }
        // ポートレート（カード絵流用）
        draw_card_art(bx + 12, y + 12, 84, 84, b->art);
        if (locked) fill_rect(bx + 12, y + 12, 84, 84, C_DARK, 200);

        int tx = bx + 116;
        draw_text(tx, y + 10, 17, C_DIM, ALIGN_LEFT, b->title);
        draw_text(tx, y + 34, 22, locked ? C_DIM : C_TEXT, ALIGN_LEFT,
                  locked ? "？？？" : b->name);
        draw_text(tx, y + 68, 16, locked ? C_DIM : C_GOLD, ALIGN_LEFT,
                  locked ? "前の相手を倒すと挑める。" : b->gimmick);
        // 状態マーク
        const char *mark = cleared ? "済" : (locked ? "封" : "挑");
        SDL_Color mc = cleared ? C_GREEN : (locked ? C_DIM : C_GOLD);
        fill_circle(bx + bw - 44, y + bh / 2, 24, C_DARK, 220);
        draw_text(bx + bw - 44, y + bh / 2 - 15, 26, mc, ALIGN_CENTER, mark);
        y += bh + 12;
    }

    draw_text(SCREEN_W / 2, 736, 17, C_DIM, ALIGN_CENTER,
              "十字キー:選択  A:挑む  B:タイトルへ");
}

void story_frame(App *a)
{
    int prog = save_data()->story;
    int n = jsb_boss_count();

    if (a->autoplay == 2) {
        g_auto_frames++;
        render(a);
        if (g_auto_frames == 2) app_screenshot(a, "story");
        if (g_auto_frames == 3) {
            g_cursor = 0;
            dialogue_enter(a, 0);
            a->screen = SCR_DIALOGUE;
        }
        return;
    }

    if (input_pressed(BTN_UP)) { g_cursor = (g_cursor + n - 1) % n; audio_play("select"); }
    if (input_pressed(BTN_DOWN)) { g_cursor = (g_cursor + 1) % n; audio_play("select"); }
    if (input_pressed(BTN_A) && g_cursor <= prog) {
        audio_play("click");
        g_pending_boss = g_cursor;
        timelimit_enter(a, confirm_boss_pick, SCR_STORY);
        a->screen = SCR_TIMELIMIT;
        return;
    }
    if (input_pressed(BTN_B)) {
        audio_play("click");
        title_enter(a);
        a->screen = SCR_TITLE;
        return;
    }
    bool want_shot = input_pressed(BTN_SELECT) && a->shot_dir[0];

    render(a);
    if (want_shot) app_screenshot(a, "story");
}
