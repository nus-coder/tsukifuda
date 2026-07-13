// render.h — 描画ヘルパ（テキストLRUキャッシュ、カード、月アイコン、夜空背景）
#ifndef TSUKIFUDA_RENDER_H
#define TSUKIFUDA_RENDER_H

#include <SDL.h>
#include <stdbool.h>
#include "jsbridge.h"

typedef enum { ALIGN_LEFT, ALIGN_CENTER, ALIGN_RIGHT } Align;

// 色パレット
#define COL(r, g, b) (SDL_Color){ (r), (g), (b), 255 }
#define C_TEXT      COL(0xef, 0xea, 0xf8)
#define C_DIM       COL(0x9a, 0x93, 0xb8)
#define C_GOLD      COL(0xf5, 0xe6, 0xa8)
#define C_RED       COL(0xe0, 0x6a, 0x6a)
#define C_GREEN     COL(0x8f, 0xd8, 0x9a)
#define C_PANEL     COL(0x1f, 0x1b, 0x33)
#define C_BORDER    COL(0x8f, 0x86, 0xc4)
#define C_DARK      COL(0x14, 0x11, 0x26)

enum {
    CARD_SELECTED = 1 << 0,
    CARD_DISABLED = 1 << 1,
    CARD_WIN      = 1 << 2,
    CARD_LOSE     = 1 << 3,
    CARD_CURSOR   = 1 << 4,
};

bool render_init(SDL_Renderer *ren, const char *res_dir);
void render_shutdown(void);

// テキスト。戻り値は描画幅(px)
int draw_text(int x, int y, int size, SDL_Color color, Align align, const char *text);
int text_width(int size, const char *text);
// UTF-8禁則なし折り返し。lines[max_lines][cap] に書き込み、行数を返す
int wrap_text(const char *text, int size, int max_w, char lines[][256], int max_lines);
// その場で折り返して描画。描画した高さ(px)を返す
int draw_wrapped(int x, int y, int max_w, int size, SDL_Color color, int line_h, const char *text);

void fill_rect(int x, int y, int w, int h, SDL_Color c, Uint8 alpha);
void draw_frame(int x, int y, int w, int h, SDL_Color c);       // 枠線のみ
void panel(int x, int y, int w, int h, Uint8 alpha);            // 面+枠
void fill_circle(int cx, int cy, int r, SDL_Color c, Uint8 alpha);

void draw_night_sky(void);
void draw_moon_icon(int cx, int cy, int r, Moon m);
// カード描画（枠+絵+パワー+名前+短文）。w>=110 で短文も描く
void draw_card(int x, int y, int w, int h, int id, unsigned flags);
void draw_card_art(int x, int y, int w, int h, int id);          // 絵のみ（会話ポートレート等）

#endif
