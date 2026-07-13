// input.c — 入力抽象化。
// 実機(tg5040/TRIMUI Brick): SDLジョイスティック。ボタン番号は
// NextUI workspace/tg5040/platform/platform.h より A=1 B=0 X=3 Y=2 SELECT=6 START=7、
// 十字キーはハット(SDL_JOYHATMOTION)。
// mac: 矢印=十字, x=A, z=B, s=X, a=Y, Return=START, Space=SELECT。
#include "input.h"

#include <string.h>

#define REPEAT_DELAY_MS 300
#define REPEAT_INTERVAL_MS 100

static bool g_held[BTN_COUNT];
static bool g_pressed[BTN_COUNT];
static Uint32 g_held_since[BTN_COUNT];
static Uint32 g_last_repeat[BTN_COUNT];
static SDL_Joystick *g_joy;

// tg5040 のジョイスティックボタン番号 → 論理ボタン
static int joybtn_map(int code)
{
    switch (code) {
    case 1: return BTN_A;
    case 0: return BTN_B;
    case 3: return BTN_X;
    case 2: return BTN_Y;
    case 7: return BTN_START;
    case 6: return BTN_SELECT;
    default: return -1;
    }
}

static int key_map(SDL_Keycode k)
{
    switch (k) {
    case SDLK_UP: return BTN_UP;
    case SDLK_DOWN: return BTN_DOWN;
    case SDLK_LEFT: return BTN_LEFT;
    case SDLK_RIGHT: return BTN_RIGHT;
    case SDLK_x: return BTN_A;
    case SDLK_z: return BTN_B;
    case SDLK_s: return BTN_X;
    case SDLK_a: return BTN_Y;
    case SDLK_RETURN: return BTN_START;
    case SDLK_SPACE: return BTN_SELECT;
    default: return -1;
    }
}

void input_init(void)
{
    if (SDL_InitSubSystem(SDL_INIT_JOYSTICK) == 0) {
        if (SDL_NumJoysticks() > 0)
            g_joy = SDL_JoystickOpen(0);
        SDL_JoystickEventState(SDL_ENABLE);
    }
    memset(g_held, 0, sizeof g_held);
}

void input_shutdown(void)
{
    if (g_joy) { SDL_JoystickClose(g_joy); g_joy = NULL; }
}

static void press(int b, Uint32 now)
{
    if (b < 0 || g_held[b]) return;
    g_held[b] = true;
    g_pressed[b] = true;
    g_held_since[b] = now;
    g_last_repeat[b] = now;
}

static void release(int b)
{
    if (b < 0) return;
    g_held[b] = false;
}

static void set_hat(Uint8 v, Uint32 now)
{
    bool up = v & SDL_HAT_UP, down = v & SDL_HAT_DOWN;
    bool left = v & SDL_HAT_LEFT, right = v & SDL_HAT_RIGHT;
    if (up) press(BTN_UP, now); else release(BTN_UP);
    if (down) press(BTN_DOWN, now); else release(BTN_DOWN);
    if (left) press(BTN_LEFT, now); else release(BTN_LEFT);
    if (right) press(BTN_RIGHT, now); else release(BTN_RIGHT);
}

bool input_poll(Uint32 now)
{
    memset(g_pressed, 0, sizeof g_pressed);

    SDL_Event e;
    while (SDL_PollEvent(&e)) {
        switch (e.type) {
        case SDL_QUIT:
            return false;
        case SDL_KEYDOWN:
            if (e.key.repeat) break; // リピートは自前で行う
            if (e.key.keysym.sym == SDLK_ESCAPE) return false;
            press(key_map(e.key.keysym.sym), now);
            break;
        case SDL_KEYUP:
            release(key_map(e.key.keysym.sym));
            break;
        case SDL_JOYBUTTONDOWN:
            press(joybtn_map(e.jbutton.button), now);
            break;
        case SDL_JOYBUTTONUP:
            release(joybtn_map(e.jbutton.button));
            break;
        case SDL_JOYHATMOTION:
            set_hat(e.jhat.value, now);
            break;
        default:
            break;
        }
    }

    // 十字キーのキーリピート（初回300ms、以後100ms間隔）
    for (int b = BTN_UP; b <= BTN_RIGHT; b++) {
        if (!g_held[b] || g_pressed[b]) continue;
        Uint32 held_for = now - g_held_since[b];
        if (held_for >= REPEAT_DELAY_MS && now - g_last_repeat[b] >= REPEAT_INTERVAL_MS) {
            g_pressed[b] = true;
            g_last_repeat[b] = now;
        }
    }
    return true;
}

bool input_pressed(Button b) { return g_pressed[b]; }
bool input_held(Button b) { return g_held[b]; }
