#!/bin/sh
# ホストから1コマンドで tg5040 (aarch64) 向けクロスビルドを実行するショートカット。
#
#   sh tools/build_cross.sh
#
# ghcr.io/loveretro/tg5040-toolchain コンテナ内で `make tg5040 && make pak` を
# 非対話実行し(コンテナ内には zip コマンドが無いため)、戻ってきたホスト側で
# `make zip` を実行して out/Tsukifuda.pak.zip まで作る。
#
# 参考: /Users/yota/trimui-popui/NextUI/makefile.toolchain の
# `podman run --rm -v $(HOST_WORKSPACE):$(GUEST_WORKSPACE) $(IMAGE_NAME) /bin/bash -c '...'`
# と同じ非対話呼び出し方式。

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"      # .../tsukifuda/brick/tools
BRICK_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"        # .../tsukifuda/brick
REPO_ROOT="$(cd "$BRICK_DIR/.." && pwd)"         # .../tsukifuda (../js を含む)

IMAGE=ghcr.io/loveretro/tg5040-toolchain
RUNTIME=$(command -v podman || command -v docker || true)

if [ -z "$RUNTIME" ]; then
  echo "エラー: podman も docker も見つかりません。" >&2
  exit 1
fi

echo "== [1/2] コンテナ内でクロスビルド + pak 集約 (podman run) =="
"$RUNTIME" run --rm \
  -v "$REPO_ROOT":/work \
  -w /work/brick \
  "$IMAGE" \
  /bin/bash -c 'make tg5040 && make pak'

echo "== [2/2] ホスト側で zip 化 =="
make -C "$BRICK_DIR" zip

echo "完了: $BRICK_DIR/out/Tsukifuda.pak.zip"
