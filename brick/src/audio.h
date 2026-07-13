// audio.h — WAVロード + 自前加算ミキサー（SDL2_mixer不使用）
#ifndef TSUKIFUDA_AUDIO_H
#define TSUKIFUDA_AUDIO_H

#include <stdbool.h>

bool audio_init(const char *res_dir);   // res_dir/sfx/*.wav, res_dir/bgm/loop.wav
void audio_shutdown(void);

void audio_play(const char *name);              // 例: "win" "tension_riser"
void audio_play_delayed(const char *name, int delay_ms);

void audio_set_muted(bool muted);               // 効果音ミュート
void audio_set_bgm(bool on);                    // BGM ON/OFF
bool audio_muted(void);
bool audio_bgm_on(void);

#endif
