# アーキテクチャ詳細

最終更新: 2026-09-30。ステータス: **正典**。

責務: 層と機能の辺・置き場所の基準・プロトコルの不変条件・動きの順序・安全の境界など、コードを
1ファイル読んでも分からない構造の規則だけを持つ、全体構造の入口。ブラウザ側・キャラクターパック・
テスト・ビルドの詳細は `docs/architecture/` へ、個々の設計判断の本文は `docs/architecture/adr/` へ分けている。
読む時: 新しい機能の置き場所に迷ったとき、層や機能どうしの辺を確かめたいとき、「なぜ今の形なのか」を確かめたいとき。
直す時: 層・機能の辺や置き場所の基準を変えたとき、設計判断を新しく記録する・ADR の一覧を更新するとき。

ほかは持ち主へ返す:

| 種類                                 | 返す先                                                    |
| ------------------------------------ | --------------------------------------------------------- |
| コードの写し                         | **削除**（`docs/history/` へ移さない）                    |
| 機能の仕様                           | `docs/architecture/chat-mode.md` / `docs/requirements.md` |
| 経緯と実測                           | `docs/history/`                                           |
| 「なぜこの形か」で残す価値があるもの | 「設計判断（なぜ今の形なのか）」                          |

## このドキュメントの読み方

| 知りたいこと                                     | 見る場所                                              |
| ------------------------------------------------ | ----------------------------------------------------- |
| 各関数の引数・戻り値・分岐条件                   | **コード側のドキュメンテーションコメントが正典**      |
| 何をどこに置くか                                 | 「新しいコードを置く場所」（原則の要約はAGENTS.mdに） |
| なぜ今の形なのか（別の形に直そうとする前に読む） | 「設計判断（なぜ今の形なのか）」                      |
| 描画結果をどう検証するか                         | `docs/architecture/testing.md`「手で確かめること」    |
| 要件そのもの（やること・やらないこと）           | `docs/requirements.md` が正典                         |

**各関数の詳しい振る舞いはコード側のコメントが正典。** ここには1〜2行の責務の要約と、
コードを読んでも分からないこと（なぜその置き場所なのか、なぜその案を採らなかったのか）だけを書く。

### このファイルは通読しない

このファイルは節の見出しと索引、子のファイルの一覧、設計判断の ADR の表を持つ入口で、節の本文は
子のファイル（`docs/architecture/`）にある。下の索引で節を1つ特定し、一覧から**その節の子のファイルだけ**を
開いて読む（このファイルから本文を切り出さない）。子のファイルの中は、見出しを当てて節だけを次の形で読む:

```bash
sed -n '/^## shared/,/^## /p' docs/architecture/shared-contract.md
```

**このファイルには「いまどうなっているか」だけを書く。** 却下した案の理由・値の根拠の実測・
覆した決定の記録は `docs/history/` に置き、ここからは1行で参照する。何を残して何を移すかの表は
`docs/requirements.md`「正典に残すもの・`docs/history/` へ移すもの」。

### 節の索引

**索引の行は本文の `##` の節と1対1**（`###` の節は載せない。節を足したり消したりしたら、
ここも同じ数だけ動かす）。ブラウザ側・キャラクターパック・テスト・ビルドは `docs/architecture/` に
分けてある（`browser.md`・`character-pack.md`・`testing.md`・`build.md`）。

| 節                              | 中身                                                                                                                                                                  |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ## 全体構成                     | 全体像とデータの流れ3本。層（shared / server / browser）の図、依存の向き、サーバの機能と辺、コマンドの受け手、shared の機能、ディレクトリ、ブラウザ側の置き場所の基準 |
| ## 新しいコードを置く場所       | 原則1〜5の判断材料                                                                                                                                                    |
| ## 動きの流れ                   | 起動・接続・依頼・答え待ち・再接続の順序                                                                                                                              |
| ## shared                       | **両側が共有する契約**。イベント・状態・コマンド・フレーム・版                                                                                                        |
| ## core と adapter              | 判断（core）と境界（adapter）の境目、SDK に触るファイルの分け方、代の持ち物、ツールで受け取るものと使い捨ての `query()` の形                                          |
| ## セッションの復元と複数化     | 復元を新しい形に載せる。複数化をやらないこと。ビューの本文の持ち方と再接続                                                                                            |
| ## 会話内容と安全               | `127.0.0.1`・Origin・起動トークン・ディスクに書く4つの例外と読み戻す口・定着・ブラウザ側のメモリ                                                                      |
| ## 設計判断（なぜ今の形なのか） | 今の形を別の形に直そうとする前に、一覧から該当する ADR を読む                                                                                                         |

本文は 16 の子のファイル（`docs/architecture/` の直下）に分けてある。節の見出しはここに残し、中身は移し先を引く。

