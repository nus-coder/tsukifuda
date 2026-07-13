// game.c — ゲーム画面。進行は web版 main.js / 演出・ログは ui.js を正として踏襲。
// 自分=player0、AI=player1 固定。
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "../app.h"
#include "../render.h"
#include "../input.h"
#include "../audio.h"
#include "../save.h"

typedef enum {
    GP_CHOOSE,   // カード選択（手札/月齢トラックのフォーカス切替あり）
    GP_AI_WAIT,  // 相手が考えています…
    GP_CUTIN,    // 大勝負カットイン（賭点5+）
    GP_REVEAL,   // 同時公開 → イベントログ → 次ラウンド/結果へ
    GP_RESULT,   // 結果オーバーレイ
} GPhase;

static GameState g_st;
static GPhase g_phase;
static int g_cursor;          // 手札カーソル（handのindex）
static int g_selected;        // 選択済みカードid（-1=なし）
static bool g_focus_track;
static int g_track_cursor;
static bool g_detail;         // Y: カード詳細
static bool g_paused;
static int g_pause_cursor;
static bool g_forfeit_confirm;

static Uint32 g_timer;        // フェーズ用タイマー（now基準の締切）
static Uint32 g_reveal_t0;
static int g_reveal_stage;
static bool g_cutin_big;
static RoundResult g_res;
static bool g_have_res;

static char g_log[16][240];
static int g_log_n;
static bool g_result_recorded;
static int g_final_winner;
static bool g_shot_taken;
static Uint32 g_result_at;

// ---------- ログ ----------

static void log_add(App *a, const char *text)
{
    if (g_log_n < 16) g_log_n++;
    for (int i = g_log_n - 1; i > 0; i--)
        memcpy(g_log[i], g_log[i - 1], sizeof g_log[0]);
    snprintf(g_log[0], sizeof g_log[0], "%s", text);
    if (a->autoplay) printf("[log] %s\n", text);
}

// ui.js describeRound の移植（myIndex=0）
static void describe_round(const RoundResult *r, char *buf, size_t cap)
{
    const CardInfo *my = jsb_card(r->picks[0]);
    const CardInfo *op = jsb_card(r->picks[1]);
    size_t n = 0;
    n += (size_t)snprintf(buf + n, cap - n, "あなた「%s(%d)」 vs 相手「%s(%d)」 → ",
                          my->name, r->power[0], op->name, r->power[1]);
    if (r->winner == -1) {
        n += (size_t)snprintf(buf + n, cap - n,
            (r->events & EV_FOX_DRAW) ? "妖狐の妖術で引き分け！ %d点持ち越し。"
                                      : "引き分け！ %d点持ち越し。", r->pot);
    } else {
        const char *win_name = r->winner == 0 ? "あなた" : "相手";
        if (r->events & EV_LANTERN)
            n += (size_t)snprintf(buf + n, cap - n,
                "%sの勝ち…だが提灯おばけが灯を消した！ 月光点はポットへ（%d点）。", win_name, r->pot);
        else
            n += (size_t)snprintf(buf + n, cap - n, "%sが %d点 を獲得！", win_name, r->stake);
        if (r->events & EV_TENGU) n += (size_t)snprintf(buf + n, cap - n, " 天狗ボーナス+1。");
        if (r->events & EV_KAPPA) n += (size_t)snprintf(buf + n, cap - n, " 河童が皿の水で+1。");
        if (r->events & EV_OROCHI) n += (size_t)snprintf(buf + n, cap - n, " 大蛇が1点を呑み込んだ。");
        if (r->events & EV_SAMURAI) n += (size_t)snprintf(buf + n, cap - n, " 侍の霊、次戦+2の構え。");
    }
    if (r->eclipse)
        snprintf(buf + n, cap - n, "（月蝕により能力無効）");
    else if (r->canceled[0] && r->picks[1] == 2)
        snprintf(buf + n, cap - n, "（猫又があなたの能力を無効化）");
    else if (r->canceled[1] && r->picks[0] == 2)
        snprintf(buf + n, cap - n, "（猫又が相手の能力を無効化）");
}

// ---------- ラウンド進行 ----------

