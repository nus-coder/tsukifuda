// render.c — SDL2_ttf テキスト描画 + LRUキャッシュ、カード合成、月アイコン、夜空。
#include "render.h"

#include <SDL_image.h>
#include <SDL_ttf.h>
#include <stdio.h>
#include <string.h>

#include "app.h"

#define TEXT_CACHE_MAX 384
#define FONT_SIZES_MAX 12

static SDL_Renderer *g_ren;
static char g_font_path[1024];
static TTF_Font *g_fonts[FONT_SIZES_MAX];
static int g_font_sizes[FONT_SIZES_MAX];
static int g_font_count;

static SDL_Texture *g_card_tex[12]; // out/res/cards/NN.png（無ければNULL→プレースホルダ）

typedef struct {
    char text[256];
    int size;
    Uint32 rgba;
    SDL_Texture *tex;
    int w, h;
    Uint64 last_use;
} TextEntry;

static TextEntry g_cache[TEXT_CACHE_MAX];
static int g_cache_count;
static Uint64 g_use_counter;

// ---------- フォント ----------

static TTF_Font *font_for(int size)
{
    for (int i = 0; i < g_font_count; i++)
        if (g_font_sizes[i] == size) return g_fonts[i];
    if (g_font_count >= FONT_SIZES_MAX) return g_fonts[0];
    TTF_Font *f = TTF_OpenFont(g_font_path, size);
    if (!f) {
        fprintf(stderr, "[render] TTF_OpenFont(%d) failed: %s\n", size, TTF_GetError());
        return g_font_count > 0 ? g_fonts[0] : NULL;
    }
    g_fonts[g_font_count] = f;
    g_font_sizes[g_font_count] = size;
    g_font_count++;
    return f;
}

// ---------- テキストキャッシュ ----------

static TextEntry *cache_get(const char *text, int size, SDL_Color c)
{
    Uint32 rgba = ((Uint32)c.r << 24) | ((Uint32)c.g << 16) | ((Uint32)c.b << 8) | c.a;
    for (int i = 0; i < g_cache_count; i++) {
        TextEntry *e = &g_cache[i];
        if (e->size == size && e->rgba == rgba && strcmp(e->text, text) == 0) {
            e->last_use = ++g_use_counter;
            return e;
        }
    }
    TTF_Font *f = font_for(size);
    if (!f) return NULL;
    SDL_Surface *surf = TTF_RenderUTF8_Blended(f, text, c);
    if (!surf) return NULL;
    SDL_Texture *tex = SDL_CreateTextureFromSurface(g_ren, surf);
    int w = surf->w, h = surf->h;
    SDL_FreeSurface(surf);
    if (!tex) return NULL;

    TextEntry *e;
    if (g_cache_count < TEXT_CACHE_MAX) {
        e = &g_cache[g_cache_count++];
    } else {
        // LRU: 最も古いエントリを追い出す
        e = &g_cache[0];
        for (int i = 1; i < TEXT_CACHE_MAX; i++)
            if (g_cache[i].last_use < e->last_use) e = &g_cache[i];
        if (e->tex) SDL_DestroyTexture(e->tex);
    }
    snprintf(e->text, sizeof e->text, "%s", text);
    e->size = size;
    e->rgba = rgba;
    e->tex = tex;
    e->w = w;
    e->h = h;
    e->last_use = ++g_use_counter;
    return e;
}

int draw_text(int x, int y, int size, SDL_Color color, Align align, const char *text)
{
    if (!text || !text[0]) return 0;
    TextEntry *e = cache_get(text, size, color);
    if (!e) return 0;
    int dx = x;
    if (align == ALIGN_CENTER) dx = x - e->w / 2;
    else if (align == ALIGN_RIGHT) dx = x - e->w;
    SDL_Rect dst = { dx, y, e->w, e->h };
    SDL_RenderCopy(g_ren, e->tex, NULL, &dst);
    return e->w;
}

int text_width(int size, const char *text)
{
    if (!text || !text[0]) return 0;
    TTF_Font *f = font_for(size);
    if (!f) return 0;
    int w = 0, h = 0;
    TTF_SizeUTF8(f, text, &w, &h);
    return w;
}

static int utf8_len(unsigned char c)
{
    if (c < 0x80) return 1;
    if ((c & 0xe0) == 0xc0) return 2;
    if ((c & 0xf0) == 0xe0) return 3;
    if ((c & 0xf8) == 0xf0) return 4;
    return 1;
}

