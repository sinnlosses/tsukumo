<p align="center">
  <img src="assets/logo.png" alt="tsukumo" width="200"/>
</p>

<h1 align="center">tsukumo</h1>

<p align="center">
  付喪神が道具に宿るように、ターミナルでの仕事にキャラクターを宿らせます。<br>
  Agent SDK で Claude Code を動かし、セリフは吹き出しへ、技術的な詳細はレポートへ分けて表示します。
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node-26-339933?logo=node.js" alt="Node">
  <img src="https://img.shields.io/badge/TypeScript-7.0-3178C6?logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/Claude_Agent_SDK-0.3-D97757?logo=anthropic" alt="Claude Agent SDK">
  <img src="https://img.shields.io/badge/Lint-oxlint-cc9c00" alt="oxlint">
  <img src="https://img.shields.io/badge/Tested_with-Vitest-6E9F18?logo=vitest" alt="Vitest">
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
- [セットアップ](#セットアップ)
  - [つまずいたとき](#つまずいたとき)
- [仕組み](#仕組み)
  - [データの流れ](#データの流れ)
- [画面レイアウト](#画面レイアウト)
- [使い方](#使い方)
  - [入力欄から依頼を送る](#入力欄から依頼を送る)
  - [許可プロンプトと質問に答える](#許可プロンプトと質問に答える)
- [設定](#設定)
  - [環境変数](#環境変数)
  - [プロジェクトの設定](#プロジェクトの設定)
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
  `chart` のグラフに対応し、更新は WebSocket でブラウザへ押す
- **入力もページの中で行う** — 右下の入力欄から依頼を送り、実行中は同じボタンが「中断」に変わる
- **`/` でスラッシュコマンドを補完** — 前方一致を先に、続けて部分一致。Tab で確定・Enter で実行
- **許可プロンプトと質問を1つの札で答える** — 「このコマンドを実行していいか」も
  `AskUserQuestion` の選択肢もメインビューのお伺いの札に番号つきで出て、押すか数字キーと Enter で選んだ答えが
  `canUseTool` の戻り値として返る
- **表情と衣装が状態に連動する** — 表情は `speak` の引数だけが決め、
  衣装は実行中のモデル（`haiku` = 軽装 / `sonnet` = 通常装備 / `opus`・`fable` = 戦闘配置）
- **キャラクターの素材を差し替えられる** — 立ち絵・表情・差し色はすべて定義ファイル側。
  コードにキャラクターの中身を書かない
- **画面からキャラクターとセッションを切り替えられる** — 画面の最上部の帯の顔でキャラクターを、
  部屋の札でセッションを選ぶと、その相手のセッションに起こし直す（切り替えたキャラクターは次回以降も覚えている）
- **hook の登録が要らない** — 表情・衣装・作業の進行はすべて SDK のイベントから決まるので、
  `~/.claude/settings.json` に足すものは何も無い
- **外部通信ゼロで表示する** — ビューは `127.0.0.1` にだけバインドし、外部ライブラリは
  `node_modules` から自前で配る（CDN を踏ませない）

## セットアップ

GitHub から落として、`tsukumo` を打つと画面が開くところまでの手順です。上から順に進めれば動きます。
macOS の zsh を前提に書いています（bash なら `~/.zshrc` を `~/.bashrc` に読み替えます）。

### 0. 前もって用意するもの

| 用意するもの                                        | 何に使うか                                                                                                       | 確かめ方                     |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| [mise](https://mise.jdx.dev/getting-started.html)   | Node 26 と pnpm 12 を、リポジトリの `mise.toml` が固定した版で入れる                                             | `mise --version`             |
| Claude Code へのログイン                            | tsukumo は Claude Code を子プロセスとして起こす。実行ファイルは `pnpm install` で入る Agent SDK に同梱されている | 普段どおり `claude` が使える |
| [Orca](https://www.onorca.dev/)（無くても起動する） | 画面を出す箱。`orca` コマンドがあれば、起動時にタブが自動で開く                                                  | `which orca`                 |

Orca が無いときはタブが自動で開かないだけで、配信は続きます。起動時に表示される URL を手で
ブラウザに開いてください。`tsukumo` コマンド自身は mise の `node`（手順1で入れた版）を自分で
見つけて起こすので、`mise activate` などのシェル連携は要りません。

### 1. 取ってきて導入する

```bash
git clone https://github.com/sinnlosses/tsukumo.git
cd tsukumo
mise trust      # このリポジトリの mise.toml を信頼する（初回だけ）
mise install    # mise.toml が指す node@26 と pnpm@12 を入れる
mise run setup  # 依存を入れ、ブラウザ側を組み立て、tsukumo コマンドを入れる
```

`mise run setup` は `pnpm install`・`pnpm run build`（成果物は `dist/browser/`）・
`pnpm add --global "link:<このリポジトリ>"`（`bin/tsukumo` を `tsukumo` コマンドとして入れる）の順に進みます。
pnpm のグローバルの置き場（`$PNPM_HOME/bin`）が `PATH` に無いときだけ、代わりに `pnpm setup --force` を
打って止まり、新しいシェルを開くよう知らせます（シェルの設定ファイルの `# pnpm` 〜 `# pnpm end` の区画を
足すか、古い pnpm が書いた区画を今の形に書き直します）。そのときは新しいシェルで `mise run setup` を
打ち直してください。

`which tsukumo` で `$PNPM_HOME/bin` の下の `tsukumo` が出れば通っています。消すときは
`pnpm remove --global tsukumo` を実行します。

### 2. 起動する

作業したいプロジェクトのディレクトリへ移って打ちます（`claude` を打つのと同じ感覚で、
`characters/` も `develop/` も無いディレクトリでかまいません）。

```bash
cd ~/path/to/your-project
tsukumo
```

次の表示が出れば起動できています。Orca があれば、この URL のタブが自動で開きます。

```
tsukumo: ビューを配信中
  http://127.0.0.1:7327/...?t=...
```

止めるときは、起動したターミナルで Ctrl-C を押します。複数動かしているときは、リポジトリの直下で
`node scripts/stop.ts` を打つと一覧が出て、`--port <n>` で1つだけ止められます。

### 3. 更新する

```bash
cd ~/path/to/tsukumo
git pull
mise run setup
```

導入と同じ `mise run setup` で済みます（`tsukumo` コマンドも入れ直すので、`bin/tsukumo` が変わったときも追随します）。

### つまずいたとき

| 出たもの                                                              | 原因                                                         | 対処                                                              |
| --------------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------- |
| `zsh: command not found: tsukumo`                                     | `$PNPM_HOME/bin` が `PATH` に通っていない                    | 新しいシェルを開いて `mise run setup` を打ち直す（手順1）         |
| `tsukumo: ブラウザ側の成果物を読めない`                               | `dist/browser/` が無い                                       | リポジトリの直下で `mise run setup`（手順1）                      |
| `tsukumo: ソース（src/browser/ src/shared/）のほうが成果物より新しい` | 更新したあと組み立て直していない                             | `mise run setup`（手順3）。止まりはせず、古い画面のまま動く       |
| `tsukumo: TSUKUMO_VIEW_PORT がポート番号として読めない`               | 環境変数に数でない値が入っている                             | `TSUKUMO_VIEW_PORT` を外すか数にする                              |
| `tsukumo: node <版> が古い`                                           | `PATH` の node が 26 未満（mise の node が選ばれていない）   | リポジトリの直下で `mise install`、そのあと `mise run setup`      |
| タブが開かない                                                        | `orca` が無い、`TSUKUMO_OPEN_VIEW=0`、か `TSUKUMO_HOST=none` | 表示された URL を手でブラウザに開く                               |
| タブだけ閉じてしまった                                                | プロセスは動いたまま                                         | `node scripts/open-views.ts http://127.0.0.1:<ポート>` で開き直す |

### 開発しながら動かす

リポジトリ直下で開発しながら動かす場合は `pnpm run start` が `tsukumo` と同じ意味になります。
`pnpm run dev` は起動の前に `pnpm run build` で1回組み立ててから、`start` と同じものに Vite の
開発サーバを差し込んで起こします。`src/browser/` を保存すると、開いているタブへ画面の状態を保ったまま
差し替わります（HMR。`src/server/` と `src/shared/` を直したときは上げ直しが要ります。開発中に直した
ぶんを `tsukumo` に乗せるには `pnpm run build` を打ちます）。

## 仕組み

tsukumo は**1つのプロセス**で、Agent SDK で Claude Code を子プロセスとして起こし、
受け取ったイベントを HTML のビューに変えて、ローカルのサーバから WebSocket 1本で箱（Orca のタブ）の中の
ブラウザへ配ります（通信の形は [`docs/architecture.md`](./docs/architecture.md)「全体構成」）。

```
┌────────────────────────────────────────────────┐
│ ブラウザ（Orca のタブ）                        │
│   メインビュー：レポート・お伺い               │
│   キャラビュー：立ち絵＋セリフ                 │
│   サイドバー：進行・タスク一覧・セッション情報 │
│   入力欄：依頼・送信・中断・自由入力の回答     │
└────────────────────────────────────────────────┘
      ▲                       │
      │ WebSocket で押す      ▼ コマンド（依頼・回答・中断。oRPC）
┌────────────────────────────────────────────────┐
│ tsukumo（Node の1プロセス）                    │
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

| #   | 流れ                           | 中身                                                                                                                                                                                 |
| --- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | 入力欄 → `query`               | 入力欄に打った依頼を WebSocket 上のコマンドの手続き（oRPC）で受け、ストリーミング入力モードの `query` へ追加入力として流す。中断も同じ経路                                           |
| 2   | イベント → 各ビュー            | `assistant` のテキストは**レポート**（メインビュー）、`speak` の引数は**セリフと表情**（キャラビュー）、`tool_use` / `tool_result` は**進行**（サイドバー）。更新は WebSocket で押す |
| 3   | `canUseTool` → 答え待ち → 回答 | 許可プロンプトと `AskUserQuestion` はどちらも `canUseTool` に届く。メインビューのお伺いの札に選択肢を出し、選ばれた答えを戻り値として SDK へ返す                                     |

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
node scripts/open-views.ts http://127.0.0.1:7327
```

## 使い方

### 入力欄から依頼を送る

右下の領域に依頼を書いて Enter を押すと、そのままセッションへ渡ります。実行中は同じボタンが
「中断」に変わります。

- **`/` を打つとコマンドの補完**が入力欄の上に重なって出ます。前方一致を先に、続けて部分一致を
  並べ、Tab で確定・Enter で実行・クリックでも確定できます
- **同じディレクトリ・同じキャラクターの前回のセッションがあれば、自動で続きから始まります**
  （部屋の札にその印が出ます）。新規に始め直したいときは `TSUKUMO_NEW_SESSION=1` を付けて
  起動します

### 許可プロンプトと質問に答える

「このコマンドを実行していいか」も `AskUserQuestion` の選択肢も、メインビューのお伺いの札に
番号つきのカードで出ます。カードを押すか、札にフォーカスがあるときに数字キーで選び、「これで答える」
（Enter）で答えます。入力欄の上の帯の「お伺いへ」を押すと、札の最初の選択肢へフォーカスが移ります。
質問の選択肢にない答えは入力欄に書いて送れます。
許可モード（毎回聞く／編集は自動／全部許す／プラン）とモデル・effort は、画面の最上部の帯のドロップダウン
（会話の画面ではサイドバーの下端）から切り替えられます。

キャラクターは吹き出しで一言聞くだけで、選択肢そのものは別の札に出ます
（セリフと詳細を分ける方針の一部です）。

## 設定

### 環境変数

| 変数名                     | 必須 | デフォルト                         | 説明                                                                                                                                                                                                                                                                                                             |
| -------------------------- | :--: | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TSUKUMO_VIEW_PORT`        |      | `7327`                             | ビューを配るポート。**既定のまま塞がっていたら20個先まで順にずらす**（明示的に指定したときはずらさずそのまま失敗する）。`0` を渡すと空きポートを使う                                                                                                                                                             |
| `TSUKUMO_CHARACTER`        |      | 同梱の `characters/tsukumo-spirit` | キャラクター定義ディレクトリ。相対パスは cwd 相対、絶対パスはそのまま                                                                                                                                                                                                                                            |
| `TSUKUMO_OPEN_VIEW`        |      | 開く                               | 起動時にレイアウトページのタブを自動で開くか。`0` を渡すと開かない                                                                                                                                                                                                                                               |
| `TSUKUMO_HOST`             |      | `orca`                             | ページとファイルを開くホスト。`orca` は起動時に Orca のタブを開き、レポートのパスを押すと Orca のエディタで開く（`orca` が無ければどちらも開かず、URL は表示される）。`none` は何も開かない: 起動時のタブは開かず、表示された URL を手で開く。レポートのパスは押しても開かず「ファイルを開けなかった」と断られる |
| `TSUKUMO_DRIVER`           |      | `sdk`                              | セッションの駆動。`fake` を渡すと本物の `claude` を起こさず、疑似セッションどおりにイベントを流す（目視確認・自動テスト用）                                                                                                                                                                                      |
| `TSUKUMO_FAKE_SCENE_UNTIL` |      | 全部流す                           | `TSUKUMO_FAKE_SCENE` の場面の手を先頭から何個まで流すか（正の整数）。場面の途中の画を撮る `capture-view.ts --until-step` が使う                                                                                                                                                                                  |
| `TSUKUMO_FAKE_SCENE`       |      | 流さない                           | `fake` のとき起こした直後に流す疑似セッションの場面の名前。依頼を送らずに特定の画面を出すための口で、状態のカタログを撮るときに使う                                                                                                                                                                              |
| `TSUKUMO_NEW_SESSION`      |      | 復元する                           | `1` を渡すと前回の続きから復元せず、新規にセッションを起こす                                                                                                                                                                                                                                                     |
| `TSUKUMO_HOME`             |      | `~/.tsukumo`                       | tsukumo が覚えたキャラクター・雑談のアーカイブ・トークン記録・作ったパックを置くホーム。**並行して2つを動かすときだけ** `TSUKUMO_VIEW_PORT` と一緒に分けて渡す。相対パスは cwd 相対                                                                                                                              |

### プロジェクトの設定

起動先のリポジトリで誰が開いても同じ値は、起動先の `.tsukumo/project.json` に書きます（リポジトリに
入れて共有する）。tsukumo はこのファイルだけを見て、CLAUDE.md や git の状態から値を推し量りません。
タスク一覧は、読むたびにこのファイルを読み直します。

```json
{
  "tasks": {
    "mainBranch": "main",
    "runPrompt": "タスク {id} を進めて（bd show {id} で読める）。"
  }
}
```

| 欄                 | 必須 | 既定                                              | 説明                                                                                                                               |
| ------------------ | :--: | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `tasks`            |      | 無し                                              | タスク運用の設定。無ければ Beads を試し読みし、`.beads` が無ければタスク一覧を「不明」にする。`"off"` はタスク運用を使わない（下） |
| `tasks.mainBranch` |  ○   | —                                                 | 主ブランチの名前                                                                                                                   |
| `tasks.runPrompt`  |      | `タスク {id} を進めて（bd show {id} で読める）。` | タスクを「tsukumo に頼む」ときに送る文面。`{id}` がタスクIDに置き換わる                                                            |

タスク一覧は、このファイルの有無に関わらず起動先の Beads（`bd`）から読みます（`.beads` が無ければ「不明」）。
**形が違えば（JSON が壊れている・知らない欄がある・値が違う）「読めない」**で、既定へは倒しません。
以前の版が書いた `"store": "beads"` の欄は読み捨てます。

タスク運用を使わないプロジェクトは `{ "tasks": "off" }` と書きます（画面の右上の歯車の「プロジェクト」の行から
切り替えもできます）。サイドバーにタスクの節を出さず、タスク一覧のために Beads を読みません。
成果の画面はこのファイルを読まず、いつも Beads の閉じた課題だけで数えます（`.beads` が無ければ成果を出しません）。

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
    "thinking": "作業中",
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
- **ただし `default` は必須**（コード側が名前で直接参照するため）
- **`outfitAccents` は衣装（実行中のモデル）ごとの差し色。** `light` = haiku /
  `normal` = sonnet / `heavy` = opus・fable
- **差し色が効くのはインラインで埋め込んだ SVG だけ**（PNG / GIF は表情と同じくファイルを分ける）

**公開リポジトリなので、権利のある画像（公式絵・ファンアートなど）をコミットしないでください。**
定義ファイルの完全な仕様は [`characters/README.md`](./characters/README.md) が正典です。

## 会話内容の扱い

**会話は tsukumo のプロセスの外へ出ません。** この規約は他のどの規約よりも優先されます。

- SDK は `claude` を子プロセスとして起こすだけ、`speak` は tsukumo のプロセス内の MCP サーバ
  （戻り値は `"ok"` だけ）、ビューは `127.0.0.1` にだけバインドする
- **ビューはファイルに書き出さない。** 本文はメモリに持ち、WebSocket と HTTP で配るだけ
- **外部ライブラリは CDN から読まず、自分のサーバ（`node_modules` の実ファイル）から配る**
  （`src/server/view-server/adapter/vendor-asset.ts`）。CDN から読むと、レポート本文が載ったページで外部スクリプトが
  動き、表示のたびに外部へリクエストが飛ぶため。自分で配れば**表示時の外部通信はゼロ**になる

詳細は [`docs/coding-standards.md`](./docs/coding-standards.md)「会話内容の扱い」が正典です。

## 開発

```bash
pnpm run check                 # typecheck + lint + format:check + test + test:e2e（変更後は必ずこれを通す。
                              #   E2E は変えたファイルから選んだものだけ。
                              #   --full で5段とも E2E 全件。全件は main へ送る直前に打つ。
                              #   文書だけの変更は --full でも format:check と文書の検査だけ）
pnpm run ship                  # タスクに紐付かない作業を main へ送る（取り込み・検証・送り出しを
                              #   1つに。落ちた段を出して止まる。docs/workflow.md「タスクに紐付
                              #   かない作業を main へ送る」）
pnpm run test                  # 単体テスト全体（Vitest。`test/e2e/` は外す。ファイルを渡すと規約のテストも足す）
npx vitest run test/cli.test.ts  # 単体テストファイルのみ実行
pnpm run test:coverage         # 単体テストのカバレッジ（src/ が対象。HTML は /tmp/tsukumo-coverage/。check には入れない）
pnpm run test:e2e              # E2E（組み立ててから test/e2e/ を走らせる。手元の Chrome が要る。成果物と
                              #   スクリーンショットは /tmp/tsukumo-e2e/）
pnpm run test:e2e:update       # E2E の期待値（test/e2e/expected/）を書き直す。git diff で読んでから入れる。
                              #   既定は check と同じ選び方の E2E だけ。--full で全件、ファイルを渡せばそれだけ
pnpm run typecheck             # css-types のあと tsc --noEmit
pnpm run lint                  # oxlint（--fix は lint:fix）
pnpm run format                # ADR の一覧表と用語集の索引を見出しから書き直し、oxfmt で自動整形（--check は format:check）
pnpm run build                 # ブラウザ側（src/browser/）を dist/browser/ に組み立てる。起動時には組み立てない
                              #   ので、pnpm install のあとと src/browser/ を直したあとに打つ
pnpm run start                 # セッションを起こし、ページのタブを Orca 内に開く（`tsukumo` コマンドと同じ。
                              #   TSUKUMO_OPEN_VIEW=0 で自動オープンを止める。本物の claude を子プロセスで起こす。
                              #   成果物が無ければ前提不足で止まり、ソースのほうが新しければ1行知らせて古いまま配る）
pnpm run dev                   # pnpm run build のあと、start と同じ経路を Vite の開発サーバつき（--dev）で起こす
                              #   （src/server/ と src/shared/ を直したときは上げ直しが要る。docs/architecture/build.md）
pnpm run storybook             # 部品を props ごとに並べる Storybook を http://localhost:6006/ に起こす
                              #   （story は story/ の下。本体と同じ vite.config.ts で組み立てる）
node scripts/open-views.ts <URL>  # プロセスは動いたままタブだけ閉じたときに開き直す
pnpm run grid                  # 待ち受けていてタブもある部屋を iframe の格子に並べて Orca に開く。格子のタブが
                              #   あるあいだ常駐し、再読み込みのたびに並べ直す。タブを閉じると終わる
node scripts/stop.ts           # 動いている tsukumo を一覧する（--port <n> でそれ1つだけ止める。pkill / killall は
                              #   hook が拒否する。並べて動かすとどれも `node src/cli.ts` に見えて区別できないため）
node scripts/mockup-font-floor.ts <見本の HTML かディレクトリ>  # 見本の font-size のうち 12px 未満を一覧する（あれば終了コード1）
node scripts/experience-metric.ts  # 体験の数（依頼から結論まで・答え待ち・立ち直るまでの手数）を集計する
                              #   （--days <n> で期間、--split <YYYY-MM-DD> でその日の前後に分ける）
node scripts/diagnostic.ts     # 診断ログ（~/.tsukumo/diagnostic/）を時系列に並べる（既定は今日。--from / --to
                              #   <YYYY-MM-DD[THH:MM[:SS]]> で時刻の範囲、--generation <n> で駆動の代を絞る）
```

`main` への push では GitHub Actions（`.github/workflows/ci.yml`）が typecheck・lint・format:check・
単体テストを走らせます。Node と pnpm の版は `mise.toml` から入れます。E2E と目視は手元にだけ残します。
Beads の読み手の単体テストが使う `bd` は CI が版を固定して別に入れ、`test/architecture.test.ts` が
CI に無い外部コマンドを起こすテストを検査で落とします。

**ブラウザに出た絵は自動テストで守りません。** 配信（バインド先・経路・push）まではテストし、
実際に見えているかは目視で確認します（手順は `docs/architecture/testing.md`「手で確かめること」）。

### プロジェクト構成

**層の名前は「どの実行環境で動くか」を表します**（サーバとブラウザの両方 = `shared/`、
サーバ = `server/`、ブラウザ = `browser/`）。**サーバ側は機能ごとに分かれ、各機能が
判断（`core/`）と外の世界に触る境界（`adapter/`）の2段を持ちます。**

```
.
├── src/
│   ├── shared/             # サーバとブラウザの両方で動く契約・語彙（zod。node: も document も触らない）
│   ├── server/             # サーバ（Node）
│   │   ├── <機能>/         #   機能ごとの置き場（session・session-driver・view-server・report・chat・
│   │   │   ├── core/       #     character-pack など）。core は純粋な判断、
│   │   │   └── adapter/    #     adapter は外の世界に触る境界（1ファイル = 1つの境界）
│   │   ├── core/           #   どの機能にも属さない共有の判断
│   │   └── adapter/        #   どの機能にも属さない共有の境界
│   ├── browser/            # ブラウザ。React の部品、unified の Markdown 変換、CSS
│   ├── cli.ts              # エントリポイント。引数・環境変数の読み出し・終了コードだけ
│   ├── main.ts             # 起動の段取り（前提チェック → キャラクター → 配信 → セッション）
│   ├── router.ts           # 全機能の手続き（oRPC）を束ねる
│   ├── current-character.ts  # いま出しているパックと選択肢の持ち主
│   ├── view-delivery.ts    # ビューの配信（起動トークン・組み立てたもの・開いているタブ）
│   ├── session-start.ts    # セッションを1つ起こす（機能ごとの組み立てを結ぶ）
│   └── wiring/             # 機能ごとの組み立て
│                           #   ※ src/ 直下と wiring/ は配線層。全層を import してよい唯一の場所
├── test/                   # テスト（src/ と同じディレクトリ構成 ＋ architecture.test.ts）
├── story/                  # Storybook の story（src/ と同じディレクトリ構成。設定は .storybook/）
├── characters/             # キャラクター定義と素材（tsukumo-spirit が既定、local/ は .gitignore）
├── plugin/                 # セッションに載せる同梱の Claude Code プラグイン（スキル）
├── scripts/                # 開発の道具（check・ship・stop・撮影・文書の検査・hook の deny-* など）
├── assets/                 # ロゴ
├── docs/                   # 要件定義・設計・アーキテクチャ・規約・用語集（正典）
├── develop/                # 進捗管理（task/・direction.md・draft/）。機能には関係しない
├── .tsukumo/project.json   # このリポジトリのプロジェクトの設定（「プロジェクトの設定」）
├── bin/tsukumo             # エントリポイント（mise run setup でグローバルに入る）
└── package.json
```

**層はディレクトリで表し、許した依存の辺以外は `test/architecture.test.ts` が落とします。**
各ファイルの責務はそのファイルの冒頭のコメントが正典です。機能の一覧と置き場所の基準は
[`docs/architecture.md`](./docs/architecture.md)「サーバの機能と、機能どうしの辺」「ディレクトリ」にあります。

### ドキュメント

- [`docs/requirements.md`](./docs/requirements.md) — 要件定義（やること・**やらないこと**・技術制約・未決事項）
- [`docs/architecture.md`](./docs/architecture.md) — アーキテクチャ詳細（全体図、`shared` / `server`（`core`・`adapter`）/ `browser` の層・プロトコル・置き場所、設計判断）
- [`docs/architecture/browser.md`](./docs/architecture/browser.md) — ブラウザ側（状態の持ち方・Markdown・重いライブラリ・立ち絵の動き・CSS・`components/ui/` の部品）
- [`docs/architecture/character-pack.md`](./docs/architecture/character-pack.md) — キャラクターパック（形・探索順・画面から書くときの境界・雑談の記憶の置き場）
- [`docs/architecture/testing.md`](./docs/architecture/testing.md) — テスト（対象ごとの方法・E2E・目視確認の手順）
- [`docs/architecture/build.md`](./docs/architecture/build.md) — ビルドと依存（事前の組み立て・HMR・足す依存の一覧）
- [`docs/architecture/screen-design.md`](./docs/architecture/screen-design.md) — 画面のデザイン（色・書体・レイアウトの計画とトークン、雑談モードの画面、背景、画面のナビの帯）
- [`docs/architecture/display.md`](./docs/architecture/display.md) — 表示（セリフとレポートの出力分離、レポートの記法の規約、立ち絵・吹き出し・メインビュー・入力欄・サイドバーなど各表示物の仕様）
- [`docs/architecture/chat-mode.md`](./docs/architecture/chat-mode.md) — 雑談モード（遡れる幅、記憶の圧縮と忘却、残す旗、会話のアーカイブ、人格への書き戻し）
- [`docs/coding-standards.md`](./docs/coding-standards.md) — コーディング規約（**会話内容の扱い**を含む）
- [`docs/glossary.md`](./docs/glossary.md) — 用語集（日本語表記とコード上の識別子の対応）
- [`docs/workflow.md`](./docs/workflow.md) — このリポジトリでの進捗管理の上乗せ
- [`CLAUDE.md`](./CLAUDE.md) — Claude Code 向けのプロジェクト案内（上記への入口）

**`docs/` の各ファイルは冒頭に「節の索引」を持ち、通読しない前提で書かれています。**
知りたいことから節を1つ特定して、その節だけを読んでください。