static void enter_choose(App *a)
{
    (void)a;
    g_phase = GP_CHOOSE;
    g_selected = -1;
    g_cursor = 0;
    g_focus_track = false;
    g_detail = false;
    g_have_res = false;
    // 月齢演出（webの phaseAmbience 相当）
    if (!g_st.finished && g_st.phases[g_st.round].moon == MOON_ECLIPSE)
        audio_play("eclipse");
}

void game_enter(App *a)
{
    for (int i = 0; i < 12; i++) a->taken[i] = -2;
    g_log_n = 0;
    g_result_recorded = false;
    g_paused = false;
    g_shot_taken = false;

    if (!jsb_new_game(a->mode == MODE_STORY ? a->boss_index : -1, -1) ||
        !jsb_state(&g_st)) {
        fprintf(stderr, "[game] newGame failed\n");
        a->screen = SCR_TITLE;
        title_enter(a);
        return;
    }
    audio_play("start");
    if (a->mode == MODE_STORY) {
        const BossInfo *b = jsb_boss(a->boss_index);
        if (b && b->pot > 0) {
            char line[160];
            snprintf(line, sizeof line, "%sが場に%d点を積んだ！", b->name, b->pot);
            log_add(a, line);
        }
    }
    enter_choose(a);
}

static void record_result(App *a, int winner)
{
    if (g_result_recorded) return;
    g_result_recorded = true;
    SaveData *sv = save_data();
    if (a->mode == MODE_CPU) {
        Stats *s = strcmp(a->level, "hard") == 0 ? &sv->hard : &sv->novice;
        if (winner == -1) s->d++;
        else if (winner == 0) s->w++;
        else s->l++;
        save_commit();
    } else if (a->mode == MODE_STORY) {
        if (winner == 0 && a->boss_index + 1 > sv->story) {
            sv->story = a->boss_index + 1;
            save_commit();
        }
    }
}

static void start_reveal(App *a)
{
    g_phase = GP_REVEAL;
    g_reveal_t0 = a->now;
    g_reveal_stage = 0;
    audio_play("flip");
}

static void confirm_pick(App *a)
{
    g_phase = GP_AI_WAIT;
    g_timer = a->now + (a->autoplay ? 30 : (Uint32)(450 + rand() % 650));
}

static void resolve_now(App *a)
{
    int ai = jsb_ai_pick(a->level);
    if (ai < 0) { fprintf(stderr, "[game] aiPick failed\n"); a->running = false; return; }
    if (!jsb_resolve(g_selected, ai, &g_res)) { a->running = false; return; }
    g_have_res = true;
    jsb_state(&g_st);
    a->taken[g_st.round - 1] = g_res.winner;

    if (g_res.stake >= 5) {
        g_phase = GP_CUTIN;
        g_cutin_big = g_res.stake >= 8;
        Uint32 dur = a->autoplay ? 100 : 3500;
        g_timer = a->now + dur;
        if (!a->autoplay) {
            audio_play(g_cutin_big ? "tensionBig_riser" : "tension_riser");
            audio_play_delayed(g_cutin_big ? "tensionBig_hit" : "tension_hit", 3260);
        }
    } else {
        start_reveal(a);
    }
}

// 公開ステージ1: イベントログ + 効果音（ui.js doReveal のイベント→sfx対応を踏襲）
static void reveal_events(App *a)
{
    g_reveal_stage = 1;
    const RoundResult *r = &g_res;

    if (r->phase.moon == MOON_FULL && !r->eclipse &&
        (r->picks[0] == 8 || r->picks[1] == 8))
        audio_play("howl");

    if (r->winner == -1) {
        audio_play((r->events & EV_FOX_DRAW) ? "fox" : "draw");
    } else {
        bool i_won = r->winner == 0;
        audio_play(i_won ? "win" : "lose");
        if (r->events & EV_LANTERN) {
            audio_play("lantern");
        } else if (r->stake >= 5) {
            audio_play("pot");
        }
        if (r->events & (EV_TENGU | EV_KAPPA)) audio_play_delayed("coin", 350);
        if (r->events & EV_OROCHI) audio_play_delayed("steal", 500);
    }

    char line[240];
    describe_round(r, line, sizeof line);
    log_add(a, line);
    if (a->autoplay) {
        printf("[round %02d] moon=%s stake=%d you=%d(%d) cpu=%d(%d) winner=%s score=%d-%d pot=%d\n",
               g_st.round, moon_key(r->phase.moon), r->stake,
               r->picks[0], r->power[0], r->picks[1], r->power[1],
               r->winner == -1 ? "draw" : (r->winner == 0 ? "you" : "cpu"),
               r->scores[0], r->scores[1], r->pot);
    }
}

