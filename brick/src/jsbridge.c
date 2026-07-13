// jsbridge.c — QuickJS ランタイム埋め込み。game.js を評価し BRIDGE を呼ぶ。
#include "jsbridge.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "quickjs.h"

static JSRuntime *g_rt;
static JSContext *g_ctx;

static CardInfo g_cards[12];
static MoonDef g_moons[MOON_COUNT];
static BossInfo g_bosses[BOSS_MAX];
static int g_boss_count;

static const char *MOON_KEYS[MOON_COUNT] = {
    "crescent", "half", "full", "new", "eclipse",
};

const char *moon_key(Moon m) { return MOON_KEYS[m]; }

static Moon moon_from_key(const char *k)
{
    for (int i = 0; i < MOON_COUNT; i++)
        if (k && strcmp(k, MOON_KEYS[i]) == 0)
            return (Moon)i;
    return MOON_CRESCENT;
}

// ---------- 低レベルヘルパ ----------

static void dump_exception(void)
{
    JSValue exc = JS_GetException(g_ctx);
    const char *s = JS_ToCString(g_ctx, exc);
    fprintf(stderr, "[jsbridge] JS exception: %s\n", s ? s : "(unknown)");
    if (s) JS_FreeCString(g_ctx, s);
    JSValue stack = JS_GetPropertyStr(g_ctx, exc, "stack");
    if (!JS_IsUndefined(stack)) {
        const char *st = JS_ToCString(g_ctx, stack);
        if (st) { fprintf(stderr, "%s\n", st); JS_FreeCString(g_ctx, st); }
    }
    JS_FreeValue(g_ctx, stack);
    JS_FreeValue(g_ctx, exc);
}

static int prop_int(JSValue obj, const char *name, int fallback)
{
    JSValue v = JS_GetPropertyStr(g_ctx, obj, name);
    int32_t out = fallback;
    if (!JS_IsUndefined(v) && !JS_IsNull(v)) {
        double d;
        if (JS_ToFloat64(g_ctx, &d, v) == 0) out = (int32_t)d;
    }
    JS_FreeValue(g_ctx, v);
    return out;
}

static bool prop_bool(JSValue obj, const char *name)
{
    JSValue v = JS_GetPropertyStr(g_ctx, obj, name);
    bool out = JS_ToBool(g_ctx, v) > 0;
    JS_FreeValue(g_ctx, v);
    return out;
}

static void prop_str(JSValue obj, const char *name, char *buf, size_t cap)
{
    buf[0] = '\0';
    JSValue v = JS_GetPropertyStr(g_ctx, obj, name);
    if (JS_IsString(v)) {
        const char *s = JS_ToCString(g_ctx, v);
        if (s) {
            snprintf(buf, cap, "%s", s);
            JS_FreeCString(g_ctx, s);
        }
    }
    JS_FreeValue(g_ctx, v);
}

static int idx_int(JSValue arr, uint32_t i, int fallback)
{
    JSValue v = JS_GetPropertyUint32(g_ctx, arr, i);
    int32_t out = fallback;
    if (!JS_IsUndefined(v)) {
        double d;
        if (JS_ToFloat64(g_ctx, &d, v) == 0) out = (int32_t)d;
    }
    JS_FreeValue(g_ctx, v);
    return out;
}

static bool idx_bool(JSValue arr, uint32_t i)
{
    JSValue v = JS_GetPropertyUint32(g_ctx, arr, i);
    bool out = JS_ToBool(g_ctx, v) > 0;
    JS_FreeValue(g_ctx, v);
    return out;
}

static int arr_len(JSValue arr)
{
    return prop_int(arr, "length", 0);
}

static JSValue bridge_call(const char *fn, int argc, JSValue *argv)
{
    JSValue global = JS_GetGlobalObject(g_ctx);
    JSValue bridge = JS_GetPropertyStr(g_ctx, global, "BRIDGE");
    JSValue f = JS_GetPropertyStr(g_ctx, bridge, fn);
    JSValue ret = JS_Call(g_ctx, f, bridge, argc, argv);
    if (JS_IsException(ret)) dump_exception();
    JS_FreeValue(g_ctx, f);
    JS_FreeValue(g_ctx, bridge);
    JS_FreeValue(g_ctx, global);
    for (int i = 0; i < argc; i++) JS_FreeValue(g_ctx, argv[i]);
    return ret;
}

