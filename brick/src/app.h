// app.h — 共通型・アプリ全体状態
#ifndef TSUKIFUDA_APP_H
#define TSUKIFUDA_APP_H

#include <SDL.h>
#include <stdbool.h>

#define SCREEN_W 1024
#define SCREEN_H 768

typedef enum {
    SCR_TITLE,
    SCR_RULES,
    SCR_STORY,
    SCR_DIALOGUE,
    SCR_TIMELIMIT,
    SCR_GAME,
} ScreenId;

typedef enum {
    MODE_NONE,
    MODE_CPU,
    MODE_STORY,
} GameMode;

struct App;
typedef struct App App;

struct App {
    SDL_Window *win;
    SDL_Renderer *ren;
    bool running;
    int autoplay;               // 0=なし 1=CPU戦自動 2=ストーリー経路自動 (TSUKIFUDA_AUTOPLAY)
    Uint32 now;                 // 今フレームの SDL_GetTicks()

    ScreenId screen;

    // ゲーム進行（web版 main.js の G に相当）
    GameMode mode;
    char level[16];             // "novice" | "mid" | "hard"
    int boss_index;
    char names[2][64];          // [0]=あなた, [1]=相手表示名
    int taken[12];              // 各ラウンドの勝者 0/1/-1、未消化=-2
    ScreenId rules_return;      // 遊び方から戻る先
    bool from_pause;            // ルール画面へ中断メニューから来たか

    char shot_dir[512];         // TSUKIFUDA_SHOTDIR（スクリーンショット保存先）
    int shot_seq;
};

// 画面ごとの enter/update+render（main.c から呼ぶ）
void title_enter(App *a);
void title_frame(App *a);
void rules_enter(App *a);
void rules_frame(App *a);
void story_enter(App *a);
void story_frame(App *a);
void dialogue_enter(App *a, int boss_index); // intro再生→ゲーム開始
void dialogue_frame(App *a);
// 対戦形式・対戦キャラクターを決めた直後、ゲーム開始前に挟む制限時間選択画面。
// 決定で on_confirm(a) を呼ぶ（画面遷移はコールバック側の責任）。Bで cancel_screen へ戻る。
void timelimit_enter(App *a, void (*on_confirm)(App *a), ScreenId cancel_screen);
void timelimit_frame(App *a);
void game_enter(App *a);      // mode/level/boss_index を設定済みで呼ぶ
void game_frame(App *a);

void app_set_screen(App *a, ScreenId s);
void app_screenshot(App *a, const char *name);

#endif