static void enter_result(App *a)
{
    g_phase = GP_RESULT;
    g_final_winner = jsb_game_winner();
    g_result_at = a->now;
    record_result(a, g_final_winner);
    if (a->autoplay) {
        printf("[result] winner=%s score=%d-%d\n",
               g_final_winner == -1 ? "draw" : (g_final_winner == 0 ? "you" : "cpu"),
               g_st.scores[0], g_st.scores[1]);
    }
}

// ---------- 入力 ----------

static void forfeit(App *a)
{
    // 投了は負け扱い（web版と同じ）。ストーリーはストーリー選択へ、CPU戦はタイトルへ。
    g_paused = false;
    if (a->mode == MODE_CPU) record_result(a, 1);
    GameMode mode = a->mode;
    a->mode = MODE_NONE;
    if (mode == MODE_STORY) { story_enter(a); a->screen = SCR_STORY; }
    else { title_enter(a); a->screen = SCR_TITLE; }
}

static void pause_input(App *a)
{
    const int PAUSE_N = 5;
    if (input_pressed(BTN_UP)) { g_pause_cursor = (g_pause_cursor + PAUSE_N - 1) % PAUSE_N; g_forfeit_confirm = false; audio_play("select"); }
    if (input_pressed(BTN_DOWN)) { g_pause_cursor = (g_pause_cursor + 1) % PAUSE_N; g_forfeit_confirm = false; audio_play("select"); }
    if (input_pressed(BTN_B) || input_pressed(BTN_START)) {
        g_paused = false;
        audio_play("click");
        return;
    }
    if (!input_pressed(BTN_A)) return;
    audio_play("click");
    SaveData *sv = save_data();
    switch (g_pause_cursor) {
    case 0: g_paused = false; break;
    case 1:
        g_paused = false;
        a->rules_return = SCR_GAME;
        rules_enter(a);
        a->screen = SCR_RULES;
        break;
    case 2:
        audio_set_muted(!audio_muted());
        sv->muted = audio_muted();
        save_commit();
        break;
    case 3:
        audio_set_bgm(!audio_bgm_on());
        sv->bgm = audio_bgm_on();
        save_commit();
        break;
    case 4:
        if (!g_forfeit_confirm) { g_forfeit_confirm = true; break; }
        forfeit(a);
        break;
    }
}

static void choose_input(App *a)
{
    int n = g_st.hand_count[0];
    if (n == 0) return;
    if (g_cursor >= n) g_cursor = n - 1;

    if (g_detail) {
        if (input_pressed(BTN_A) || input_pressed(BTN_B) || input_pressed(BTN_Y))
            { g_detail = false; audio_play("click"); }
        return;
    }
    if (input_pressed(BTN_START)) {
        g_paused = true;
        g_pause_cursor = 0;
        g_forfeit_confirm = false;
        audio_play("click");
        return;
    }
    if (g_focus_track) {
        if (input_pressed(BTN_LEFT) && g_track_cursor > 0) { g_track_cursor--; audio_play("click"); }
        if (input_pressed(BTN_RIGHT) && g_track_cursor < 11) { g_track_cursor++; audio_play("click"); }
        if (input_pressed(BTN_DOWN) || input_pressed(BTN_B)) { g_focus_track = false; audio_play("click"); }
        return;
    }
    if (input_pressed(BTN_UP)) {
        g_focus_track = true;
        g_track_cursor = g_st.round < 12 ? g_st.round : 11;
        audio_play("click");
        return;
    }
    if (input_pressed(BTN_LEFT)) { g_cursor = (g_cursor + n - 1) % n; audio_play("click"); }
    if (input_pressed(BTN_RIGHT)) { g_cursor = (g_cursor + 1) % n; audio_play("click"); }
    if (input_pressed(BTN_Y)) { g_detail = true; audio_play("click"); }
    if (input_pressed(BTN_B)) g_selected = -1;
    if (input_pressed(BTN_A)) {
        int card = g_st.hands[0][g_cursor];
        if (g_selected == card) {
            confirm_pick(a);
        } else {
            g_selected = card;
            audio_play("select");
        }
    }
}