- `docs/architecture/overview-and-layer.md`: 全体構成の前置き（全体像・データの流れ3本・層の図）、層と依存の向き
- `docs/architecture/server-feature.md`: サーバの機能と、機能どうしの辺
- `docs/architecture/command-procedure.md`: コマンドの受け手と手続きの置き方
- `docs/architecture/shared-feature.md`: shared の機能
- `docs/architecture/directory.md`: ディレクトリの前半（木の図・設定の置き場・タスク一覧の読み元・ファイル名・story・ページの形）
- `docs/architecture/browser-box.md`: ディレクトリの後半（`src/browser/` の箱と、置く基準）、領域の機能と、置かれる機能
- `docs/architecture/container-presenter.md`: 機能の中を分ける（container / presenter と `hooks/`）
- `docs/architecture/lib-and-utils-criterion.md`: `lib/` と `utils/` に置く基準
- `docs/architecture/code-placement.md`: 新しいコードを置く場所
- `docs/architecture/runtime-flow.md`: 動きの流れ（起動・接続・依頼・答え待ち・再接続）
- `docs/architecture/shared-contract.md`: shared（SessionEvent・SessionState・ClientCommand・ServerFrame・版と互換）
- `docs/architecture/core-and-adapter.md`: core と adapter
- `docs/architecture/session-restore.md`: セッションの復元と複数化
- `docs/architecture/conversation-safety.md`: 会話内容と安全の前半（境界: バインド先・Origin・起動トークン・ディスク・ブラウザ側のメモリ・CSP・ログ）
- `docs/architecture/conversation-safety-chat-memory.md`: 会話内容と安全の中盤（雑談の記憶: 定着・あらすじ・会話のアーカイブ・エピソード索引・直近の雑談の読み戻し・雑談の画像・人格への書き戻し）
- `docs/architecture/conversation-safety-local-record.md`: 会話内容と安全の後半（手元の記録・テストのフィクスチャと、表のあとの前提）

## 全体構成

本文は `docs/architecture/overview-and-layer.md`。

### 層と依存の向き

本文は `docs/architecture/overview-and-layer.md`。

### サーバの機能と、機能どうしの辺

本文は `docs/architecture/server-feature.md`（コマンドの受け手は `docs/architecture/command-procedure.md`）。

#### コマンドの受け手と手続きの置き方

本文は `docs/architecture/command-procedure.md`。

### shared の機能

本文は `docs/architecture/shared-feature.md`。

### ディレクトリ

本文は `docs/architecture/directory.md`（前半）と `docs/architecture/browser-box.md`（後半。`src/browser/` の箱と、置く基準）。

### 領域の機能と、置かれる機能

本文は `docs/architecture/browser-box.md`。

### 機能の中を分ける（container / presenter と `hooks/`）

本文は `docs/architecture/container-presenter.md`。

### `lib/` と `utils/` に置く基準

本文は `docs/architecture/lib-and-utils-criterion.md`。

## 新しいコードを置く場所

本文は `docs/architecture/code-placement.md`。

## 動きの流れ

### 起動

本文は `docs/architecture/runtime-flow.md`。

### 接続

本文は `docs/architecture/runtime-flow.md`。

### 依頼

本文は `docs/architecture/runtime-flow.md`。

### 答え待ち

本文は `docs/architecture/runtime-flow.md`。

### 再接続

本文は `docs/architecture/runtime-flow.md`。

## shared

本文は `docs/architecture/shared-contract.md`。

### SessionEvent

本文は `docs/architecture/shared-contract.md`。

### SessionState

本文は `docs/architecture/shared-contract.md`。

### ClientCommand

本文は `docs/architecture/shared-contract.md`。

### ServerFrame

本文は `docs/architecture/shared-contract.md`。

### 版と互換

本文は `docs/architecture/shared-contract.md`。

## core と adapter

本文は `docs/architecture/core-and-adapter.md`。

## セッションの復元と複数化

本文は `docs/architecture/session-restore.md`。

## 会話内容と安全

本文は `docs/architecture/conversation-safety.md`（境界）、`docs/architecture/conversation-safety-chat-memory.md`（雑談の記憶）、`docs/architecture/conversation-safety-local-record.md`（手元の記録と前提）。

## 設計判断（なぜ今の形なのか）

この表は `pnpm run format` が ADR の1行目の題から書き直すので、手で直さない。

