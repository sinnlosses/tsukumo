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

本文は `docs/readme/` の4つの子のファイルにも分けてあります。節の見出しはここに残し、中身は移し先を引きます。

- `docs/readme/mechanism.md`: 仕組み、データの流れ、画面レイアウト
- `docs/readme/troubleshooting.md`: つまずいたとき
- `docs/readme/configuration.md`: 設定、環境変数、認証、キャラクターの差し替え、会話内容の扱い
- `docs/readme/development.md`: プロジェクト構成、ドキュメントの一覧

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
  - [認証](#認証)
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
- **表情が状態に連動する** — 表情は `speak` の引数だけが決める
- **キャラクターの素材を差し替えられる** — 立ち絵・表情・差し色はすべて定義ファイル側。
  コードにキャラクターの中身を書かない
- **画面からキャラクターとセッションを切り替えられる** — 画面の最上部の帯の顔でキャラクターを、
  部屋の札でセッションを選ぶと、その相手のセッションに起こし直す（切り替えたキャラクターは次回以降も覚えている）
- **hook の登録が要らない** — 表情・作業の進行はすべて SDK のイベントから決まるので、
  `~/.claude/settings.json` に足すものは何も無い
- **外部通信ゼロで表示する** — ビューは `127.0.0.1` にだけバインドし、外部ライブラリは
  `node_modules` から自前で配る（CDN を踏ませない）

## セットアップ

GitHub から落として、`tsukumo` を打つと画面が開くところまでの手順です。上から順に進めれば動きます。
macOS の zsh を前提に書いています（bash なら `~/.zshrc` を `~/.bashrc` に読み替えます）。

### 0. 前もって用意するもの

| 用意するもの                                        | 何に使うか                                                                                                              | 確かめ方                     |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| [mise](https://mise.jdx.dev/getting-started.html)   | Node 26 と pnpm 12 と D2 を、リポジトリの `mise.toml` が固定した版で入れる（D2 は書き手が図を撮るときだけ使う）         | `mise --version`             |
| Claude Code へのログイン                            | tsukumo は Claude Code を子プロセスとして起こす。実行ファイルは `pnpm install` で入る Agent SDK に同梱されている        | 普段どおり `claude` が使える |
| [Orca](https://www.onorca.dev/)（無くても起動する） | 画面を出すホストの1つ。Orca の中で起こすと、起動時に Orca のタブが自動で開く。外で起こすと macOS の既定のブラウザで開く | `which orca`                 |

Orca の外では macOS の `open` で既定のブラウザに開きます。`open` が失敗したときや `TSUKUMO_HOST=none` のときはタブが自動で開かないだけで、配信は続きます。起動時に表示される URL を手で
ブラウザに開いてください。`tsukumo` コマンド自身は mise の `node`（手順1で入れた版）を自分で
見つけて起こすので、`mise activate` などのシェル連携は要りません。

### 1. 取ってきて導入する

```bash
git clone --recurse-submodules https://github.com/sinnlosses/tsukumo.git
cd tsukumo
mise trust      # このリポジトリの mise.toml を信頼する（初回だけ）
mise install    # mise.toml が指す node@26 と pnpm@12 を入れる
mise run setup  # 依存を入れ、ブラウザ側を組み立て、tsukumo コマンドを入れる
```

`mise run setup` は `pnpm install`・`pnpm run build`（成果物は `dist/browser/`）・
共有の `.git/hooks/pre-commit`（20,000 バイトを超えるファイルの追加・拡大をコミットの手前で止める検査。別の `pre-commit` があれば上書きしません）・
`pnpm add --global "link:<このリポジトリ>"`（`bin/tsukumo` を `tsukumo` コマンドとして入れる）の順に進みます。
pnpm のグローバルの置き場（`$PNPM_HOME/bin`）が `PATH` に無いときだけ、代わりに `pnpm setup --force` を
打って止まり、新しいシェルを開くよう知らせます（シェルの設定ファイルの `# pnpm` 〜 `# pnpm end` の区画を
足すか、古い pnpm が書いた区画を今の形に書き直します）。そのときは新しいシェルで `mise run setup` を
打ち直してください。

`which tsukumo` で `$PNPM_HOME/bin` の下の `tsukumo` が出れば通っています。消すときは
`pnpm remove --global tsukumo` を実行します。

### 2. 起動する

作業したいプロジェクトのディレクトリへ移って打ちます（`claude` を打つのと同じ感覚で、
`characters/` も `.tw/` も無いディレクトリでかまいません）。

```bash
cd ~/path/to/your-project
tsukumo
```

次の表示が出れば起動できています。この URL のページが、Orca の中なら Orca のタブで、外なら既定のブラウザで自動で開きます。

```
tsukumo: ビューを配信中
  http://127.0.0.1:7327/...?t=...
```

止めるときは、起動したターミナルで Ctrl-C を押します。複数動かしているときは、リポジトリの直下で
`node scripts/runtime/stop.ts` を打つと一覧が出て、`--port <n>` で1つだけ止められます。
起動した tsukumo は `$TSUKUMO_HOME/instance-location/<pid>.json` に自分の pid・ポート・URL・cwd を書き、
一覧はそれを読み、そのポートで待っているのが書いた pid であるものだけを採ります。
一覧の「鮮度」の列は、起動時の HEAD（所在のファイルに書く）をその cwd の今の HEAD と比べ、「最新」「古い（起動 → 今の短い HEAD）」「不明（欄の無い古いファイル・git が読めない）」のどれかを出します。
所在を書かない古いプロセスのために、ポートの走査も併用します。

### 3. 更新する

```bash
cd ~/path/to/tsukumo
git pull
mise run setup
```

導入と同じ `mise run setup` で済みます（`tsukumo` コマンドも入れ直すので、`bin/tsukumo` が変わったときも追随します。取り込んだ `vendor/tsukumo-plugins` も固定したコミットへ揃います）。

### つまずいたとき

本文は `docs/readme/troubleshooting.md`「つまずいたとき」。

### 開発しながら動かす

リポジトリ直下で開発しながら動かす場合は `pnpm run start` が `tsukumo` と同じ意味になります。
`pnpm run dev` は起動の前に `pnpm run build` で1回組み立ててから、`start` と同じものに Vite の
開発サーバを差し込んで起こします。`src/browser/` を保存すると、開いているタブへ画面の状態を保ったまま
差し替わります（HMR。`src/server/` と `src/shared/` を直したときは上げ直しが要ります。開発中に直した
ぶんを `tsukumo` に乗せるには `pnpm run build` を打ちます）。

## 仕組み

本文は `docs/readme/mechanism.md`「仕組み」。

### データの流れ

本文は `docs/readme/mechanism.md`「データの流れ」。

## 画面レイアウト

本文は `docs/readme/mechanism.md`「画面レイアウト」。

## 使い方

### 入力欄から依頼を送る

右下の領域に依頼を書いて Enter を押すと、そのままセッションへ渡ります。実行中は同じボタンが
「中断」に変わります。

- **`/` を打つとコマンドの補完**が入力欄の上に重なって出ます。前方一致を先に、続けて部分一致を
  並べ、Tab で確定・Enter で実行・クリックでも確定できます
- **起動・キャラクターの切り替え・仕事と雑談の切り替えは、常に新しいセッションから始まります。**
  前のセッションへは、部屋の札から開く切り替え画面で行を選ぶか、始め方の一覧の「前回の続き」の札で戻ります

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

本文は `docs/readme/configuration.md`「設定」。

### 環境変数

本文は `docs/readme/configuration.md`「環境変数」。

### 認証

本文は `docs/readme/configuration.md`「認証」。

### キャラクターを差し替える

本文は `docs/readme/configuration.md`「キャラクターを差し替える」。

## 会話内容の扱い

本文は `docs/readme/configuration.md`「会話内容の扱い」。

## 開発

```bash
pnpm run check                 # typecheck + lint + format:check + token-limit + test + test:e2e（変更後は必ずこれを通す。
                              #   段の選び方と打ち直しの飛ばしは docs/architecture/testing.md「E2E の走らせ方」。
                              #   --full の全件は main へ送る直前に打つ）
pnpm run ship                  # タスクに紐付かない作業を main へ送る（取り込み・検証・送り出しを
                              #   1つに。落ちた段を出して止まる。docs/workflow.md「タスクに紐付
                              #   かない作業を main へ送る」）
pnpm run test                  # 単体テスト全体（Vitest。`test/e2e/` は外す。ファイルを渡すと規約のテストも足す）
npx vitest run test/cli.test.ts  # 単体テストファイルのみ実行
pnpm run test:coverage         # 単体テストのカバレッジ（src/ が対象。HTML は /tmp/tsukumo-coverage/。check には入れない）
pnpm run test:e2e <ファイル>    # E2E（組み立ててから渡した test/e2e/*.test.ts を走らせる。Playwright の headless shell が要る（`pnpm exec playwright-core install chromium-headless-shell`）。成果物と
                              #   スクリーンショットは /tmp/tsukumo-e2e/。ファイルなしの全件は check --full の中でだけ通る）
pnpm run test:e2e:update       # E2E の期待値（test/e2e/expected/）を書き直す。git diff で読んでから入れる。
                              #   既定は check と同じ選び方の E2E だけ。--full で全件、ファイルを渡せばそれだけ
pnpm run typecheck             # css-types のあと tsc --noEmit
pnpm run lint                  # oxlint（--fix は lint:fix）
pnpm run format                # ADR の一覧表と用語集の索引を見出しから書き直し、oxfmt で自動整形（--check は format:check）
pnpm run build                 # ブラウザ側（src/browser/）を dist/browser/ に組み立てる。起動時には組み立てない
                              #   ので、pnpm install のあとと src/browser/ を直したあとに打つ
pnpm run start                 # セッションを起こし、ページをホスト（Orca か既定のブラウザ）に開く（`tsukumo` コマンドと同じ。
                              #   TSUKUMO_OPEN_VIEW=0 で自動オープンを止める。本物の claude を子プロセスで起こす。
                              #   成果物か vendor/tsukumo-plugins が無ければ前提不足で止まり、ソースの指紋が組み立て時と違えば1行知らせて古いまま配る）
pnpm run dev                   # pnpm run build のあと、start と同じ経路を Vite の開発サーバつき（--dev）で起こす
                              #   （src/server/ と src/shared/ を直したときは上げ直しが要る。docs/architecture/build.md）
pnpm run storybook             # 部品を props ごとに並べる Storybook を http://localhost:6006/ に起こす
                              #   （story は story/ の下。本体と同じ vite.config.ts で組み立てる）
node scripts/capture/open-views.ts <URL>  # プロセスは動いたままタブだけ閉じたときに開き直す
node scripts/capture/capture-view.ts --scene <場面> --paper-metric  # 紙面の物差し（テンプレの手がかり・色相の族・判決の頭の高さ・読む面を超える図・横並びの縦落ち）を 1440x900 と 1920x1080 で数える
pnpm run grid                  # 待ち受けていてタブもある部屋を iframe の格子に並べて Orca に開く。格子のタブが
                              #   あるあいだ常駐し、再読み込みのたびに並べ直す。タブを閉じると終わる
node scripts/runtime/stop.ts   # 動いている tsukumo を一覧する（--port <n> でそれ1つだけ止める。pkill / killall は
                              #   hook が拒否する。並べて動かすとどれも `node src/cli.ts` に見えて区別できないため）
node scripts/capture/mockup-font-floor.ts <見本の HTML かディレクトリ>  # 見本の font-size のうち 12px 未満を一覧する（あれば終了コード1）
node scripts/runtime/experience-metric.ts  # 進行の計測値（依頼から結論まで・答え待ち・立ち直るまでの手数・仕切りを離した比率）を集計する
                              #   （--days <n> で期間、--split <YYYY-MM-DD> でその日の前後に分ける）
node scripts/runtime/diagnostic.ts     # 診断ログ（~/.tsukumo/diagnostic/）を時系列に並べる（既定は今日。--from / --to
                              #   <YYYY-MM-DD[THH:MM[:SS]]> で時刻の範囲、--generation <n> で駆動の代を絞る）
```

`main` への push では GitHub Actions（`.github/workflows/ci.yml`）が typecheck・lint・format:check・
単体テストを走らせます。Node と pnpm の版は `mise.toml` から入れます。E2E と目視は手元にだけ残します。
Beads の読み手の単体テストが使う `bd` は CI が版を固定して別に入れ、`test/architecture/test-suite.test.ts` が
CI に無い外部コマンドを起こすテストを検査で落とします。

**ブラウザに出た絵は自動テストで守りません。** 配信（バインド先・経路・push）まではテストし、
実際に見えているかは目視で確認します（手順は `docs/architecture/testing.md`「手で確かめること」）。

### プロジェクト構成

本文は `docs/readme/development.md`「プロジェクト構成」。

### ドキュメント

本文は `docs/readme/development.md`「ドキュメント」。