static void result_input(App *a)
{
    if (input_pressed(BTN_A)) { // もう一回 / 再挑戦
        audio_play("click");
        game_enter(a);
        return;
    }
    if (input_pressed(BTN_B)) {
        audio_play("click");
        GameMode mode = a->mode;
        a->mode = MODE_NONE;
        if (mode == MODE_STORY) { story_enter(a); a->screen = SCR_STORY; }
        else { title_enter(a); a->screen = SCR_TITLE; }
    }
}

// ---------- 描画 ----------

static void draw_opp_hand(void)
{
    int n = g_st.hand_count[1];
    int step = 78, w = 70, h = 96;
    int x0 = (SCREEN_W - n * step + (step - w)) / 2;
    for (int i = 0; i < n; i++) {
        int id = g_st.hands[1][i];
        int x = x0 + i * step;
        fill_rect(x, 40, w, h, C_PANEL, 200);
        draw_frame(x, 40, w, h, C_BORDER);
        draw_card_art(x + 5, 44, w - 10, w - 10, id);
        const CardInfo *c = jsb_card(id);
        char label[64];
        snprintf(label, sizeof label, "%d %s", id, c->name);
        draw_text(x + w / 2, 40 + h - 22, 12, C_TEXT, ALIGN_CENTER, label);
    }
}

static void draw_track(void)
{
    int step = 60, w = 54, h = 72;
    int x0 = (SCREEN_W - 12 * step + (step - w)) / 2;
    int y = 150;
    for (int i = 0; i < 12; i++) {
        int x = x0 + i * step;
        const PhaseInfo *ph = &g_st.phases[i];
        bool done = i < g_st.round;
        bool current = i == g_st.round && !g_st.finished;
        bool special = ph->moon == MOON_NEW || ph->moon == MOON_ECLIPSE || ph->moon == MOON_FULL;

        fill_rect(x, y, w, h, special ? COL(0x2e, 0x1f, 0x40) : C_PANEL, done ? 130 : 220);
        draw_frame(x, y, w, h, current ? C_GOLD : C_BORDER);
        if (current) draw_frame(x - 1, y - 1, w + 2, h + 2, C_GOLD);
        if (g_focus_track && i == g_track_cursor) {
            draw_frame(x - 3, y - 3, w + 6, h + 6, C_GOLD);
            draw_frame(x - 2, y - 2, w + 4, h + 4, C_GOLD);
        }
        draw_moon_icon(x + w / 2, y + 22, 15, ph->moon);
        char v[8];
        snprintf(v, sizeof v, "%d", ph->value);
        draw_text(x + w / 2, y + 42, 17, done ? C_DIM : C_GOLD, ALIGN_CENTER, v);
        // 消化済みラウンドの勝敗マーク(○/●/−)は draw_track_marks() で重ね描き
    }
}

// taken はAppにあるので分離して描く
static void draw_track_marks(App *a)
{
    int step = 60, w = 54;
    int x0 = (SCREEN_W - 12 * step + (step - w)) / 2;
    for (int i = 0; i < 12 && i < g_st.round; i++) {
        int x = x0 + i * step;
        const char *m = a->taken[i] == 0 ? "○" : (a->taken[i] == 1 ? "●" : "−");
        SDL_Color c = a->taken[i] == 0 ? C_GREEN : (a->taken[i] == 1 ? C_RED : C_DIM);
        draw_text(x + w / 2, 150 + 72 - 8, 14, c, ALIGN_CENTER, m);
    }
}

