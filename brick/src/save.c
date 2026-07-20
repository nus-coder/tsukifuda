// save.c — JSON保存。$USERDATA_PATH/Tsukifuda/save.json、無ければ ./userdata/save.json。
// 書き込みはテンポラリ→rename のアトミック方式。
#include "save.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <errno.h>

static char g_path[1024];
static SaveData g_data;

const int TIME_LIMIT_OPTIONS[TIME_LIMIT_N] = { 10, 20, 40, 0 };

static void mkdir_p(const char *dir)
{
    if (mkdir(dir, 0755) != 0 && errno != EEXIST)
        fprintf(stderr, "[save] mkdir %s failed: %s\n", dir, strerror(errno));
}

// ごく小さな専用パーサ: "key" の後の : に続く値(int/bool)を拾う
static bool scan_int(const char *json, const char *key, int *out)
{
    char pat[64];
    snprintf(pat, sizeof pat, "\"%s\"", key);
    const char *p = strstr(json, pat);
    if (!p) return false;
    p = strchr(p + strlen(pat), ':');
    if (!p) return false;
    p++;
    while (*p == ' ' || *p == '\t') p++;
    if (strncmp(p, "true", 4) == 0) { *out = 1; return true; }
    if (strncmp(p, "false", 5) == 0) { *out = 0; return true; }
    return sscanf(p, "%d", out) == 1;
}

// stats のネスト: 対象レベルのオブジェクト部分文字列を切り出してから読む
static void scan_stats(const char *json, const char *level, Stats *out)
{
    char pat[32];
    snprintf(pat, sizeof pat, "\"%s\"", level);
    const char *p = strstr(json, pat);
    if (!p) return;
    const char *open = strchr(p, '{');
    if (!open) return;
    const char *close = strchr(open, '}');
    if (!close) return;
    char buf[256];
    size_t n = (size_t)(close - open);
    if (n >= sizeof buf) n = sizeof buf - 1;
    memcpy(buf, open, n);
    buf[n] = '\0';
    scan_int(buf, "w", &out->w);
    scan_int(buf, "l", &out->l);
    scan_int(buf, "d", &out->d);
}

static void load(void)
{
    memset(&g_data, 0, sizeof g_data);
    g_data.bgm = true; // 既定ON（web版と同じ）
    g_data.time_limit = 20; // 既定20秒（web版と同じ）

    FILE *f = fopen(g_path, "rb");
    if (!f) return;
    char buf[4096];
    size_t n = fread(buf, 1, sizeof buf - 1, f);
    fclose(f);
    buf[n] = '\0';

    int v;
    if (scan_int(buf, "story", &v)) g_data.story = v;
    if (scan_int(buf, "muted", &v)) g_data.muted = v != 0;
    if (scan_int(buf, "bgm", &v)) g_data.bgm = v != 0;
    if (scan_int(buf, "timeLimit", &v) && (v == 0 || v == 10 || v == 20 || v == 40)) g_data.time_limit = v;
    scan_stats(buf, "novice", &g_data.novice);
    scan_stats(buf, "hard", &g_data.hard);
    if (g_data.story < 0) g_data.story = 0;
    if (g_data.story > 5) g_data.story = 5;
}

void save_init(const char *exe_dir)
{
    const char *userdata = getenv("USERDATA_PATH");
    char dir[900];
    if (userdata && userdata[0]) {
        snprintf(dir, sizeof dir, "%s/Tsukifuda", userdata);
    } else {
        snprintf(dir, sizeof dir, "%s/userdata", exe_dir);
    }
    mkdir_p(dir);
    snprintf(g_path, sizeof g_path, "%s/save.json", dir);
    load();
}

SaveData *save_data(void) { return &g_data; }

void save_commit(void)
{
    char tmp[1100];
    snprintf(tmp, sizeof tmp, "%s.tmp", g_path);
    FILE *f = fopen(tmp, "wb");
    if (!f) {
        fprintf(stderr, "[save] cannot write %s\n", tmp);
        return;
    }
    fprintf(f,
        "{\"story\":%d,"
        "\"stats\":{"
        "\"novice\":{\"w\":%d,\"l\":%d,\"d\":%d},"
        "\"hard\":{\"w\":%d,\"l\":%d,\"d\":%d}},"
        "\"muted\":%s,\"bgm\":%s,\"timeLimit\":%d}\n",
        g_data.story,
        g_data.novice.w, g_data.novice.l, g_data.novice.d,
        g_data.hard.w, g_data.hard.l, g_data.hard.d,
        g_data.muted ? "true" : "false",
        g_data.bgm ? "true" : "false",
        g_data.time_limit);
    fclose(f);
    if (rename(tmp, g_path) != 0)
        fprintf(stderr, "[save] rename failed: %s\n", strerror(errno));
}
