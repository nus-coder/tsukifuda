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
    int time_limit;   // カード選択の制限時間(秒)。0=なし。既定20
} SaveData;

// exe_dir: 実行ファイルのあるディレクトリ（$USERDATA_PATH が無いときのfallback用）
void save_init(const char *exe_dir);
SaveData *save_data(void);   // 読み書き自由。変更後は save_commit()
void save_commit(void);      // アトミック書き込み

// 制限時間の選択肢（秒）。0=なし。title/pause 両画面のサイクル切替で共有
extern const int TIME_LIMIT_OPTIONS[];
#define TIME_LIMIT_N 4

#endif