static void draw_center(App *a)
{
    // 左パネル: ラウンド情報
    int lx = 12, ly = 240, lw = 268, lh = 240;
    panel(lx, ly, lw, lh, 200);
    if (!g_st.finished) {
        const PhaseInfo *ph = &g_st.phases[g_st.round];
        const MoonDef *md = jsb_moon(ph->moon);
        char buf[128];
        snprintf(buf, sizeof buf, "第%d戦 / 12 — %s", g_st.round + 1, md->name);
        draw_text(lx + 14, ly + 12, 19, C_TEXT, ALIGN_LEFT, buf);
        snprintf(buf, sizeof buf, "%d 点", ph->value + g_st.pot);
        draw_text(lx + 14, ly + 46, 40, C_GOLD, ALIGN_LEFT, buf);
        if (g_st.pot > 0) {
            snprintf(buf, sizeof buf, "持ち越し +%d", g_st.pot);
            draw_text(lx + 14, ly + 100, 18, C_RED, ALIGN_LEFT, buf);
        }
        // 月齢アラート（webはアイコン絵文字、ここは月アイコン描画+文言）
        const char *alert = NULL;
        if (ph->moon == MOON_NEW) alert = "新月：パワーの低い方が勝つ！";
        else if (ph->moon == MOON_ECLIPSE) alert = "月蝕：全カードの能力無効！";
        else if (ph->moon == MOON_FULL) alert = "満月：人狼はパワー+5";
        if (alert) {
            draw_moon_icon(lx + 26, ly + 148, 13, ph->moon);
            draw_wrapped(lx + 46, ly + 136, lw - 60, 16, C_GOLD, 22, alert);
        }
        // 月齢トラックのフォーカス詳細
        if (g_focus_track) {
            const PhaseInfo *tp = &g_st.phases[g_track_cursor];
            const MoonDef *tm = jsb_moon(tp->moon);
            snprintf(buf, sizeof buf, "%s（%d点）: %s", tm->name, tp->value, tm->desc);
            draw_wrapped(lx + 14, ly + 184, lw - 28, 15, C_TEXT, 21, buf);
        }
    }

    // 中央: 対戦スロット
    int slot_w = 130, slot_h = 184, sy = 268;
    int ox = 320, mx = 574;
    draw_text(ox + slot_w / 2, sy - 26, 16, C_DIM, ALIGN_CENTER, "相手");
    draw_text(mx + slot_w / 2, sy - 26, 16, C_DIM, ALIGN_CENTER, "あなた");
    bool show = g_phase == GP_REVEAL || g_phase == GP_RESULT;
    if (show && g_have_res) {
        unsigned of = 0, mf = 0;
        if (g_reveal_stage >= 1 && g_res.winner != -1) {
            if (g_res.winner == 0) { mf |= CARD_WIN; of |= CARD_LOSE; }
            else { of |= CARD_WIN; mf |= CARD_LOSE; }
        }
        draw_card(ox, sy, slot_w, slot_h, g_res.picks[1], of);
        draw_card(mx, sy, slot_w, slot_h, g_res.picks[0], mf);
        if (g_reveal_stage >= 1) {
            // パワー表示（修正後）
            char p[16];
            snprintf(p, sizeof p, "%d", g_res.power[1]);
            draw_text(ox + slot_w / 2, sy + slot_h + 6, 20, C_TEXT, ALIGN_CENTER, p);
            snprintf(p, sizeof p, "%d", g_res.power[0]);
            draw_text(mx + slot_w / 2, sy + slot_h + 6, 20, C_TEXT, ALIGN_CENTER, p);
            if (g_res.canceled[1]) draw_text(ox + slot_w / 2, sy + slot_h / 2 - 18, 30, C_RED, ALIGN_CENTER, "封");
            if (g_res.canceled[0]) draw_text(mx + slot_w / 2, sy + slot_h / 2 - 18, 30, C_RED, ALIGN_CENTER, "封");
        }
    } else {
        // 空スロット
        draw_frame(ox, sy, slot_w, slot_h, C_BORDER);
        draw_frame(mx, sy, slot_w, slot_h, C_BORDER);
        if (g_selected >= 0 && (g_phase == GP_CHOOSE || g_phase == GP_AI_WAIT || g_phase == GP_CUTIN))
            draw_card(mx, sy, slot_w, slot_h, g_selected,
                      g_phase == GP_CHOOSE ? CARD_SELECTED : 0);
    }
    draw_text((ox + mx + slot_w) / 2, sy + slot_h / 2 - 18, 30, C_DIM, ALIGN_CENTER, "対");

    // 右パネル: ログ
    int rx = 724, ry = 240, rw = 288, rh = 240;
    panel(rx, ry, rw, rh, 200);
    draw_text(rx + 12, ry + 8, 15, C_DIM, ALIGN_LEFT, "ログ");
    int y = ry + 32;
    for (int i = 0; i < g_log_n && y < ry + rh - 20; i++) {
        SDL_Color c = i == 0 ? C_TEXT : C_DIM;
        char lines[4][256];
        int ln = wrap_text(g_log[i], 13, rw - 24, lines, 4);
        for (int k = 0; k < ln && y < ry + rh - 18; k++) {
            draw_text(rx + 12, y, 13, c, ALIGN_LEFT, lines[k]);
            y += 18;
        }
        y += 4;
    }

    (void)a;
}

