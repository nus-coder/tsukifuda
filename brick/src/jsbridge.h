// jsbridge.h — QuickJS 上のゲームロジック (engine/ai/cards/story) への C API
#ifndef TSUKIFUDA_JSBRIDGE_H
#define TSUKIFUDA_JSBRIDGE_H

#include <stdbool.h>

typedef enum {
    MOON_CRESCENT,
    MOON_HALF,
    MOON_FULL,
    MOON_NEW,
    MOON_ECLIPSE,
    MOON_COUNT,
} Moon;

typedef struct {
    Moon moon;
    int value;
} PhaseInfo;

typedef struct {
    int round;
    int pot;
    bool finished;
    int scores[2];
    int buffs[2];
    int hands[2][12];
    int hand_count[2];
    PhaseInfo phases[12];
} GameState;

enum {
    EV_DRAW     = 1 << 0,
    EV_FOX_DRAW = 1 << 1,
    EV_LANTERN  = 1 << 2,
    EV_TENGU    = 1 << 3,
    EV_KAPPA    = 1 << 4,
    EV_OROCHI   = 1 << 5,
    EV_SAMURAI  = 1 << 6,
};

typedef struct {
    int picks[2];
    int power[2];
    int winner;        // 0 | 1 | -1
    int stake;
    unsigned events;   // EV_*
    bool eclipse;
    bool canceled[2];
    int scores[2];
    int pot;
    PhaseInfo phase;
} RoundResult;

typedef struct {
    int id;
    char name[48];
    char kana[48];
    char short_text[96];
    char text[192];
    char flavor[128];
} CardInfo;

typedef struct {
    char name[32];
    char desc[96];
} MoonDef;

#define BOSS_MAX 8
#define BOSS_INTRO_MAX 8

typedef struct {
    char name[64];
    char title[64];
    int art;
    char ai[16];
    int pot;
    char gimmick[256];
    char intro[BOSS_INTRO_MAX][256];
    int intro_count;
    char win_text[256];
    char lose_text[256];
} BossInfo;

bool jsb_init(const char *game_js_path);
void jsb_shutdown(void);

// boss_index=-1 で通常CPU戦。start_pot<0 ならボス既定値(通常戦は0)
bool jsb_new_game(int boss_index, int start_pot);
int  jsb_ai_pick(const char *level);                 // AI(player1)のカードid。失敗=-1
bool jsb_resolve(int p0, int p1, RoundResult *out);
bool jsb_state(GameState *out);
int  jsb_game_winner(void);                          // 0|1|-1、未終了=-2

const CardInfo *jsb_card(int id);          // 0..11
const MoonDef  *jsb_moon(Moon m);
const BossInfo *jsb_boss(int i);
int jsb_boss_count(void);
const char *moon_key(Moon m);

#endif
