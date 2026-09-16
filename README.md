<p align="center">
  <img src="assets/logo.png" alt="tsukumo" width="200"/>
</p>

<h1 align="center">tsukumo</h1>

<p align="center">
  付喪神が道具に宿るように、ターミナルでの仕事にキャラクターを宿らせます。<br>
  Agent SDK で Claude Code を動かし、セリフは吹き出しへ、技術的な詳細はレポートへ分けて表示します。
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Bun-1.3-000000?logo=bun" alt="Bun">
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/Claude_Agent_SDK-0.3-D97757?logo=anthropic" alt="Claude Agent SDK">
  <img src="https://img.shields.io/badge/Lint-oxlint-cc9c00" alt="oxlint">
  <img src="https://img.shields.io/badge/Tested_with-bun%3Atest-000000?logo=bun" alt="bun:test">
</p>

---

ターミナルでの作業は、無機質なテキストの塊との対話になりがちです。
**tsukumo** は Claude Code を **Agent SDK（`@anthropic-ai/claude-agent-sdk`）で子プロセスとして
起こし**、会話・ツール実行・許可プロンプト・質問を構造化イベントで受け取って、
**立ち絵と吹き出しのある1枚の HTML** に組み立てます。**Claude Code の TUI は開きません。**

立ち絵・吹き出し・セリフと詳細の分離・画面レイアウトは、すべて
**「キャラクターと一緒に楽しく仕事をする」ための手段**であって目的ではありません。
やること・**やらないこと**の正典は [`docs/requirements.md`](./docs/requirements.md) です。

## 目次