static void read_phase(JSValue ph, PhaseInfo *out)
{
    char key[24];
    prop_str(ph, "moon", key, sizeof key);
    out->moon = moon_from_key(key);
    out->value = prop_int(ph, "value", 0);
}

// ---------- 定義キャッシュ ----------

static void cache_defs(void)
{
    // cards
    JSValue cards = bridge_call("cards", 0, NULL);
    for (uint32_t i = 0; i < 12; i++) {
        JSValue c = JS_GetPropertyUint32(g_ctx, cards, i);
        CardInfo *ci = &g_cards[i];
        ci->id = prop_int(c, "id", (int)i);
        prop_str(c, "name", ci->name, sizeof ci->name);
        prop_str(c, "kana", ci->kana, sizeof ci->kana);
        prop_str(c, "short", ci->short_text, sizeof ci->short_text);
        prop_str(c, "text", ci->text, sizeof ci->text);
        prop_str(c, "flavor", ci->flavor, sizeof ci->flavor);
        JS_FreeValue(g_ctx, c);
    }
    JS_FreeValue(g_ctx, cards);

    // moons
    JSValue moons = bridge_call("moons", 0, NULL);
    for (int m = 0; m < MOON_COUNT; m++) {
        JSValue mv = JS_GetPropertyStr(g_ctx, moons, MOON_KEYS[m]);
        prop_str(mv, "name", g_moons[m].name, sizeof g_moons[m].name);
        prop_str(mv, "desc", g_moons[m].desc, sizeof g_moons[m].desc);
        JS_FreeValue(g_ctx, mv);
    }
    JS_FreeValue(g_ctx, moons);

    // bosses
    JSValue bosses = bridge_call("bosses", 0, NULL);
    int n = arr_len(bosses);
    if (n > BOSS_MAX) n = BOSS_MAX;
    g_boss_count = n;
    for (int i = 0; i < n; i++) {
        JSValue b = JS_GetPropertyUint32(g_ctx, bosses, (uint32_t)i);
        BossInfo *bi = &g_bosses[i];
        prop_str(b, "name", bi->name, sizeof bi->name);
        prop_str(b, "title", bi->title, sizeof bi->title);
        bi->art = prop_int(b, "art", 0);
        prop_str(b, "ai", bi->ai, sizeof bi->ai);
        bi->pot = prop_int(b, "pot", 0);
        prop_str(b, "gimmick", bi->gimmick, sizeof bi->gimmick);
        prop_str(b, "win", bi->win_text, sizeof bi->win_text);
        prop_str(b, "lose", bi->lose_text, sizeof bi->lose_text);
        JSValue intro = JS_GetPropertyStr(g_ctx, b, "intro");
        int ic = arr_len(intro);
        if (ic > BOSS_INTRO_MAX) ic = BOSS_INTRO_MAX;
        bi->intro_count = ic;
        for (int k = 0; k < ic; k++) {
            JSValue line = JS_GetPropertyUint32(g_ctx, intro, (uint32_t)k);
            const char *s = JS_ToCString(g_ctx, line);
            if (s) {
                snprintf(bi->intro[k], sizeof bi->intro[k], "%s", s);
                JS_FreeCString(g_ctx, s);
            }
            JS_FreeValue(g_ctx, line);
        }
        JS_FreeValue(g_ctx, intro);
        JS_FreeValue(g_ctx, b);
    }
    JS_FreeValue(g_ctx, bosses);
}

// ---------- 公開API ----------