int wrap_text(const char *text, int size, int max_w, char lines[][256], int max_lines)
{
    int line = 0;
    char cur[256];
    size_t cur_len = 0;
    cur[0] = '\0';
    const char *p = text;
    while (*p && line < max_lines) {
        if (*p == '\n') {
            snprintf(lines[line++], 256, "%s", cur);
            cur_len = 0; cur[0] = '\0';
            p++;
            continue;
        }
        int cl = utf8_len((unsigned char)*p);
        if (cur_len + (size_t)cl >= sizeof cur - 1) cl = 1; // 保険
        char tmp[256];
        memcpy(tmp, cur, cur_len);
        memcpy(tmp + cur_len, p, (size_t)cl);
        tmp[cur_len + (size_t)cl] = '\0';
        if (cur_len > 0 && text_width(size, tmp) > max_w) {
            snprintf(lines[line++], 256, "%s", cur);
            cur_len = 0; cur[0] = '\0';
            continue; // 同じ文字をもう一度
        }
        memcpy(cur + cur_len, p, (size_t)cl);
        cur_len += (size_t)cl;
        cur[cur_len] = '\0';
        p += cl;
    }
    if (cur_len > 0 && line < max_lines)
        snprintf(lines[line++], 256, "%s", cur);
    return line;
}

int draw_wrapped(int x, int y, int max_w, int size, SDL_Color color, int line_h, const char *text)
{
    char lines[24][256];
    int n = wrap_text(text, size, max_w, lines, 24);
    for (int i = 0; i < n; i++)
        draw_text(x, y + i * line_h, size, color, ALIGN_LEFT, lines[i]);
    return n * line_h;
}

// ---------- プリミティブ ----------

void fill_rect(int x, int y, int w, int h, SDL_Color c, Uint8 alpha)
{
    SDL_SetRenderDrawBlendMode(g_ren, SDL_BLENDMODE_BLEND);
    SDL_SetRenderDrawColor(g_ren, c.r, c.g, c.b, alpha);
    SDL_Rect r = { x, y, w, h };
    SDL_RenderFillRect(g_ren, &r);
}

void draw_frame(int x, int y, int w, int h, SDL_Color c)
{
    SDL_SetRenderDrawBlendMode(g_ren, SDL_BLENDMODE_BLEND);
    SDL_SetRenderDrawColor(g_ren, c.r, c.g, c.b, 255);
    SDL_Rect r = { x, y, w, h };
    SDL_RenderDrawRect(g_ren, &r);
}

void panel(int x, int y, int w, int h, Uint8 alpha)
{
    fill_rect(x, y, w, h, C_PANEL, alpha);
    draw_frame(x, y, w, h, C_BORDER);
}

void fill_circle(int cx, int cy, int r, SDL_Color c, Uint8 alpha)
{
    SDL_SetRenderDrawBlendMode(g_ren, SDL_BLENDMODE_BLEND);
    SDL_SetRenderDrawColor(g_ren, c.r, c.g, c.b, alpha);
    for (int dy = -r; dy <= r; dy++) {
        int half = (int)SDL_sqrt((double)(r * r - dy * dy));
        SDL_RenderDrawLine(g_ren, cx - half, cy + dy, cx + half, cy + dy);
    }
}

// ---------- 夜空 ----------

void draw_night_sky(void)
{
    // 縦グラデ: 上 #0e0b1e → 下 #241d3d
    for (int y = 0; y < SCREEN_H; y += 4) {
        float t = (float)y / SCREEN_H;
        Uint8 r = (Uint8)(0x0e + t * (0x24 - 0x0e));
        Uint8 g = (Uint8)(0x0b + t * (0x1d - 0x0b));
        Uint8 b = (Uint8)(0x1e + t * (0x3d - 0x1e));
        SDL_SetRenderDrawColor(g_ren, r, g, b, 255);
        SDL_Rect band = { 0, y, SCREEN_W, 4 };
        SDL_RenderFillRect(g_ren, &band);
    }
    // 星（固定シードの疑似乱数で毎フレーム同じ配置）
    Uint32 s = 0x2c0ffee;
    for (int i = 0; i < 90; i++) {
        s = s * 1664525u + 1013904223u;
        int x = (int)(s >> 16) % SCREEN_W;
        s = s * 1664525u + 1013904223u;
        int y = (int)(s >> 16) % SCREEN_H;
        s = s * 1664525u + 1013904223u;
        Uint8 a = (Uint8)(90 + (s >> 24) / 2);
        SDL_SetRenderDrawColor(g_ren, 0xef, 0xea, 0xf8, a);
        SDL_RenderDrawPoint(g_ren, x, y);
        if ((s & 7) == 0) SDL_RenderDrawPoint(g_ren, x + 1, y);
    }
}