static void draw_my_hand(App *a)
{
    (void)a;
    int n = g_st.hand_count[0];
    int step = 82, w = 78, h = 112;
    int x0 = (SCREEN_W - n * step + (step - w)) / 2;
    int y = 620;
    for (int i = 0; i < n; i++) {
        int id = g_st.hands[0][i];
        unsigned flags = 0;
        int yy = y;
        if (!g_focus_track && g_phase == GP_CHOOSE && i == g_cursor) {
            flags |= CARD_CURSOR;
            yy -= 14;
        }
        if (id == g_selected) flags |= CARD_SELECTED;
        if (g_phase != GP_CHOOSE) flags |= CARD_DISABLED;
        draw_card(x0 + i * step, yy, w, h, id, flags);
    }
}

static void draw_status_rows(App *a)
{
    // 上段: 相手
    char buf[160];
    snprintf(buf, sizeof buf, "%s", a->names[1]);
    draw_text(16, 8, 20, C_TEXT, ALIGN_LEFT, buf);
    snprintf(buf, sizeof buf, "%d 点", g_st.scores[1]);
    draw_text(16 + text_width(20, a->names[1]) + 18, 8, 20, C_GOLD, ALIGN_LEFT, buf);
    if (g_st.buffs[1] > 0)
        draw_text(16 + text_width(20, a->names[1]) + 110, 10, 16, C_RED, ALIGN_LEFT, "次戦+2");

    // 下段: 自分
    int y = 584;
    snprintf(buf, sizeof buf, "%s", a->names[0]);
    draw_text(16, y, 20, C_TEXT, ALIGN_LEFT, buf);
    snprintf(buf, sizeof buf, "%d 点", g_st.scores[0]);
    draw_text(16 + text_width(20, a->names[0]) + 18, y, 20, C_GOLD, ALIGN_LEFT, buf);
    if (g_st.buffs[0] > 0)
        draw_text(16 + text_width(20, a->names[0]) + 110, y + 2, 16, C_GOLD, ALIGN_LEFT, "侍の霊：次戦+2");

    // ヒント
    const char *hint = "";
    if (g_phase == GP_CHOOSE) {
        if (g_focus_track) hint = "←→:月齢を確認  ↓/B:手札へ戻る";
        else if (g_selected >= 0) hint = "もう一度Aで決定 / Bで選び直す";
        else hint = "カードを選んでください";
    } else if (g_phase == GP_AI_WAIT) {
        hint = "相手が考えています…";
    }
    draw_text(SCREEN_W / 2, 500, 19, C_TEXT, ALIGN_CENTER, hint);

    // 操作ガイド
    if (g_phase == GP_CHOOSE)
        draw_text(SCREEN_W - 14, 584, 14, C_DIM, ALIGN_RIGHT,
                  "A:選択/決定  B:取消  Y:詳細  ↑:月齢  START:メニュー");
}

