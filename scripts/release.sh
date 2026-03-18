#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TAURI_CONF="$PROJECT_ROOT/src-tauri/tauri.conf.json"

# バージョン決定: 引数があればそれを使い、なければ tauri.conf.json から取得
if [[ $# -ge 1 ]]; then
  VERSION="$1"
else
  VERSION="$(jq -r '.version' "$TAURI_CONF")"
  echo "==> tauri.conf.json のバージョンを使用: $VERSION"
fi

# semver バリデーション
if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "ERROR: 不正なバージョン形式: $VERSION (x.y.z 形式で指定してください)" >&2
  exit 1
fi

TAG="v${VERSION}"
DMG_DIR="$PROJECT_ROOT/src-tauri/target/release/bundle/dmg"

# 既存タグチェック
if gh release view "$TAG" &>/dev/null; then
  echo "ERROR: ${TAG} は既に存在します" >&2
  exit 1
fi

echo "==> Running clippy..."
cargo clippy --manifest-path "$PROJECT_ROOT/src-tauri/Cargo.toml" -- -D warnings
echo "    clippy OK"

echo "==> Running tests..."
npm test --prefix "$PROJECT_ROOT"
echo "    tests OK"

echo "==> Building production release..."
cargo tauri build
echo "    build OK"

# DMG を1つだけ取得
dmg_files=("$DMG_DIR"/*.dmg)
if [[ ${#dmg_files[@]} -eq 0 || ! -f "${dmg_files[0]}" ]]; then
  echo "ERROR: DMG が見つかりません: $DMG_DIR" >&2
  exit 1
fi
if [[ ${#dmg_files[@]} -ne 1 ]]; then
  echo "ERROR: DMG が複数あります。不要なファイルを削除してください:" >&2
  printf '  %s\n' "${dmg_files[@]}" >&2
  exit 1
fi
DMG_FILE="${dmg_files[0]}"
echo "==> DMG: $DMG_FILE"

echo "==> Creating GitHub Release ${TAG}..."
gh release create "$TAG" "$DMG_FILE" --title "$TAG" --generate-notes

RELEASE_URL="$(gh release view "$TAG" --json url --jq '.url')"
echo ""
echo "==> リリース完了!"
echo "    $RELEASE_URL"