// ---------- 月アイコン ----------

void draw_moon_icon(int cx, int cy, int r, Moon m)
{
    SDL_Color moon_c = C_GOLD;
    switch (m) {
    case MOON_CRESCENT:
        fill_circle(cx, cy, r, moon_c, 255);
        fill_circle(cx - r * 2 / 5, cy, r, C_DARK, 255);
        break;
    case MOON_HALF:
        fill_circle(cx, cy, r, moon_c, 255);
        fill_rect(cx, cy - r, r + 1, r * 2 + 1, C_DARK, 255);
        break;
    case MOON_FULL:
        fill_circle(cx, cy, r, moon_c, 255);
        fill_circle(cx - r / 3, cy - r / 4, r / 5, COL(0xe3, 0xd1, 0x90), 220);
        fill_circle(cx + r / 4, cy + r / 4, r / 6, COL(0xe3, 0xd1, 0x90), 220);
        break;
    case MOON_NEW:
        fill_circle(cx, cy, r, COL(0x17, 0x14, 0x33), 255);
        fill_circle(cx, cy, r, C_BORDER, 0); // no-op(見た目調整用)
        for (int i = 0; i < 2; i++) {
            SDL_SetRenderDrawColor(g_ren, 0x8f, 0x86, 0xc4, 255);
            // 輪郭を2px
            for (int deg = 0; deg < 360; deg += 2) {
                double rad = deg * 3.14159265 / 180.0;
                SDL_RenderDrawPoint(g_ren,
                    cx + (int)((r - i) * SDL_cos(rad)),
                    cy + (int)((r - i) * SDL_sin(rad)));
            }
        }
        break;
    case MOON_ECLIPSE:
        fill_circle(cx, cy, r + 2, COL(0xc9, 0x4f, 0x6a), 255); // 赤いリング
        fill_circle(cx, cy, r, moon_c, 255);
        fill_circle(cx + r / 5, cy, r - r / 8, COL(0x1a, 0x10, 0x30), 255);
        break;
    default:
        break;
    }
}

// ---------- カード ----------

static const SDL_Color CARD_PLACEHOLDER[12] = {
    { 0x8d, 0x93, 0xa8, 255 }, { 0xe8, 0xd8, 0xb0, 255 }, { 0x3d, 0x3a, 0x4f, 255 },
    { 0x4f, 0x8f, 0x5f, 255 }, { 0xc9, 0x6a, 0x4f, 255 }, { 0xe8, 0xa1, 0x3c, 255 },
    { 0x3f, 0x4a, 0x6b, 255 }, { 0xd9, 0x4f, 0x4f, 255 }, { 0x6b, 0x72, 0x87, 255 },
    { 0x4f, 0x7d, 0x54, 255 }, { 0x4a, 0x6d, 0x9c, 255 }, { 0xff, 0xf3, 0xc4, 255 },
};

void draw_card_art(int x, int y, int w, int h, int id)
{
    if (id < 0 || id > 11) return;
    if (g_card_tex[id]) {
        SDL_Rect dst = { x, y, w, h };
        SDL_RenderCopy(g_ren, g_card_tex[id], NULL, &dst);
    } else {
        // プレースホルダ: カード色の円
        SDL_Color c = CARD_PLACEHOLDER[id];
        int r = (w < h ? w : h) / 2 - 2;
        fill_circle(x + w / 2, y + h / 2, r, c, 230);
    }
}

