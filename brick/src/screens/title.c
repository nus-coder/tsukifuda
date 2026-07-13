// title.c — タイトル画面（縦メニュー + 戦績表示）
#include <stdio.h>
#include <string.h>

#include "../app.h"
#include "../render.h"
#include "../input.h"
#include "../audio.h"
#include "../save.h"

static int g_cursor;
static int g_auto_frames; // autoplay用

static const char *MENU[] = {
    "CPU 見習い妖怪と対戦",
    "CPU 大妖怪と対戦",
    "ストーリー",
    "遊び方",
};
#define MENU_N 4

void title_enter(App *a)
{
    (void)a;
    g_cursor = 0;
    g_auto_frames = 0;
}

static void start_cpu(App *a, const char *level)
{
    a->mode = MODE_CPU;
    snprintf(a->level, sizeof a->level, "%s", level);
    a->boss_index = -1;
    snprintf(a->names[0], sizeof a->names[0], "あなた");
    snprintf(a->names[1], sizeof a->names[1], "%s",
             strcmp(level, "hard") == 0 ? "CPU 大妖怪" : "CPU 見習い妖怪");
    game_enter(a);
    a->screen = SCR_GAME;
}

static void activate(App *a, int idx)
{
    audio_play("click");
    switch (idx) {
    case 0: start_cpu(a, "novice"); break;
    case 1: start_cpu(a, "hard"); break;
    case 2: story_enter(a); a->screen = SCR_STORY; break;
    case 3:
        a->rules_return = SCR_TITLE;
        a->from_pause = false;
        rules_enter(a);
        a->screen = SCR_RULES;
        break;
    }
}

static void render(App *a)
{
    (void)a;
    draw_night_sky();

    // 月とタイトルロゴ
    draw_moon_icon(SCREEN_W / 2, 150, 70, MOON_FULL);
    draw_text(SCREEN_W / 2, 240, 72, C_TEXT, ALIGN_CENTER, "ツキフダ");
    draw_text(SCREEN_W / 2, 330, 22, C_DIM, ALIGN_CENTER, "月夜の十二番勝負");

    // メニュー
    int y = 420;
    for (int i = 0; i < MENU_N; i++) {
        bool cur = i == g_cursor;
        if (cur) {
            fill_rect(SCREEN_W / 2 - 220, y - 8, 440, 46, C_PANEL, 220);
            draw_frame(SCREEN_W / 2 - 220, y - 8, 440, 46, C_GOLD);
            draw_text(SCREEN_W / 2 - 200, y, 24, C_GOLD, ALIGN_LEFT, "▶");
        }
        draw_text(SCREEN_W / 2, y, 24, cur ? C_GOLD : C_TEXT, ALIGN_CENTER, MENU[i]);
        y += 58;
    }

    // 戦績（web版 renderTitleStats の文言に準拠）
    SaveData *sv = save_data();
    char line[256] = "";
    struct { const char *label; Stats *s; } rows[2] = {
        { "CPU 見習い妖怪", &sv->novice },
        { "CPU 大妖怪", &sv->hard },
    };
    for (int i = 0; i < 2; i++) {
        Stats *s = rows[i].s;
        if (s->w + s->l + s->d == 0) continue;
        char part[96];
        if (s->d)
            snprintf(part, sizeof part, "%s：%d勝 %d敗 %d分", rows[i].label, s->w, s->l, s->d);
        else
            snprintf(part, sizeof part, "%s：%d勝 %d敗", rows[i].label, s->w, s->l);
        if (line[0]) strncat(line, "　", sizeof line - strlen(line) - 1);
        strncat(line, part, sizeof line - strlen(line) - 1);
    }
    if (line[0]) {
        draw_text(SCREEN_W / 2, 690, 18, C_DIM, ALIGN_CENTER, "これまでの戦績");
        draw_text(SCREEN_W / 2, 716, 18, C_TEXT, ALIGN_CENTER, line);
    }

    draw_text(SCREEN_W / 2, 748, 14, C_DIM, ALIGN_CENTER, "十字キー:選択  A:決定");
}

void title_frame(App *a)
{
    // 自動テスト: タイトルのスクリーンショットを撮ってから対戦へ
    if (a->autoplay) {
        g_auto_frames++;
        render(a);
        if (g_auto_frames == 2) app_screenshot(a, "title");
        if (g_auto_frames == 3) {
            if (a->autoplay == 2) { story_enter(a); a->screen = SCR_STORY; }
            else start_cpu(a, "hard");
        }
        return;
    }

    if (input_pressed(BTN_UP)) { g_cursor = (g_cursor + MENU_N - 1) % MENU_N; audio_play("select"); }
    if (input_pressed(BTN_DOWN)) { g_cursor = (g_cursor + 1) % MENU_N; audio_play("select"); }
    if (input_pressed(BTN_A) || input_pressed(BTN_START)) activate(a, g_cursor);
    bool want_shot = input_pressed(BTN_SELECT) && a->shot_dir[0];

    render(a);
    if (want_shot) app_screenshot(a, "title");
}