- [Features](#features)
- [Quick Start](#quick-start)
- [仕組み](#仕組み)
  - [データの流れ](#データの流れ)
- [画面レイアウト](#画面レイアウト)
- [使い方](#使い方)
  - [入力欄から依頼を送る](#入力欄から依頼を送る)
  - [許可プロンプトと質問に答える](#許可プロンプトと質問に答える)
- [設定](#設定)
  - [環境変数](#環境変数)
  - [キャラクターを差し替える](#キャラクターを差し替える)
- [会話内容の扱い](#会話内容の扱い)
- [開発](#開発)
  - [プロジェクト構成](#プロジェクト構成)
  - [ドキュメント](#ドキュメント)

## Features

- **1コマンドで完成する** — `tsukumo` と打つだけで、セッションの起動・ビューの配信・タブの
  自動オープンまで進む。手で並べるものはブラウザタブ1つだけ
- **どのプロジェクトでも動く** — カレントディレクトリを作業対象にする（`claude` を打つのと同じ感覚）
- **セリフと詳細を分ける** — セリフは MCP ツール `speak(text, expression)` で受け取って
  キャラビューの吹き出しへ、ターンの本文はレポートとしてメインビューへ
- **レポートはリアルタイムに整形される** — Markdown・コードの色付け・表・`mermaid` の図・
  `chart` のグラフに対応し、更新は Server-Sent Events でブラウザへ押す
- **入力もページの中で行う** — 右下の入力欄から依頼を送り、実行中は同じボタンが「中断」に変わる
- **`/` でスラッシュコマンドを補完** — 前方一致を先に、続けて部分一致。Tab で確定・Enter で実行
- **許可プロンプトと質問をボタンで答える** — 「このコマンドを実行していいか」も
  `AskUserQuestion` の選択肢も入力欄の上に出て、押した答えが `canUseTool` の戻り値として返る
- **表情と衣装が状態に連動する** — 表情は `speak` の引数＋ツール実行中の自動切り替え、
  衣装は実行中のモデル（`haiku` = 軽装 / `sonnet` = 通常装備 / `opus` = 戦闘配置）
- **キャラクターの素材を差し替えられる** — 立ち絵・表情・差し色はすべて定義ファイル側。
  コードにキャラクターの中身を書かない
- **画面からキャラクターを切り替えられる** — サイドバーの `<select>` から選ぶと、
  そのキャラクターのセッションに起こし直す（切り替えた相手は次回以降も覚えている）
- **hook の登録が要らない** — 表情・衣装・作業の進行はすべて SDK のイベントから決まるので、
  `~/.claude/settings.json` に足すものは何も無い
- **外部通信ゼロで表示する** — ビューは `127.0.0.1` にだけバインドし、外部ライブラリは
  `vendor/` に同梱して自前で配る

## Quick Start

**前提条件**

- Bun 1.3 以上（TypeScript をそのまま実行し、テストランナーも内蔵している）
- Claude Code が使える状態になっていること（Agent SDK が `claude` を子プロセスとして起こす）
- 画面を出す箱として `orca` コマンドが使えること
  （無くてもタブが自動で開かないだけで、配信は続く）

```bash
# 1. インストール
git clone https://github.com/sinnlosses/tsukumo.git
cd tsukumo
bun install

# 2. tsukumo コマンドをグローバルに入れる（~/.bun/bin/tsukumo がこのリポジトリを指す）
bun link

# 3. コマンドが通っているか確かめる
which tsukumo   # ~/.bun/bin/tsukumo が出れば通っている

# 4. 好きなプロジェクトのディレクトリで起動する（characters/ も develop/ も無いディレクトリでよい）
cd ~/path/to/your-project
tsukumo
```

`which tsukumo` が何も出さないときは `command not found` になります。`~/.bun/bin` が `PATH` に
通っていないのが原因なので、シェルの設定（`.zshrc` / `.bashrc` など）に追加してください
（Bun 自体の導入手順は [Bun 公式](https://bun.com/docs/installation) を参照）:

```bash
export PATH="$HOME/.bun/bin:$PATH"
```

`bun link` を消すときは、**このリポジトリの直下で** `bun unlink` を実行します。

リポジトリ直下で開発しながら動かす場合は `bun run start` が `tsukumo` と同じ意味になります。
`bun run dev` は `start` と同じものを起こしつつ `src/ui/` を見張り、保存のたびに組み立て直して
開いているタブへ反映します（`src/core/` と `src/protocol/` を直したときは上げ直しが要ります）。

## 仕組み

tsukumo は**1つのプロセス**で、Agent SDK で Claude Code を子プロセスとして起こし、
受け取ったイベントを HTML のビューに変えて、ローカルの HTTP サーバから箱（Orca のタブ）の中の
ブラウザへ配ります。

```
┌────────────────────────────────────────────────┐
│ ブラウザ（Orca のタブ）                        │
│   メインビュー：レポート                       │
│   キャラビュー：立ち絵＋セリフ                 │
│   サイドバー：進行・タスク一覧・セッション情報 │
│   入力欄：依頼・送信・中断・回答・答え待ちの箱 │
└────────────────────────────────────────────────┘
      ▲                       │
      │ SSE で押す            ▼ POST（依頼・回答・中断）
┌────────────────────────────────────────────────┐
│ tsukumo（Bun の1プロセス）                     │
│   ビューサーバ 127.0.0.1:7327                  │
│   セッション駆動（SDK の query）               │
│   speak ツール（プロセス内の MCP サーバ）      │
└────────────────────────────────────────────────┘
      │ 起動・追加入力・中断  ▲
      ▼                       │ イベント（本文 / ツール / canUseTool）
┌────────────────────────────────────────────────┐
│ Claude Code（SDK が起こす子プロセス）          │
└────────────────────────────────────────────────┘
```

### データの流れ

| #   | 流れ                           | 中身                                                                                                                                                                           |
| --- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | 入力欄 → `query`               | 入力欄に打った依頼を POST で受け、ストリーミング入力モードの `query` へ追加入力として流す。中断も同じ経路                                                                      |
| 2   | イベント → 各ビュー            | `assistant` のテキストは**レポート**（メインビュー）、`speak` の引数は**セリフと表情**（キャラビュー）、`tool_use` / `tool_result` は**進行**（サイドバー）。更新は SSE で押す |
| 3   | `canUseTool` → 答え待ち → 回答 | 許可プロンプトと `AskUserQuestion` はどちらも `canUseTool` に届く。入力欄の上にボタンを出し、押された結果を戻り値として SDK へ返す                                             |

> **なぜ TUI を使わないのか**: Claude Code の TUI には割り込めないため、パイプ・hook の stdout・
> 本体へのパッチのいずれも描画の経路にできません。だから TUI を捨て、SDK で動かす側に回りました
> （採らなかった案も含め、経緯は [`docs/architecture.md`](./docs/architecture.md) が正典）。

## 画面レイアウト

**4つの領域（メインビュー・サイドバー・キャラビュー・入力欄）の配置と比率はページ側の CSS が
組みます。** 仕切りはドラッグで動かせます。`orca terminal split` のようなペイン分割の道具は
使いません。

**経緯**: 当初はこの3領域も別々のビューとして開き、`orca terminal split` でペインの形に
組み立てるつもりでした。実機で試したところ、Orca の `tab` 系コマンドにはブラウザタブをペインの
グリッドへ配置する手段が無く（`create` / `close` / `list` / `switch` / `show` / `profile` のみ）、
成立しないと分かったため、3領域を1枚の HTML にまとめる形へ変えました。

プロセスは動かしたままタブだけ閉じてしまったときは、開き直す道具があります。

```bash
bun run scripts/open-views.ts http://127.0.0.1:7327
```

## 使い方

### 入力欄から依頼を送る

右下の領域に依頼を書いて Enter を押すと、そのままセッションへ渡ります。実行中は同じボタンが
「中断」に変わります。

- **`/` を打つとコマンドの補完**が入力欄の上に重なって出ます。前方一致を先に、続けて部分一致を
  並べ、Tab で確定・Enter で実行・クリックでも確定できます
- **同じディレクトリ・同じキャラクターの前回のセッションがあれば、自動で続きから始まります**
  （サイドバーにその印が出ます）。新規に始め直したいときは `TSUKUMO_NEW_SESSION=1` を付けて
  起動します

### 許可プロンプトと質問に答える

「このコマンドを実行していいか」も `AskUserQuestion` の選択肢も、入力欄の上にボタンとして出ます。
許可モード（毎回聞く／編集は自動／全部許す／プラン）はサイドバーから切り替えられます。

キャラクターは吹き出しで一言聞くだけで、選択肢そのものは別の箱に出ます
（セリフと詳細を分ける方針の一部です）。

## 設定

### 環境変数

| 変数名                | 必須 | デフォルト                         | 説明                                                                                                                                                 |
| --------------------- | :--: | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TSUKUMO_VIEW_PORT`   |      | `7327`                             | ビューを配るポート。**既定のまま塞がっていたら20個先まで順にずらす**（明示的に指定したときはずらさずそのまま失敗する）。`0` を渡すと空きポートを使う |
| `TSUKUMO_CHARACTER`   |      | 同梱の `characters/tsukumo-spirit` | キャラクター定義ディレクトリ。相対パスは cwd 相対、絶対パスはそのまま                                                                                |
| `TSUKUMO_OPEN_VIEW`   |      | 開く                               | 起動時にレイアウトページのタブを自動で開くか。`0` を渡すと開かない                                                                                   |
| `TSUKUMO_DRIVER`      |      | `sdk`                              | セッションの駆動。`fake` を渡すと本物の `claude` を起こさず、台本どおりにイベントを流す（目視確認・自動テスト用）                                    |
| `TSUKUMO_NEW_SESSION` |      | 復元する                           | `1` を渡すと前回の続きから復元せず、新規にセッションを起こす                                                                                         |
| `TSUKUMO_WATCH_UI`    |      | 見張らない                         | `1` を渡すと `src/ui/` を見張り、保存のたびに組み立て直す（`bun run dev` が設定する）                                                                |

### キャラクターを差し替える

既定のキャラクターは `characters/tsukumo-spirit/`（このリポジトリのために自作した精霊。
**権利がクリーンなので公開リポジトリに置いてあります**）。自分の立ち絵を使うときは、
`.gitignore` 済みの `characters/local/` に素材と定義ファイルを置き、そこを指して起動します。

```bash
TSUKUMO_CHARACTER=characters/local tsukumo
```

```json
{
  "name": "表示名",
  "license": "その素材をここに置いてよい根拠",
  "portraits": {
    "default": "通常時の画像",
    "working": "作業中",
    "proud": "どや顔",
    "flustered": "あわあわ"
  },
  "outfitAccents": {
    "default": "#b8c7ff",
    "light": "#a8e6c0",
    "normal": "#b8c7ff",
    "heavy": "#ffb3a7"
  }
}
```

- **`portraits` は「あるものだけ」でよい。** 見つからない表情は `default` に落ちます
- **ただし `default` と `working` の2つは必須**（コード側が名前で直接参照するため）
- **`outfitAccents` は衣装（実行中のモデル）ごとの差し色。** `light` = haiku /
  `normal` = sonnet / `heavy` = opus
- **差し色が効くのはインラインで埋め込んだ SVG だけ**（PNG / GIF は表情と同じくファイルを分ける）

**公開リポジトリなので、権利のある画像（公式絵・ファンアートなど）をコミットしないでください。**
定義ファイルの完全な仕様は [`characters/README.md`](./characters/README.md) が正典です。

## 会話内容の扱い

**会話は tsukumo のプロセスの外へ出ません。** この規約は他のどの規約よりも優先されます。

- SDK は `claude` を子プロセスとして起こすだけ、`speak` は tsukumo のプロセス内の MCP サーバ
  （戻り値は `"ok"` だけ）、ビューは `127.0.0.1` にだけバインドする
- **ビューはファイルに書き出さない。** 本文はメモリに持ち、HTTP で配るだけ
- **外部ライブラリは `vendor/` に同梱する**（[`vendor/README.md`](./vendor/README.md)）。
  CDN から読むと、レポート本文が載ったページで外部スクリプトが動き、表示のたびに外部へ
  リクエストが飛ぶため。同梱することで**表示時の外部通信はゼロ**になる

詳細は [`docs/coding-standards.md`](./docs/coding-standards.md)「会話内容の扱い」が正典です。

## 開発

```bash
# 型チェック・リント・フォーマット・テストをまとめて実行（変更後は必ずこれを通す）
bun run check

# 個別実行
bun run typecheck                     # tsc --noEmit
bun run lint                          # oxlint（--fix は lint:fix）
bun run format                        # oxfmt で自動整形（--check は format:check）
bun test --isolate                    # テスト全体（`mock.module` がファイルをまたいで漏れるため
                                       #   素の `bun test` は使わない）
bun test --isolate test/cli.test.ts   # 単体テストファイルのみ実行
```

**ブラウザに出た絵は自動テストで守りません。** 配信（バインド先・経路・push）まではテストし、
実際に見えているかは目視で確認します（手順は `docs/architecture.md`「手で確かめること」）。

### プロジェクト構成

```
.
├── src/
│   ├── protocol/           # 両側で共有する契約（SessionEvent・SessionState・ClientCommand・
│   │                       #   ServerFrame など。zod。node: も document も触らない）
│   ├── core/               # サーバ（Bun）。SDK 駆動、HTTP/WebSocket、キャラクターパック、
│   │                       #   環境変数の読み取り、Orca アダプタ
│   ├── ui/                 # クライアント（ブラウザ）。React の部品、unified の Markdown 変換、CSS
│   └── cli.ts              # 配線（composition root）。起動時の前提チェック・終了処理
├── test/                   # テスト（src/ と同じディレクトリ構成 ＋ architecture.test.ts）
├── characters/             # キャラクター定義と素材（tsukumo-spirit が既定、local/ は .gitignore）
├── vendor/                 # 同梱している外部ライブラリ（編集しない）
├── scripts/                # 閉じたタブを開き直す道具など
├── assets/                 # ロゴ
├── docs/                   # 要件定義・設計・アーキテクチャ・規約・用語集（正典）
├── develop/                # 進捗管理（tasks.json・progress.md・direction.md）。機能には関係しない
├── bin/tsukumo             # エントリポイント（bun link でグローバルに入る）
└── package.json
```

**層はディレクトリで表し、許した依存の辺以外は `test/architecture.test.ts` が落とします。**
各ファイルの責務は [`docs/architecture.md`](./docs/architecture.md)「各ファイルの責務」が正典です。

### ドキュメント

- [`docs/requirements.md`](./docs/requirements.md) — 要件定義（やること・**やらないこと**・技術制約・未決事項）
- [`docs/design.md`](./docs/design.md) — 設計書（`protocol` / `core` / `ui` の3層・プロトコル・部品・キャラクターパック）
- [`docs/architecture.md`](./docs/architecture.md) — アーキテクチャ詳細（全体図・設計判断・目視確認の手順・既知の制約）
- [`docs/coding-standards.md`](./docs/coding-standards.md) — コーディング規約（**会話内容の扱い**を含む）
- [`docs/glossary.md`](./docs/glossary.md) — 用語集（日本語表記とコード上の識別子の対応）
- [`docs/workflow.md`](./docs/workflow.md) — このリポジトリでの進捗管理の上乗せ
- [`CLAUDE.md`](./CLAUDE.md) — Claude Code 向けのプロジェクト案内（上記への入口）

**`docs/` の各ファイルは冒頭に「節の索引」を持ち、通読しない前提で書かれています。**
知りたいことから節を1つ特定して、その節だけを読んでください。
