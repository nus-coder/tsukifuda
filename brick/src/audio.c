// audio.c — 22050Hz mono float32 の加算ミキサー。SFX 8ch + BGMループ1ch。
// アセット未生成の場合は黙って無音で動く（audio_play は no-op になる）。
#include "audio.h"

#include <SDL.h>
#include <stdio.h>
#include <string.h>

#define MIX_RATE 22050
#define SFX_CHANNELS 8
#define SFX_MAX 24

typedef struct {
    char name[32];
    float *samples;
    int len; // フレーム数
} Sample;

typedef struct {
    const Sample *smp;
    int pos;
    int delay;   // 再生開始までの残りフレーム数
    bool active;
} Channel;

static SDL_AudioDeviceID g_dev;
static Sample g_sfx[SFX_MAX];
static int g_sfx_count;
static Sample g_bgm;
static Channel g_ch[SFX_CHANNELS];
static int g_bgm_pos;
static bool g_muted;
static bool g_bgm_on = true;
static bool g_ready;

static void callback(void *ud, Uint8 *stream, int len)
{
    (void)ud;
    float *out = (float *)stream;
    int frames = len / (int)sizeof(float);
    memset(stream, 0, (size_t)len);

    if (g_bgm_on && g_bgm.samples && g_bgm.len > 0) {
        for (int i = 0; i < frames; i++) {
            out[i] += g_bgm.samples[g_bgm_pos] * 0.9f;
            g_bgm_pos = (g_bgm_pos + 1) % g_bgm.len;
        }
    }
    if (!g_muted) {
        for (int c = 0; c < SFX_CHANNELS; c++) {
            Channel *ch = &g_ch[c];
            if (!ch->active) continue;
            for (int i = 0; i < frames; i++) {
                if (ch->delay > 0) { ch->delay--; continue; }
                if (ch->pos >= ch->smp->len) { ch->active = false; break; }
                out[i] += ch->smp->samples[ch->pos++];
            }
        }
    }
    // 軽いクリップ防止
    for (int i = 0; i < frames; i++) {
        if (out[i] > 1.0f) out[i] = 1.0f;
        else if (out[i] < -1.0f) out[i] = -1.0f;
    }
}

// WAV → 22050Hz mono float32 へ変換してロード
static bool load_wav(const char *path, Sample *out)
{
    SDL_AudioSpec spec;
    Uint8 *buf;
    Uint32 len;
    if (!SDL_LoadWAV(path, &spec, &buf, &len)) return false;

    SDL_AudioCVT cvt;
    int rc = SDL_BuildAudioCVT(&cvt, spec.format, spec.channels, spec.freq,
                               AUDIO_F32SYS, 1, MIX_RATE);
    if (rc < 0) { SDL_FreeWAV(buf); return false; }
    if (rc == 0) {
        out->samples = SDL_malloc(len);
        memcpy(out->samples, buf, len);
        out->len = (int)(len / sizeof(float));
        SDL_FreeWAV(buf);
        return true;
    }
    cvt.len = (int)len;
    cvt.buf = SDL_malloc((size_t)cvt.len * (size_t)cvt.len_mult);
    memcpy(cvt.buf, buf, len);
    SDL_FreeWAV(buf);
    if (SDL_ConvertAudio(&cvt) != 0) { SDL_free(cvt.buf); return false; }
    out->samples = (float *)cvt.buf;
    out->len = cvt.len_cvt / (int)sizeof(float);
    return true;
}

static const char *SFX_NAMES[] = {
    "click", "select", "flip", "win", "lose", "draw", "pot", "coin",
    "eclipse", "howl", "fox", "lantern", "steal", "start", "emote",
    "tension_riser", "tension_hit", "tensionBig_riser", "tensionBig_hit",
};

bool audio_init(const char *res_dir)
{
    if (SDL_InitSubSystem(SDL_INIT_AUDIO) != 0) {
        fprintf(stderr, "[audio] init failed: %s\n", SDL_GetError());
        return false;
    }
    SDL_AudioSpec want = {0}, have;
    want.freq = MIX_RATE;
    want.format = AUDIO_F32SYS;
    want.channels = 1;
    want.samples = 1024;
    want.callback = callback;
    g_dev = SDL_OpenAudioDevice(NULL, 0, &want, &have, 0);
    if (!g_dev) {
        fprintf(stderr, "[audio] open device failed: %s\n", SDL_GetError());
        return false; // 音無しで続行可能
    }

    char path[1024];
    for (size_t i = 0; i < sizeof SFX_NAMES / sizeof SFX_NAMES[0]; i++) {
        if (g_sfx_count >= SFX_MAX) break;
        snprintf(path, sizeof path, "%s/sfx/%s.wav", res_dir, SFX_NAMES[i]);
        Sample *s = &g_sfx[g_sfx_count];
        if (load_wav(path, s)) {
            snprintf(s->name, sizeof s->name, "%s", SFX_NAMES[i]);
            g_sfx_count++;
        }
    }
    snprintf(path, sizeof path, "%s/bgm/loop.wav", res_dir);
    load_wav(path, &g_bgm);

    g_ready = true;
    SDL_PauseAudioDevice(g_dev, 0);
    return true;
}

void audio_shutdown(void)
{
    if (g_dev) { SDL_CloseAudioDevice(g_dev); g_dev = 0; }
    for (int i = 0; i < g_sfx_count; i++) SDL_free(g_sfx[i].samples);
    g_sfx_count = 0;
    if (g_bgm.samples) { SDL_free(g_bgm.samples); g_bgm.samples = NULL; }
}

static const Sample *find(const char *name)
{
    for (int i = 0; i < g_sfx_count; i++)
        if (strcmp(g_sfx[i].name, name) == 0) return &g_sfx[i];
    return NULL;
}

void audio_play_delayed(const char *name, int delay_ms)
{
    if (!g_ready || g_muted) return;
    const Sample *s = find(name);
    if (!s) return;
    SDL_LockAudioDevice(g_dev);
    // 空きch、無ければ最も進んでいるchを奪う
    int slot = -1, best = -1, best_pos = -1;
    for (int c = 0; c < SFX_CHANNELS; c++) {
        if (!g_ch[c].active) { slot = c; break; }
        if (g_ch[c].pos > best_pos) { best_pos = g_ch[c].pos; best = c; }
    }
    if (slot < 0) slot = best;
    g_ch[slot].smp = s;
    g_ch[slot].pos = 0;
    g_ch[slot].delay = delay_ms * MIX_RATE / 1000;
    g_ch[slot].active = true;
    SDL_UnlockAudioDevice(g_dev);
}

void audio_play(const char *name) { audio_play_delayed(name, 0); }

void audio_set_muted(bool muted)
{
    g_muted = muted;
    if (g_ready && muted) {
        SDL_LockAudioDevice(g_dev);
        for (int c = 0; c < SFX_CHANNELS; c++) g_ch[c].active = false;
        SDL_UnlockAudioDevice(g_dev);
    }
}

void audio_set_bgm(bool on)
{
    if (g_ready) SDL_LockAudioDevice(g_dev);
    g_bgm_on = on;
    if (on) g_bgm_pos = 0;
    if (g_ready) SDL_UnlockAudioDevice(g_dev);
}

bool audio_muted(void) { return g_muted; }
bool audio_bgm_on(void) { return g_bgm_on; }
