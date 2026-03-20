# 開発ガイド

## ソースからビルド

前提条件:
- [Rust](https://rustup.rs/) (1.77+)
- Xcode Command Line Tools (`xcode-select --install`)

```bash
# Tauri CLI をインストール（初回のみ）
cargo install tauri-cli --version "^2"

# 開発モードで起動
cargo tauri dev

# プロダクションビルド（DMG 生成）
cargo tauri build
```

## テスト

```bash
# 初回セットアップ
npm install
npx playwright install chromium

# テスト実行（VRT + UT 全100件）
npm test
```

## 技術スタック

- **Backend:** Rust + Tauri v2
- **Frontend:** Vanilla HTML/CSS/JS（ビルドツール不要）
- **永続化:** JSON ファイル（serde_json）
- **テスト:** Playwright（VRT + UT）
- **ID生成:** uuid v4

## リリース手順

```bash
# バージョンを指定してリリース（clippy → テスト → ビルド → GitHub Release 作成）
./scripts/release.sh 0.2.0

# バージョン省略時は tauri.conf.json の現在のバージョンを使用
./scripts/release.sh
```

## アイコンについて

プロダクションビルドの際は正式な `.icns` ファイルが必要:

```bash
cargo tauri icon path/to/your-icon.png
```
