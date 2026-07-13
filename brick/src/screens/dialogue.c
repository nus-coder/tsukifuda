// dialogue.c — ボス会話（intro）。A=次へ、START=スキップ。終わったらゲーム開始。
#include <stdio.h>
#include <string.h>

#include "../app.h"
#include "../render.h"
#include "../input.h"
#include "../audio.h"

static int g_boss;
static int g_line;
static int g_auto_frames;

void dialogue_enter(App *a, int boss_index)
{
    (void)a;
    g_boss = boss_index;
    g_line = 0;
    g_auto_frames = 0;
}

static void start_boss_game(App *a)
{
    const BossInfo *b = jsb_boss(g_boss);
    a->mode = MODE_STORY;
    a->boss_index = g_boss;
    snprintf(a->level, sizeof a->level, "%s", b->ai);
    snprintf(a->names[0], sizeof a->names[0], "あなた");
    snprintf(a->names[1], sizeof a->names[1], "%s", b->name);
    game_enter(a);
    a->screen = SCR_GAME;
}

void dialogue_frame(App *a)
{
    const BossInfo *b = jsb_boss(g_boss);
    if (!b) { a->screen = SCR_STORY; return; }

    bool advance = false, skip = false;
    int auto_frame_for_shot = 0;
    if (a->autoplay == 2) {
        g_auto_frames++;
        auto_frame_for_shot = g_auto_frames;
        if (g_auto_frames % 20 == 0) advance = true;
    } else {
        advance = input_pressed(BTN_A);
        skip = input_pressed(BTN_START);
        if (input_pressed(BTN_B)) { // 会話中にBで戻れると親切（webはスキップ不可のためAのみだが中断は許容）
            audio_play("click");
            story_enter(a);
            a->screen = SCR_STORY;
            return;
        }
    }
    bool want_shot = input_pressed(BTN_SELECT) && a->shot_dir[0];

    if (skip) { start_boss_game(a); return; }
    if (advance) {
        audio_play("click");
        g_line++;
        if (g_line >= b->intro_count) { start_boss_game(a); return; }
    }

    // ---- 描画 ----
    draw_night_sky();
    draw_text(SCREEN_W / 2, 40, 24, C_DIM, ALIGN_CENTER, b->title);

    // ボス絵（カードPNG流用）
    int size = 300;
    draw_card_art(SCREEN_W / 2 - size / 2, 110, size, size, b->art);

    // 会話ウィンドウ
    int wy = 470;
    panel(70, wy, SCREEN_W - 140, 190, 235);
    fill_rect(90, wy + 18, text_width(22, b->name) + 24, 36, C_DARK, 220);
    draw_text(102, wy + 22, 22, C_GOLD, ALIGN_LEFT, b->name);
    if (g_line < b->intro_count)
        draw_wrapped(102, wy + 76, SCREEN_W - 260, 20, C_TEXT, 32, b->intro[g_line]);

    // ページ表示
    char prog[32];
    snprintf(prog, sizeof prog, "%d / %d", g_line + 1, b->intro_count);
    draw_text(SCREEN_W - 110, wy + 152, 15, C_DIM, ALIGN_LEFT, prog);

    draw_text(SCREEN_W / 2, 700, 17, C_DIM, ALIGN_CENTER, "A:次へ  START:スキップ");

    if (auto_frame_for_shot == 2) app_screenshot(a, "dialogue");
    if (want_shot) app_screenshot(a, "dialogue");
}
