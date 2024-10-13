# Discord Hare Bot

ゲームルーム管理機能を持つDiscordボット。Discord.jsとTypeScriptで構築。

## 機能

- 🎮 **ゲームルーム管理**: 指定VCへの参加で自動的にルームを作成
- 🎯 **チーム分け**: `/team`コマンドでメンバーをチーム分け
- 🎲 **ランダム選択**: `/rand`コマンドでメンバーやゲームデータをランダム選択
- 📅 **イベント連携**: Discordのスケジュールイベントと連携
- 💾 **永続化**: SQLiteによるデータ保存でボット再起動後も復元

## 必要環境

- Node.js（LTS推奨）
- Discordボットトークン
- 適切な権限を持つDiscordサーバー

## インストール

1. リポジトリをクローン:
```bash
git clone https://github.com/secchanu/discord-hare-bot.git
cd discord-hare-bot
```

2. 依存関係をインストール:
```bash
npm install
```

3. 環境変数を設定:
```bash
cp .env.example .env
```

4. `.env`を編集:
```env
DISCORD_BOT_TOKEN=ボットトークン
DISCORD_READY_CHANNEL_ID=ルーム作成用VC ID
DISCORD_WANTED_CHANNEL_ID=ゲーム募集用チャンネル ID
DISCORD_IGNORE_ROLES=除外するロールID（例: 123456789:管理者,987654321:Bot）
```

## 使い方

### 開発環境
```bash
npm run dev
```

### 本番環境
```bash
npm run build
npm start
```

## コマンド

- `/room sync` - テキストチャンネルの権限を同期
- `/room vc [数]` - 追加VCを設定（最大25）
- `/room game [ロール]` - ルームのゲームを設定
- `/team [数]` - メンバーをチーム分け
- `/call [番号]` - 全メンバーを特定VCに移動
- `/rand member [数]` - メンバーをランダム選択
- `/rand data` - ゲームデータからランダム選択
- `/game data [ロール]` - ゲーム固有データを編集

## ライセンス

MIT