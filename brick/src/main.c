// main.c — SDL初期化・60fpsメインループ・画面ディスパッチ
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#include <SDL.h>
#include <libgen.h>
#ifdef __APPLE__
#include <mach-o/dyld.h>
#endif

#include "app.h"
#include "jsbridge.h"
#include "render.h"
#include "input.h"
#include "audio.h"
#include "save.h"

static void exe_dir(char *buf, size_t cap, const char *argv0)
{
    char raw[1024] = {0};
#ifdef __APPLE__
    uint32_t sz = sizeof raw;
    if (_NSGetExecutablePath(raw, &sz) != 0)
        snprintf(raw, sizeof raw, "%s", argv0);
#else
    ssize_t n = readlink("/proc/self/exe", raw, sizeof raw - 1);
    if (n <= 0) snprintf(raw, sizeof raw, "%s", argv0);
    else raw[n] = '\0';
#endif
    char tmp[1024];
    snprintf(tmp, sizeof tmp, "%s", raw);
    snprintf(buf, cap, "%s", dirname(tmp));
}

void app_set_screen(App *a, ScreenId s) { a->screen = s; }

void app_screenshot(App *a, const char *name)
{
    if (!a->shot_dir[0]) return;
    SDL_Surface *surf = SDL_CreateRGBSurfaceWithFormat(0, SCREEN_W, SCREEN_H, 32,
                                                       SDL_PIXELFORMAT_ARGB8888);
    if (!surf) return;
    // 論理サイズ描画をそのまま読む（レンダーターゲットは既定）
    if (SDL_RenderReadPixels(a->ren, NULL, SDL_PIXELFORMAT_ARGB8888,
                             surf->pixels, surf->pitch) == 0) {
        char path[1024];
        snprintf(path, sizeof path, "%s/%02d_%s.bmp", a->shot_dir, a->shot_seq++, name);
        SDL_SaveBMP(surf, path);
        printf("[shot] %s\n", path);
    }
    SDL_FreeSurface(surf);
}

int main(int argc, char **argv)
{
    (void)argc;
    srand((unsigned)time(NULL));

    App app;
    memset(&app, 0, sizeof app);
    app.running = true;
    app.screen = SCR_TITLE;
    app.rules_return = SCR_TITLE;

    const char *ap = getenv("TSUKIFUDA_AUTOPLAY");
    if (ap && ap[0]) {
        if (strcmp(ap, "story") == 0) app.autoplay = 2;
        else if (strcmp(ap, "0") != 0) app.autoplay = 1;
    }
    const char *shots = getenv("TSUKIFUDA_SHOTDIR");
    if (shots) snprintf(app.shot_dir, sizeof app.shot_dir, "%s", shots);

    char dir[1024];
    exe_dir(dir, sizeof dir, argv[0]);
    char res_dir[1100];
    snprintf(res_dir, sizeof res_dir, "%s/res", dir);

    if (SDL_Init(SDL_INIT_VIDEO | SDL_INIT_TIMER) != 0) {
        fprintf(stderr, "SDL_Init failed: %s\n", SDL_GetError());
        return 1;
    }

    Uint32 wflags = 0;
#ifndef __APPLE__
    wflags |= SDL_WINDOW_FULLSCREEN;
#endif
    app.win = SDL_CreateWindow("ツキフダ", SDL_WINDOWPOS_CENTERED, SDL_WINDOWPOS_CENTERED,
                               SCREEN_W, SCREEN_H, wflags);
    if (!app.win) {
        fprintf(stderr, "SDL_CreateWindow failed: %s\n", SDL_GetError());
        return 1;
    }
    app.ren = SDL_CreateRenderer(app.win, -1,
                                 SDL_RENDERER_ACCELERATED | SDL_RENDERER_PRESENTVSYNC);
    if (!app.ren)
        app.ren = SDL_CreateRenderer(app.win, -1, SDL_RENDERER_SOFTWARE);
    if (!app.ren) {
        fprintf(stderr, "SDL_CreateRenderer failed: %s\n", SDL_GetError());
        return 1;
    }
    SDL_RenderSetLogicalSize(app.ren, SCREEN_W, SCREEN_H);

    // ゲームロジック(JS)
    char game_js[1100];
    snprintf(game_js, sizeof game_js, "%s/game.js", res_dir);
    if (!jsb_init(game_js)) {
        fprintf(stderr, "failed to init game logic (%s)\n", game_js);
        return 1;
    }

    if (!render_init(app.ren, res_dir)) return 1;
    save_init(dir);
    input_init();
    audio_init(res_dir);
    audio_set_muted(save_data()->muted);
    audio_set_bgm(save_data()->bgm);

    title_enter(&app);

    // 60fps ループ（vsyncが効かない環境では自前でスリープ）
    while (app.running) {
        Uint32 frame_start = SDL_GetTicks();
        app.now = frame_start;

        if (!input_poll(app.now)) break;

        SDL_SetRenderDrawColor(app.ren, 0, 0, 0, 255);
        SDL_RenderClear(app.ren);

        switch (app.screen) {
        case SCR_TITLE: title_frame(&app); break;
        case SCR_RULES: rules_frame(&app); break;
        case SCR_STORY: story_frame(&app); break;
        case SCR_DIALOGUE: dialogue_frame(&app); break;
        case SCR_TIMELIMIT: timelimit_frame(&app); break;
        case SCR_GAME: game_frame(&app); break;
        }

        SDL_RenderPresent(app.ren);

        Uint32 elapsed = SDL_GetTicks() - frame_start;
        Uint32 target = app.autoplay ? 2 : 16;
        if (elapsed < target) SDL_Delay(target - elapsed);
    }

    audio_shutdown();
    input_shutdown();
    render_shutdown();
    jsb_shutdown();
    SDL_DestroyRenderer(app.ren);
    SDL_DestroyWindow(app.win);
    SDL_Quit();
    return 0;
}