bool jsb_init(const char *game_js_path)
{
    g_rt = JS_NewRuntime();
    if (!g_rt) return false;
    g_ctx = JS_NewContext(g_rt);
    if (!g_ctx) { JS_FreeRuntime(g_rt); g_rt = NULL; return false; }

    FILE *f = fopen(game_js_path, "rb");
    if (!f) {
        fprintf(stderr, "[jsbridge] cannot open %s\n", game_js_path);
        return false;
    }
    fseek(f, 0, SEEK_END);
    long len = ftell(f);
    fseek(f, 0, SEEK_SET);
    char *src = malloc((size_t)len + 1);
    if (!src) { fclose(f); return false; }
    size_t rd = fread(src, 1, (size_t)len, f);
    fclose(f);
    src[rd] = '\0';

    // Math.random は QuickJS が JS_NewContext 時にマイクロ秒精度の時刻で
    // 自動的にシードするため、ここでの追加シード処理は不要。

    JSValue ret = JS_Eval(g_ctx, src, rd, "game.js", JS_EVAL_TYPE_GLOBAL);
    free(src);
    if (JS_IsException(ret)) {
        dump_exception();
        JS_FreeValue(g_ctx, ret);
        return false;
    }
    JS_FreeValue(g_ctx, ret);

    // BRIDGE 存在確認
    JSValue global = JS_GetGlobalObject(g_ctx);
    JSValue bridge = JS_GetPropertyStr(g_ctx, global, "BRIDGE");
    bool ok = JS_IsObject(bridge);
    JS_FreeValue(g_ctx, bridge);
    JS_FreeValue(g_ctx, global);
    if (!ok) {
        fprintf(stderr, "[jsbridge] BRIDGE global not found in %s\n", game_js_path);
        return false;
    }

    cache_defs();
    return true;
}

void jsb_shutdown(void)
{
    if (g_ctx) { JS_FreeContext(g_ctx); g_ctx = NULL; }
    if (g_rt) { JS_FreeRuntime(g_rt); g_rt = NULL; }
}

bool jsb_new_game(int boss_index, int start_pot)
{
    JSValue argv[3];
    argv[0] = JS_NewInt32(g_ctx, boss_index);
    argv[1] = start_pot < 0 ? JS_NULL : JS_NewInt32(g_ctx, start_pot);
    argv[2] = JS_NULL;
    JSValue ret = bridge_call("newGame", 3, argv);
    bool ok = !JS_IsException(ret) && JS_IsObject(ret);
    JS_FreeValue(g_ctx, ret);
    return ok;
}

int jsb_ai_pick(const char *level)
{
    JSValue argv[1] = { JS_NewString(g_ctx, level) };
    JSValue ret = bridge_call("aiPick", 1, argv);
    int32_t pick = -1;
    if (!JS_IsException(ret)) JS_ToInt32(g_ctx, &pick, ret);
    JS_FreeValue(g_ctx, ret);
    return pick;
}

bool jsb_resolve(int p0, int p1, RoundResult *out)
{
    JSValue argv[2] = { JS_NewInt32(g_ctx, p0), JS_NewInt32(g_ctx, p1) };
    JSValue r = bridge_call("resolve", 2, argv);
    if (JS_IsException(r) || !JS_IsObject(r)) { JS_FreeValue(g_ctx, r); return false; }

    memset(out, 0, sizeof *out);
    JSValue picks = JS_GetPropertyStr(g_ctx, r, "picks");
    out->picks[0] = idx_int(picks, 0, -1);
    out->picks[1] = idx_int(picks, 1, -1);
    JS_FreeValue(g_ctx, picks);

    JSValue power = JS_GetPropertyStr(g_ctx, r, "power");
    out->power[0] = idx_int(power, 0, 0);
    out->power[1] = idx_int(power, 1, 0);
    JS_FreeValue(g_ctx, power);

    out->winner = prop_int(r, "winner", -1);
    out->stake = prop_int(r, "stake", 0);
    out->eclipse = prop_bool(r, "eclipse");
    out->pot = prop_int(r, "pot", 0);

    JSValue canceled = JS_GetPropertyStr(g_ctx, r, "canceled");
    out->canceled[0] = idx_bool(canceled, 0);
    out->canceled[1] = idx_bool(canceled, 1);
    JS_FreeValue(g_ctx, canceled);

    JSValue scores = JS_GetPropertyStr(g_ctx, r, "scores");
    out->scores[0] = idx_int(scores, 0, 0);
    out->scores[1] = idx_int(scores, 1, 0);
    JS_FreeValue(g_ctx, scores);

    JSValue phase = JS_GetPropertyStr(g_ctx, r, "phase");
    read_phase(phase, &out->phase);
    JS_FreeValue(g_ctx, phase);

    JSValue events = JS_GetPropertyStr(g_ctx, r, "events");
    int n = arr_len(events);
    for (int i = 0; i < n; i++) {
        JSValue ev = JS_GetPropertyUint32(g_ctx, events, (uint32_t)i);
        const char *s = JS_ToCString(g_ctx, ev);
        if (s) {
            if (strcmp(s, "draw") == 0) out->events |= EV_DRAW;
            else if (strcmp(s, "fox_draw") == 0) out->events |= EV_FOX_DRAW;
            else if (strcmp(s, "lantern") == 0) out->events |= EV_LANTERN;
            else if (strcmp(s, "tengu") == 0) out->events |= EV_TENGU;
            else if (strcmp(s, "kappa") == 0) out->events |= EV_KAPPA;
            else if (strcmp(s, "orochi") == 0) out->events |= EV_OROCHI;
            else if (strcmp(s, "samurai") == 0) out->events |= EV_SAMURAI;
            JS_FreeCString(g_ctx, s);
        }
        JS_FreeValue(g_ctx, ev);
    }
    JS_FreeValue(g_ctx, events);
    JS_FreeValue(g_ctx, r);
    return true;
}

