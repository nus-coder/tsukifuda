// save.h — 進行/戦績/設定の保存
#ifndef TSUKIFUDA_SAVE_H
#define TSUKIFUDA_SAVE_H

#include <stdbool.h>

typedef struct { int w, l, d; } Stats;

typedef struct {
    int story;        // クリア済みボス数 (0..5)
    Stats novice;
    Stats hard;
    bool muted;       // 効果音OFF
    bool bgm;         // BGM ON
} SaveData;

// exe_dir: 実行ファイルのあるディレクトリ（$USERDATA_PATH が無いときのfallback用）
void save_init(const char *exe_dir);
SaveData *save_data(void);   // 読み書き自由。変更後は save_commit()
void save_commit(void);      // アトミック書き込み

#endif
