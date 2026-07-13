// input.h — 論理ボタン抽象化（実機ジョイスティック / mac キーボード）
#ifndef TSUKIFUDA_INPUT_H
#define TSUKIFUDA_INPUT_H

#include <SDL.h>
#include <stdbool.h>

typedef enum {
    BTN_UP,
    BTN_DOWN,
    BTN_LEFT,
    BTN_RIGHT,
    BTN_A,
    BTN_B,
    BTN_X,
    BTN_Y,
    BTN_START,
    BTN_SELECT,
    BTN_COUNT,
} Button;

void input_init(void);
void input_shutdown(void);

// 毎フレーム冒頭で呼ぶ。SDLイベントを消化する。falseなら終了要求(SDL_QUIT)
bool input_poll(Uint32 now);

bool input_pressed(Button b);  // このフレームで押下（十字キーはキーリピート込み）
bool input_held(Button b);

#endif