bool jsb_state(GameState *out)
{
    JSValue s = bridge_call("state", 0, NULL);
    if (JS_IsException(s) || !JS_IsObject(s)) { JS_FreeValue(g_ctx, s); return false; }

    memset(out, 0, sizeof *out);
    out->round = prop_int(s, "round", 0);
    out->pot = prop_int(s, "pot", 0);
    out->finished = prop_bool(s, "finished");

    JSValue phases = JS_GetPropertyStr(g_ctx, s, "phases");
    for (uint32_t i = 0; i < 12; i++) {
        JSValue ph = JS_GetPropertyUint32(g_ctx, phases, i);
        read_phase(ph, &out->phases[i]);
        JS_FreeValue(g_ctx, ph);
    }
    JS_FreeValue(g_ctx, phases);

    JSValue players = JS_GetPropertyStr(g_ctx, s, "players");
    for (uint32_t p = 0; p < 2; p++) {
        JSValue pl = JS_GetPropertyUint32(g_ctx, players, p);
        out->scores[p] = prop_int(pl, "score", 0);
        out->buffs[p] = prop_int(pl, "buff", 0);
        JSValue hand = JS_GetPropertyStr(g_ctx, pl, "hand");
        int n = arr_len(hand);
        if (n > 12) n = 12;
        out->hand_count[p] = n;
        for (int i = 0; i < n; i++)
            out->hands[p][i] = idx_int(hand, (uint32_t)i, 0);
        JS_FreeValue(g_ctx, hand);
        JS_FreeValue(g_ctx, pl);
    }
    JS_FreeValue(g_ctx, players);
    JS_FreeValue(g_ctx, s);
    return true;
}

int jsb_game_winner(void)
{
    JSValue ret = bridge_call("gameWinner", 0, NULL);
    if (JS_IsNull(ret) || JS_IsUndefined(ret) || JS_IsException(ret)) {
        JS_FreeValue(g_ctx, ret);
        return -2;
    }
    int32_t w = -2;
    JS_ToInt32(g_ctx, &w, ret);
    JS_FreeValue(g_ctx, ret);
    return w;
}

const CardInfo *jsb_card(int id)
{
    if (id < 0 || id > 11) return NULL;
    return &g_cards[id];
}

const MoonDef *jsb_moon(Moon m)
{
    if ((int)m < 0 || m >= MOON_COUNT) return NULL;
    return &g_moons[m];
}

const BossInfo *jsb_boss(int i)
{
    if (i < 0 || i >= g_boss_count) return NULL;
    return &g_bosses[i];
}

int jsb_boss_count(void) { return g_boss_count; }