void draw_card(int x, int y, int w, int h, int id, unsigned flags)
{
    const CardInfo *ci = jsb_card(id);
    if (!ci) return;

    SDL_Color border = C_BORDER;
    Uint8 bg_alpha = 235;
    if (flags & CARD_SELECTED) border = C_GOLD;
    if (flags & CARD_WIN) border = C_GREEN;
    if (flags & CARD_LOSE) border = C_RED;

    fill_rect(x, y, w, h, C_PANEL, bg_alpha);
    draw_frame(x, y, w, h, border);
    if (flags & (CARD_SELECTED | CARD_WIN | CARD_LOSE))
        draw_frame(x - 1, y - 1, w + 2, h + 2, border);
    if (flags & CARD_CURSOR) {
        draw_frame(x - 3, y - 3, w + 6, h + 6, C_GOLD);
        draw_frame(x - 4, y - 4, w + 8, h + 8, C_GOLD);
    }

    // 絵（上部・正方形）
    int art = w - 14;
    int art_h = art > h - 52 ? h - 52 : art;
    draw_card_art(x + (w - art) / 2, y + 22, art, art_h, id);

    // パワー数字（左上）
    char pw[8];
    snprintf(pw, sizeof pw, "%d", id);
    int psize = w >= 110 ? 26 : 20;
    fill_circle(x + 16, y + 16, psize / 2 + 5, C_DARK, 220);
    draw_text(x + 16, y + 16 - psize / 2 - 2, psize, C_GOLD, ALIGN_CENTER, pw);

    // 名前
    int name_size = w >= 110 ? 18 : 14;
    draw_text(x + w / 2, y + h - (w >= 110 ? 46 : 22), name_size, C_TEXT, ALIGN_CENTER, ci->name);
    // 短文（大きいカードのみ）
    if (w >= 110)
        draw_text(x + w / 2, y + h - 24, 13, C_DIM, ALIGN_CENTER, ci->short_text);

    if (flags & CARD_DISABLED)
        fill_rect(x, y, w, h, C_DARK, 140);
}

// 相手が選択済みであることを示す裏向きカード（絵柄は伏せたまま）
void draw_card_back(int x, int y, int w, int h)
{
    fill_rect(x, y, w, h, C_PANEL, 235);
    draw_frame(x, y, w, h, C_GOLD);
    draw_frame(x - 1, y - 1, w + 2, h + 2, C_GOLD);
    draw_moon_icon(x + w / 2, y + h / 2 - 6, w / 5, MOON_FULL);
    draw_text(x + w / 2, y + h - 24, 14, C_DIM, ALIGN_CENTER, "選択済み");
}

// ---------- 初期化 ----------

bool render_init(SDL_Renderer *ren, const char *res_dir)
{
    g_ren = ren;
    if (TTF_Init() != 0) {
        fprintf(stderr, "[render] TTF_Init failed: %s\n", TTF_GetError());
        return false;
    }
    IMG_Init(IMG_INIT_PNG);

    // フォント: out/res/font/font.ttf → NextUI skeleton font1.ttf の順に探す
    const char *candidates[2];
    char c0[1024];
    snprintf(c0, sizeof c0, "%s/font/font.ttf", res_dir);
    candidates[0] = c0;
    candidates[1] = "/Users/yota/trimui-popui/NextUI/skeleton/SYSTEM/res/font1.ttf";
    g_font_path[0] = '\0';
    for (int i = 0; i < 2; i++) {
        FILE *f = fopen(candidates[i], "rb");
        if (f) {
            fclose(f);
            snprintf(g_font_path, sizeof g_font_path, "%s", candidates[i]);
            break;
        }
    }
    if (!g_font_path[0]) {
        fprintf(stderr, "[render] no font found\n");
        return false;
    }
    if (!font_for(20)) return false;

    // カードPNG（無ければプレースホルダ）
    for (int i = 0; i < 12; i++) {
        char path[1024];
        snprintf(path, sizeof path, "%s/cards/%02d.png", res_dir, i);
        SDL_Surface *s = IMG_Load(path);
        if (s) {
            g_card_tex[i] = SDL_CreateTextureFromSurface(g_ren, s);
            SDL_FreeSurface(s);
        }
    }
    return true;
}

void render_shutdown(void)
{
    for (int i = 0; i < g_cache_count; i++)
        if (g_cache[i].tex) SDL_DestroyTexture(g_cache[i].tex);
    g_cache_count = 0;
    for (int i = 0; i < 12; i++)
        if (g_card_tex[i]) { SDL_DestroyTexture(g_card_tex[i]); g_card_tex[i] = NULL; }
    for (int i = 0; i < g_font_count; i++)
        if (g_fonts[i]) TTF_CloseFont(g_fonts[i]);
    g_font_count = 0;
    TTF_Quit();
    IMG_Quit();
}
