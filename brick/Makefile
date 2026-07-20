# ツキフダ TRIMUI Brick 移植 Makefile
# ターゲット:
#   make native  — mac用ビルド (out/tsukifuda)
#   make assets  — tools/build_assets.sh があれば実行して out/res/ を生成
#   make tg5040  — aarch64 クロスビルド (out/tsukifuda.elf)。
#                  tg5040-toolchain コンテナ内でのみ実行可能。
#                  ホストから1コマンドで叩くには tools/build_cross.sh を使う。
#   make pak     — out/Tsukifuda.pak/ に成果物を集約
#   make zip     — out/Tsukifuda.pak.zip
#   make clean

# ---- 共通 ----
QJS_DIR := vendor/quickjs
QJS_SRCS := $(QJS_DIR)/quickjs.c $(QJS_DIR)/libregexp.c $(QJS_DIR)/libunicode.c $(QJS_DIR)/dtoa.c
APP_SRCS := src/main.c src/jsbridge.c src/render.c src/input.c src/audio.c src/save.c \
            src/screens/title.c src/screens/rules.c src/screens/story.c \
            src/screens/dialogue.c src/screens/timelimit.c src/screens/game.c

WARN := -Wall -Wextra
CSTD := -std=c99
OPT ?= -O2

# ---- native (mac) ----
CC_NATIVE ?= clang
SDL_CFLAGS := $(shell sdl2-config --cflags)
SDL_LIBS := $(shell sdl2-config --libs) -lSDL2_image -lSDL2_ttf

NOBJ_DIR := out/obj/native
NATIVE_OBJS := $(patsubst %.c,$(NOBJ_DIR)/%.o,$(APP_SRCS)) \
               $(patsubst $(QJS_DIR)/%.c,$(NOBJ_DIR)/qjs/%.o,$(QJS_SRCS))

.PHONY: native assets tg5040 _tg5040_toolchain_check pak zip clean cross

native: out/tsukifuda

out/tsukifuda: $(NATIVE_OBJS)
	$(CC_NATIVE) -o $@ $^ $(SDL_LIBS) -lm -lpthread

# アプリ側: C99 + 警告クリーン必須
$(NOBJ_DIR)/src/%.o: src/%.c
	@mkdir -p $(dir $@)
	$(CC_NATIVE) $(CSTD) $(WARN) -Werror $(OPT) $(SDL_CFLAGS) -I$(QJS_DIR) -Isrc -c -o $@ $<

# QuickJS 側: ベンダコードなので警告は黙認（-w）
$(NOBJ_DIR)/qjs/%.o: $(QJS_DIR)/%.c
	@mkdir -p $(dir $@)
	$(CC_NATIVE) $(OPT) -w -D_GNU_SOURCE -c -o $@ $<

# ---- assets ----
assets:
	@if [ -x tools/build_assets.sh ] || [ -f tools/build_assets.sh ]; then \
		sh tools/build_assets.sh; \
	else \
		echo "tools/build_assets.sh が無いためスキップ（アセット担当の成果物待ち）"; \
	fi

# ---- tg5040 クロス (ghcr.io/loveretro/tg5040-toolchain コンテナ内での実行を想定) ----
# aarch64-nextui-linux-gnu-gcc が PATH 上にある環境(= コンテナ内)でのみ動く。
# ヘッダ/ライブラリはコンテナ内で pkg-config が cross sysroot 向けに
# 設定済みなのでそれを使う(PKG_CONFIG_PATH 等はイメージ側で設定済み)。
# rpath はホスト側ビルドパスを焼き込まないよう明示的には付けない。
CROSS_CC ?= aarch64-nextui-linux-gnu-gcc
CROSS_SDL_CFLAGS ?= $(shell pkg-config --cflags sdl2 2>/dev/null)
CROSS_SDL_LIBDIR ?= $(shell pkg-config --variable=libdir sdl2 2>/dev/null)
CROSS_SDL_LIBS ?= -L$(CROSS_SDL_LIBDIR) -lSDL2 -lSDL2_image -lSDL2_ttf
XOBJ_DIR := out/obj/tg5040
CROSS_OBJS := $(patsubst %.c,$(XOBJ_DIR)/%.o,$(APP_SRCS)) \
              $(patsubst $(QJS_DIR)/%.c,$(XOBJ_DIR)/qjs/%.o,$(QJS_SRCS))

tg5040: _tg5040_toolchain_check out/tsukifuda.elf

_tg5040_toolchain_check:
	@command -v $(CROSS_CC) >/dev/null 2>&1 || { \
		echo "エラー: $(CROSS_CC) が見つかりません。tg5040-toolchain コンテナ内で実行してください(tools/build_cross.sh 参照)。"; \
		exit 1; \
	}

out/tsukifuda.elf: $(CROSS_OBJS)
	$(CROSS_CC) -o $@ $^ $(CROSS_SDL_LIBS) -lm -lpthread

$(XOBJ_DIR)/src/%.o: src/%.c
	@mkdir -p $(dir $@)
	$(CROSS_CC) $(CSTD) $(WARN) $(OPT) $(CROSS_SDL_CFLAGS) -I$(QJS_DIR) -Isrc -c -o $@ $<

$(XOBJ_DIR)/qjs/%.o: $(QJS_DIR)/%.c
	@mkdir -p $(dir $@)
	$(CROSS_CC) $(OPT) -w -D_GNU_SOURCE -c -o $@ $<

# ホストから1コマンドでクロスビルド一式(tg5040 + pak)をコンテナ内実行するショートカット。
# zip はコンテナにzipコマンドが無いためホスト側の `make zip` で行う。
cross:
	sh tools/build_cross.sh

# ---- pak / zip ----
pak: out/tsukifuda.elf
	rm -rf out/Tsukifuda.pak
	mkdir -p out/Tsukifuda.pak
	cp pak/launch.sh out/Tsukifuda.pak/
	cp out/tsukifuda.elf out/Tsukifuda.pak/
	chmod +x out/Tsukifuda.pak/launch.sh out/Tsukifuda.pak/tsukifuda.elf
	cp -R out/res out/Tsukifuda.pak/res
	cp -R pak/LICENSES out/Tsukifuda.pak/LICENSES
	cp $(QJS_DIR)/LICENSE out/Tsukifuda.pak/LICENSES/QuickJS-LICENSE.txt

zip: pak
	cd out && rm -f Tsukifuda.pak.zip && zip -r Tsukifuda.pak.zip Tsukifuda.pak

clean:
	rm -rf out/obj out/tsukifuda out/tsukifuda.elf out/Tsukifuda.pak out/Tsukifuda.pak.zip