| ファイル                                                      | 判断                                                                                   |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `docs/architecture/adr/0001-render-in-browser.md`             | 描く層をブラウザ側へ移す（2026-09-13）                                                 |
| `docs/architecture/adr/0002-render-migration-tech-choice.md`  | 描く層の移行で決めた技術選択（2026-09-13〜17）                                         |
| `docs/architecture/adr/0003-orca-owns-worktree.md`            | worktree を用意するのは orca で、tsukumo はやらない（2026-09-23）                      |
| `docs/architecture/adr/0004-turn-number-from-record.md`       | ターンの通し番号は記録が持ち、位置では決めない（2026-09-22）                           |
| `docs/architecture/adr/0005-css-module-output-in-temp.md`     | CSS Modules の成果物は一時ディレクトリへ出して読み、すぐ消す（2026-09-20）             |
| `docs/architecture/adr/0006-prebuild-browser.md`              | ブラウザ側は事前に組み立てて置く（2026-09-21）                                         |
| `docs/architecture/adr/0007-vite-build-cli.md`                | 組み立ては `vite build` の CLI を子プロセスで起こす（2026-09-27）                      |
| `docs/architecture/adr/0008-sdk-instead-of-tui.md`            | Claude Code の TUI を捨て、SDK で動かす                                                |
| `docs/architecture/adr/0009-speech-via-tool.md`               | セリフはテキストの規約ではなく、ツール呼び出しで受け取る                               |
| `docs/architecture/adr/0010-report-via-tool.md`               | レポートはテキストではなく `report` ツールで受け取る                                   |
| `docs/architecture/adr/0011-separate-shell-and-app.md`        | ホスト（Orca のタブ）と中身（Web アプリ）を分ける                                      |
| `docs/architecture/adr/0012-bundle-vendor-library.md`         | 外部ライブラリは CDN から読まず、同梱して自分で配る                                    |
| `docs/architecture/adr/0013-tolerate-missing-display.md`      | 表示物が1つ欠けても起動失敗にしない                                                    |
| `docs/architecture/adr/0014-no-bundled-character-asset.md`    | キャラクター素材はリポジトリに同梱しない                                               |
| `docs/architecture/adr/0015-single-host-port.md`              | ホスト依存の操作は1つのポートにまとめる                                                |
| `docs/architecture/adr/0016-html-instead-of-terminal.md`      | 表示はターミナル描画をやめて、すべて HTML にした                                       |
| `docs/architecture/adr/0017-serve-from-local-http.md`         | HTML はローカルの HTTP サーバから配る（ファイルに書き出さない）                        |
| `docs/architecture/adr/0018-single-page-view.md`              | ビューは1枚のページにまとめる                                                          |
| `docs/architecture/adr/0019-layer-as-directory.md`            | 層をディレクトリで表し、依存の向きをテストで縛る                                       |
| `docs/architecture/adr/0020-mixed-purity-in-adapter-file.md`  | 境界のファイルの中に、外の世界に触らない関数が混じっていてよい                         |
| `docs/architecture/adr/0021-feature-state-fold-in-feature.md` | 機能だけが動かす状態の畳み方は、その機能の shared に置く（2026-09-30）                 |
| `docs/architecture/adr/0022-three-setting-homes.md`           | 設定は誰の・何に属する値かで3つの置き場に割る（2026-10-03）                            |
| `docs/architecture/adr/0023-local-diagnostic-log.md`          | 不具合の経緯は手元の1本の JSONL に、決まった語だけで残す（2026-10-04）                 |
| `docs/architecture/adr/0024-no-skill-dependency.md`           | tsukumo はワークフローの契約だけを定め、特定のスキルに依存しない（2026-10-08）         |
| `docs/architecture/adr/0025-no-project-settings.md`           | プロジェクトの設定を無くし、Beads を前提にする（2026-10-08）                           |
| `docs/architecture/adr/0026-session-claim-file.md`            | 使用中のセッションは占有ファイルとプロセスの生存で知る（2026-10-10）                   |
| `docs/architecture/adr/0027-markdown-component-entry.md`      | 会話の画面の Markdown を部品に上げるときは、遅延読み込みの口を入口にする（2026-10-10） |
| `docs/architecture/adr/0028-report-block-priority.md`         | レポートの塊は、内容の形で並べた1本の梯子を上から試して選ぶ（2026-10-12）              |
| `docs/architecture/adr/0029-usage-review-own-query.md`        | トークン消費の見直しは、会話とは別の使い捨ての `query()` で走らせる（2026-10-12）      |
| `docs/architecture/adr/0030-workflow-as-skill-sequence.md`    | ワークフローを、契約を満たすスキルの並びにする（2026-10-15）                           |
| `docs/architecture/adr/0031-report-body-as-regions.md`        | レポートの本文は欄の構造のままブラウザへ渡し、欄ごとに独立して描く（2026-10-22）       |
| `docs/architecture/adr/0032-free-html-block.md`               | モデルが自由に書いた HTML を、レポートに載せる口は持たない（2026-10-23）               |