static void draw_detail(void)
{
    int id = g_focus_track ? -1 : g_st.hands[0][g_cursor];
    if (id < 0) return;
    const CardInfo *c = jsb_card(id);
    int w = 560, h = 240;
    int x = (SCREEN_W - w) / 2, y = (SCREEN_H - h) / 2;
    fill_rect(0, 0, SCREEN_W, SCREEN_H, C_DARK, 160);
    panel(x, y, w, h, 250);
    draw_card_art(x + 24, y + 24, 120, 120, id);
    char title[128];
    snprintf(title, sizeof title, "%d　%s（%s）", c->id, c->name, c->kana);
    draw_text(x + 168, y + 28, 24, C_GOLD, ALIGN_LEFT, title);
    draw_wrapped(x + 168, y + 70, w - 192, 18, C_TEXT, 28, c->text);
    draw_wrapped(x + 168, y + 150, w - 192, 16, C_DIM, 24, c->flavor);
    draw_text(x + w / 2, y + h - 34, 15, C_DIM, ALIGN_CENTER, "A/B/Y:閉じる");
}

static void draw_cutin(App *a)
{
    (void)a;
    fill_rect(0, 0, SCREEN_W, SCREEN_H, C_DARK, 210);
    fill_rect(0, SCREEN_H / 2 - 110, SCREEN_W, 220, g_cutin_big ? COL(0x40, 0x10, 0x20) : COL(0x20, 0x18, 0x40), 240);
    fill_rect(0, SCREEN_H / 2 - 110, SCREEN_W, 3, C_GOLD, 255);
    fill_rect(0, SCREEN_H / 2 + 107, SCREEN_W, 3, C_GOLD, 255);
    draw_text(SCREEN_W / 2, SCREEN_H / 2 - 80, 64, g_cutin_big ? C_RED : C_GOLD, ALIGN_CENTER,
              g_cutin_big ? "逢魔ヶ刻" : "月下大勝負");
    char s[32];
    snprintf(s, sizeof s, "%d点", g_res.stake);
    draw_text(SCREEN_W / 2, SCREEN_H / 2 + 16, 48, C_TEXT, ALIGN_CENTER, s);
}

static void draw_pause(void)
{
    fill_rect(0, 0, SCREEN_W, SCREEN_H, C_DARK, 190);
    int w = 420, h = 380;
    int x = (SCREEN_W - w) / 2, y = (SCREEN_H - h) / 2;
    panel(x, y, w, h, 250);
    draw_text(x + w / 2, y + 22, 26, C_TEXT, ALIGN_CENTER, "中断メニュー");
    char items[5][64];
    snprintf(items[0], sizeof items[0], "対戦に戻る");
    snprintf(items[1], sizeof items[1], "ルールを見る");
    snprintf(items[2], sizeof items[2], "効果音：%s", audio_muted() ? "OFF" : "ON");
    snprintf(items[3], sizeof items[3], "BGM：%s", audio_bgm_on() ? "ON" : "OFF");
    snprintf(items[4], sizeof items[4], "%s", g_forfeit_confirm ? "本当に投了する？" : "投了する");
    for (int i = 0; i < 5; i++) {
        int iy = y + 80 + i * 52;
        bool cur = i == g_pause_cursor;
        if (cur) {
            fill_rect(x + 30, iy - 6, w - 60, 40, C_PANEL, 255);
            draw_frame(x + 30, iy - 6, w - 60, 40, C_GOLD);
        }
        SDL_Color c = i == 4 && g_forfeit_confirm ? C_RED : (cur ? C_GOLD : C_TEXT);
        draw_text(x + w / 2, iy, 20, c, ALIGN_CENTER, items[i]);
    }
}

