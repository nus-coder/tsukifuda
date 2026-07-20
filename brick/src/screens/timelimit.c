// timelimit.c — 制限時間選択画面。
// 対戦形式（CPU/対戦キャラクター等）を決めた直後、ゲーム開始前に挟んで使う。
#include <stdio.h>

#include "../app.h"
#include "../render.h"
#include "../input.h"
#include "../audio.h"
#include "../save.h"

static int g_cursor;
static void (*g_on_confirm)(App *a);
static ScreenId g_cancel_screen;

void timelimit_enter(App *a, void (*on_confirm)(App *a), ScreenId cancel_screen)
{
    (void)a;
    g_on_confirm = on_confirm;
    g_cancel_screen = cancel_screen;
    int tl = save_data()->time_limit;
    g_cursor = 1; // 既定20秒の位置にフォールバック
    for (int i = 0; i < TIME_LIMIT_N; i++)
        if (TIME_LIMIT_OPTIONS[i] == tl) g_cursor = i;
}

void timelimit_frame(App *a)
{
    if (input_pressed(BTN_UP)) { g_cursor = (g_cursor + TIME_LIMIT_N - 1) % TIME_LIMIT_N; audio_play("select"); }
    if (input_pressed(BTN_DOWN)) { g_cursor = (g_cursor + 1) % TIME_LIMIT_N; audio_play("select"); }
    if (input_pressed(BTN_B)) {
        audio_play("click");
        a->screen = g_cancel_screen;
        return;
    }
    if (input_pressed(BTN_A) || input_pressed(BTN_START)) {
        audio_play("click");
        SaveData *sv = save_data();
        sv->time_limit = TIME_LIMIT_OPTIONS[g_cursor];
        save_commit();
        void (*cb)(App *a) = g_on_confirm;
        g_on_confirm = NULL;
        if (cb) cb(a);
        return;
    }

    draw_night_sky();
    draw_text(SCREEN_W / 2, 220, 40, C_TEXT, ALIGN_CENTER, "制限時間を選ぶ");
    draw_text(SCREEN_W / 2, 268, 18, C_DIM, ALIGN_CENTER, "カード選択の持ち時間を決めてください。");

    int y = 380;
    for (int i = 0; i < TIME_LIMIT_N; i++) {
        bool cur = i == g_cursor;
        char label[24];
        if (TIME_LIMIT_OPTIONS[i] > 0) snprintf(label, sizeof label, "%d秒", TIME_LIMIT_OPTIONS[i]);
        else snprintf(label, sizeof label, "なし");
        if (cur) {
            fill_rect(SCREEN_W / 2 - 220, y - 8, 440, 46, C_PANEL, 220);
            draw_frame(SCREEN_W / 2 - 220, y - 8, 440, 46, C_GOLD);
            draw_text(SCREEN_W / 2 - 200, y, 24, C_GOLD, ALIGN_LEFT, "▶");
        }
        draw_text(SCREEN_W / 2, y, 24, cur ? C_GOLD : C_TEXT, ALIGN_CENTER, label);
        y += 58;
    }
    draw_text(SCREEN_W / 2, 748, 14, C_DIM, ALIGN_CENTER, "十字キー:選択  A:決定  B:戻る");
}