static void draw_result(App *a)
{
    fill_rect(0, 0, SCREEN_W, SCREEN_H, C_DARK, 190);
    int w = 640, h = 360;
    int x = (SCREEN_W - w) / 2, y = (SCREEN_H - h) / 2;
    panel(x, y, w, h, 250);

    const char *title = g_final_winner == -1 ? "引き分け"
                       : (g_final_winner == 0 ? "あなたの勝ち！" : "あなたの負け…");
    SDL_Color tc = g_final_winner == 0 ? C_GOLD : (g_final_winner == -1 ? C_TEXT : C_DIM);
    draw_text(x + w / 2, y + 36, 44, tc, ALIGN_CENTER, title);

    char detail[192];
    snprintf(detail, sizeof detail, "%s %d点 — %s %d点",
             a->names[0], g_st.scores[0], a->names[1], g_st.scores[1]);
    draw_text(x + w / 2, y + 110, 22, C_TEXT, ALIGN_CENTER, detail);

    const char *rematch = "もう一回";
    if (a->mode == MODE_STORY) {
        const BossInfo *b = jsb_boss(a->boss_index);
        bool won = g_final_winner == 0;
        rematch = won ? "もう一度戦う" : "再挑戦する";
        // ボス台詞
        char lines[4][256];
        int n = wrap_text(won ? b->win_text : b->lose_text, 18, w - 100, lines, 4);
        for (int i = 0; i < n; i++)
            draw_text(x + w / 2, y + 160 + i * 28, 18, C_GOLD, ALIGN_CENTER, lines[i]);
    }

    char help[160];
    snprintf(help, sizeof help, "A:%s  B:%s", rematch,
             a->mode == MODE_STORY ? "ストーリー選択へ" : "タイトルへ");
    draw_text(x + w / 2, y + h - 50, 19, C_TEXT, ALIGN_CENTER, help);
}

// ---------- フレーム ----------

void game_frame(App *a)
{
    // --- 更新 ---
    // スクリーンショットは実際に描画された後のバッファでないと真っ黒になるため、
    // ここではフラグだけ立てて、末尾の描画完了後にまとめて撮る。
    bool shot_game = false, shot_result = false;
    bool end_after_shot = false;

    if (g_paused) {
        pause_input(a);
    } else {
        switch (g_phase) {
        case GP_CHOOSE:
            if (a->autoplay) {
                // ランダム合法手を即選択
                if (!g_shot_taken && g_st.round >= 2) {
                    shot_game = true;
                    g_shot_taken = true;
                }
                int n = g_st.hand_count[0];
                g_selected = g_st.hands[0][rand() % n];
                confirm_pick(a);
            } else {
                choose_input(a);
            }
            break;
        case GP_AI_WAIT:
            if (!a->autoplay && input_pressed(BTN_START)) {
                g_paused = true; g_pause_cursor = 0; g_forfeit_confirm = false;
            }
            if (a->now >= g_timer) resolve_now(a);
            break;
        case GP_CUTIN:
            if (a->now >= g_timer) start_reveal(a);
            break;
        case GP_REVEAL: {
            Uint32 t1 = a->autoplay ? 20 : 550;
            Uint32 t2 = t1 + (a->autoplay ? 30 : 1900);
            if (g_reveal_stage == 0 && a->now - g_reveal_t0 >= t1) reveal_events(a);
            if (g_reveal_stage == 1 && a->now - g_reveal_t0 >= t2) {
                if (g_st.finished) enter_result(a);
                else enter_choose(a);
            }
            break;
        }
        case GP_RESULT:
            if (a->autoplay) {
                if (a->now - g_result_at > 300) {
                    shot_result = true;
                    end_after_shot = true;
                }
            } else {
                result_input(a);
            }
            break;
        }
        if (!a->autoplay && input_pressed(BTN_SELECT) && a->shot_dir[0])
            shot_game = true;
    }

    // 画面遷移が起きていたら描画しない（次フレームから新画面）
    if (a->screen != SCR_GAME) return;

    // --- 描画 ---
    draw_night_sky();
    draw_status_rows(a);
    draw_opp_hand();
    draw_track();
    draw_track_marks(a);
    draw_center(a);
    draw_my_hand(a);

    if (g_phase == GP_CUTIN) draw_cutin(a);
    if (g_detail) draw_detail();
    if (g_phase == GP_RESULT) draw_result(a);
    if (g_paused) draw_pause();

    if (shot_game) app_screenshot(a, "game");
    if (shot_result) app_screenshot(a, "result");
    if (end_after_shot) a->running = false;
}
