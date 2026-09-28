# アーキテクチャ詳細

## このドキュメントの読み方

| 知りたいこと                                     | 見る場所                                                                                                                   |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| 各関数の引数・戻り値・分岐条件                   | **コード側のドキュメンテーションコメントが正典**                                                                           |
| 何をどこに置くか                                 | 「新しいコードを置く場所」（原則の要約はCLAUDE.mdに）                                                                      |
| なぜ今の形なのか（別の形に直そうとする前に読む） | 「設計判断（なぜ今の形なのか）」                                                                                           |
| 描画結果をどう検証するか                         | `docs/architecture/testing.md`「手で確かめること」                                                                         |
| 要件そのもの（やること・やらないこと）           | `docs/requirements.md` が正典                                                                                              |
| コードを1ファイル読んでも分からない構造の規則    | **`docs/design.md` が正典**（層と機能の辺・置き場所の基準・プロトコルの不変条件・動きの順序・安全の境界。2026-09-26 決定） |

**各関数の詳しい振る舞いはコード側のコメントが正典。** ここには1〜2行の責務の要約と、
コードを読んでも分からないこと（なぜその置き場所なのか、なぜその案を採らなかったのか）だけを書く。

### このファイルは通読しない … まだ

現時点では小さいので通読してよい。**30KBを超えたら**、下の索引で節を1つ特定して、
その節だけを次の形で読む運用に切り替える（見出し名で切り出すので、行番号と違って編集で腐らない）:

```bash
sed -n '/^## 新しいコードを置く場所/,/^#\{2,4\} /p' docs/architecture.md
```

### 節の索引

| 節                              | 中身                                                          |
| ------------------------------- | ------------------------------------------------------------- |
| ## 採用アーキテクチャ           | 全体像の図と、データの流れ3本                                 |
| ## SessionState                 | サーバとブラウザが同じ形で回す畳み込み                        |
| ## core と adapter              | 外の世界（SDK・ホスト）に触る境界の規則                       |
| ## セッションの復元と複数化     | ビューの本文の持ち方と再接続                                  |
| ## 会話内容と安全               | 会話データの扱いと配信範囲の前提                              |
| ## 新しいコードを置く場所       | 原則1〜5の判断材料                                            |
| ## 設計判断（なぜ今の形なのか） | 今の形を別の形に直そうとする前に、一覧から該当する ADR を読む |

## 採用アーキテクチャ

**全体図とデータの流れの正典は `docs/design.md`「2. 全体構成」「3. 動きの流れ」。** ここには
要点だけ書く。

tsukumo は**1つのプロセス**で、Agent SDK（`@anthropic-ai/claude-agent-sdk`）で Claude Code を
子プロセスとして起こし、受け取ったイベントを `shared` の型で `core` が畳み、WebSocket 1本で
`browser`（ブラウザの React の部品）へ配る。**Claude Code の TUI は開かない**ので、利用者が見るのは
tsukumo の画面だけになる。

データの流れは3本ある。

1. **入力欄 → セッション駆動**: `<Composer>` がコマンドの手続き（`session.prompt` /
   `session.interrupt` など）を WebSocket の上で呼び、`session` の行が駆動（SDK または fake driver）へ
   渡す（`docs/design.md` 2章「コマンドの受け手と手続きの置き方」）
2. **イベント → 各ビュー**: `assistant` のテキストはメインビューの**レポート**、`speak` の
   引数はキャラビューの**セリフと表情**、`tool_use` / `tool_result` はサイドバーの**進行**に
   なる。`applySessionEvent` で畳んだ `SessionState` を、サーバとブラウザが同じ形で持つ
   （`docs/design.md` 4章）
3. **`canUseTool` → 答え待ち → ボタン → 回答**: 許可プロンプトと `AskUserQuestion` はどちらも
   `canUseTool` に届く。tsukumo は答え待ちの状態にして**入力欄の上**にボタンを出し（キャラは
   吹き出しで聞くだけ）、押された結果を `canUseTool` の戻り値として SDK へ返す

**外へ出る経路は作らない。** SDK は claude を子プロセスとして起こすだけ、`speak` は tsukumo の
プロセス内の MCP サーバ（戻り値は `"ok"` だけ）、ビューは `127.0.0.1` にだけバインドする。
**会話は tsukumo のプロセスの外へ出さない**（`docs/coding-standards.md`「会話内容の扱い」）。

実際の画面はメインビュー・キャラビュー・サイドバー・入力欄の4領域が**1枚のページ**に入る
（`docs/requirements.md` 4.7 が正典）。

## SessionState

**`session-state.ts` は純粋な畳み込み。** 姿から導くだけのもの（メインビューに出す形・`/`
補完の候補）は `main-view.ts` / `command-suggestion.ts` に分けてある。状態を持つのはサーバ側の `session-manager` と
ブラウザ側（`browser/stores/session.ts` の zustand の store）だけで、「イベント1件でどう変わるか」はすべてここのテストで守れる。

## core と adapter

- **`sdk-message.ts` は SDK の型を import しない。** 依存を機能の `adapter/` 直下の `sdk-` で始まる
  ファイルに閉じるため、届くメッセージは `unknown` で受けて検証する（外部由来の値なので、どのみち構造は
  信用しない）。おかげで変換のテストは SDK を起動しない
- **`speak` のセリフは MCP の handler ではなく `assistant` メッセージの変換から取り出す。**
  handler は `"ok"` を返すだけにして、イベントの流れを1本に保つ
- **SDK のイベント種別は増えうる。** 旧方針で transcript の `type` が実際に増えたのを観測して
  いる（2026-09-08 → 2026-09-09 で5種類増えた）。**知らないものは無視して落ちないこと**
- **ホストのポートにあるのは `showView` と `openFile` の2つ**（2026-09-12 にペインの分割・
  文字送信・キー送信を撤去し、2026-09-24 に `openFile` を足した）。ここに操作を足す前に、
  ページ側で完結しない理由があるかを確かめる
- **Orca はエージェント端末への合成入力を弾く**（2026-09-11 実測）。`orca terminal send` も
  `orca keypress` も claude の端末には届かない。**この経路に戻ろうとしないこと**

## セッションの復元と複数化

- **ビューの本文はメモリにしかない。** プロセスを落とすとブラウザのタブは繋ぎ先を失う
  （WebSocket が指数バックオフで繋ぎ直し続ける。`docs/design.md` 3章「再接続」）。起動し直せば
  同じ URL でそのまま復帰し、**前の続きから始まる**（claude 側の会話は `resume`、画面の履歴は
  transcript の読み直しで戻る。`docs/requirements.md` 4.8）

## 会話内容と安全

- **SDK のイベントはユーザーの生の会話である。** 本文・ツールの入出力・`speak` の引数を、
  別の場所に複製しない、外部に送らない、ログに丸ごと出さない
  （`docs/coding-standards.md`「会話内容の扱い」）。**「複製しない」に認められた例外は
  雑談モードの3つだけ**（あらすじ・会話のアーカイブ・エピソード索引）で、範囲は同じ節の表が正典。
  **本文・ツールの入出力はその例外に入らない**
- **ビューは 127.0.0.1 に配られるので、同じマシンの他のプロセスからは読める。** 単一利用者の
  開発機を前提にした割り切りで、外からは届かないことだけを保証している。認証を足すより先に、
  この前提が変わっていないかを確認する
- **`~/.tsukumo/` は旧方針の hook が使っていた置き場を再利用している**（2026-09-15 に整理）。
  `state.json` は当時「イベント種別とモデル名」を書く場所で、いまは**次に起こすときの初期値**
  （覚えたキャラクターの名前と、新しいセッションの既定。`src/server/session/adapter/remembered-default.ts`）。**形の違う古いファイルが残っていると読めずに既定のパックへ
  落ちる**（旧形式の `state.json` が残っていたせいで、前回選んだキャラクターを覚える仕組みを
  入れた直後の1回だけ意図しないキャラクターで立ち上がった）。旧方針の残骸（`targets/`・`transcript-path`・書きかけの
  `state.json.tmp.*`）は消してある。**同じ置き場に別の用途を足すときは、先に何が残っているかを見る**

## 新しいコードを置く場所

**新しいコードは `src/shared/` / `src/server/<機能>/core/` / `src/server/<機能>/adapter/` /
`src/browser/` に置く**（`docs/design.md` 2章）。**層の名前は「どの実行環境で動くか」を表す**
（2026-09-20。`docs/history/architecture-placement.md`）。サーバ側は**まずどの機能かを決め**
（機能の一覧は `docs/design.md` 2章「サーバの機能と、機能どうしの辺」）、**外の世界（SDK・
HTTP/WebSocket・ホスト・ファイル・子プロセス）に触るならその機能の `adapter/`、触らない判断なら
`core/`。** どの機能にも属さず2つ以上の読み手を持つものだけ、共有の `src/server/core/` /
`src/server/adapter/` の直下に置く。

ディレクトリの割り当ては次のとおり。

| 置き場所                     | 実行場所         | 何を置くか                                                                                                                                        |
| ---------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/`                       | —                | tsukumo 本体。直下は配線（`cli.ts` が入口、`main.ts` が起動の段取り。サーバで動く）                                                               |
| `src/shared/`                | サーバとブラウザ | 語彙・イベント・状態・畳み込み・コマンドとフレーム。**両側が読む契約**                                                                            |
| `src/server/<機能>/core/`    | サーバ（Node）   | その機能の純粋な判断。`node:` / SDK / `ws` を import しない。共有のものは `src/server/core/` の直下                                               |
| `src/server/<機能>/adapter/` | サーバ（Node）   | その機能の外の世界に触る境界。1ファイル = 1つの境界（SDK・HTTP・fs・子プロセス）。共有のものは `src/server/adapter/` の直下                       |
| `src/browser/`               | ブラウザ         | ブラウザ側の React の部品。中は `features/` `components/` `hooks/` `lib/` `utils/` `stores/` `styles/`（箱ごとの置くものは `docs/design.md` 2章） |
| `test/`                      | —                | テスト。`src/<相対パス>.ts` → `test/<相対パス>.test.ts` で対応させる                                                                              |
| `characters/`                | —                | キャラクター定義とサンプル素材                                                                                                                    |
| `scripts/`                   | —                | 開発・調査用のスクリプト。本体から呼ばれない                                                                                                      |

**`scripts/` は本体から呼ばれない調査用の道具置き場**（端末の実測幅を測るプローブなど）。
`src/` に混ぜると「tsukumo が動くのに必要なもの」と区別がつかなくなる。

置き場所の判断は次の原則で決める。**まだ存在しないディレクトリは、必要になったときに作る**
（空のディレクトリを先に切らない）。

- **原則1**: **Claude Code の TUI を使わない。** TUI には割り込めないので、パイプ・hook の
  stdout・本体へのパッチを経路にせず、SDK で動かす側に回る。理由は
  `docs/requirements.md`「3. 技術制約」
- **原則2**: **両側で共有する契約（`shared`）／サーバ（`core` と `adapter`）／
  クライアント（`browser`）に分け、層をディレクトリで表す**（詳細と理由の正典は
  `docs/design.md` 2章）。サーバ側は機能ごとのディレクトリ（`src/server/<機能>/`）の中で
  `core` と `adapter` に割り、機能どうしの辺は `docs/design.md` 2章の表にある組だけにする。`shared` に置くのは両側の契約と、`SessionState` から純粋に導ける
  ものだけで、「受け取る／決める／描く」という役割の分割ではない。**サーバ側は判断（`core`）と
  外の世界に触る境界（`adapter`）に割れていて、`core → adapter` は禁止**（結ぶのは `src/` 直下の
  配線だけ）。**許した依存の辺以外は `test/architecture.test.ts` が落とす**
- **原則3**: ホスト（ターミナル環境）・外部コマンド・OSに依存するものは
  **`adapter/`（機能の中か共有の箱）の1ファイルに閉じ込める**（1ファイル = 1つの境界）。ホストが Orca から
  別のものに変わっても、差し替えがここだけで済むようにする
  （`docs/architecture/adr/0015-single-host-port.md`）。**Agent SDK
  （`@anthropic-ai/claude-agent-sdk`）だけは、1つの境界が1ファイルに収まらない**（駆動の本体・
  tsukumo のツール・セッションの一覧と印・コンテキストの内訳）ので、**import してよい先を
  ファイル名で決める: 機能の `adapter/` 直下の `sdk-` で始まるファイルだけ**（いまは
  `session-driver/` と `visit/`）。一覧ではなく
  名前で決めるのは、ファイルを足しても検査を直さずに済み、名前で SDK の境界を名乗らずに import
  すれば `test/architecture.test.ts` が落とすから。`adapter/sdk/` のようなディレクトリに切らない
  のは、`adapter/` の直下が境界の並びで、その下の段は境界を名乗らない `lib/` だけと決めてある
  から（`docs/design.md` 2章「`lib/` と `utils/` に置く基準」）。**SDK の境界を1つの機能にまとめない**
  のは、訪問の台本を書かせる使い捨ての `query()` が訪問の判断とだけ組になっていて、駆動の側に
  置くと訪問を追うのに2つの機能を開くことになるから
- **原則4**: **キャラクターの中身をコードに書かない。** 立ち絵のパス、表情と hook イベントの
  対応、モデルと衣装の対応は定義ファイル側に置く。コードは定義を解釈するだけにする
- **原則5**: 1ファイルにまとめるか分けるかは、行数でも関数の数でもなく
  「**ファイル名が概念になっているか**」で決める。`helpers.ts` / `utils.ts` / `common.ts` のような
  **置き場所を名前にしたファイルは作らない**。**ファイルは単数形**にし、複数は「複数返す」
  関数名の側で表す（`unfinishedTaskIds`）。ディレクトリ名には単数形の縛りを掛けず、置き場所の
  ディレクトリは bullet-proof-react の名前をそのまま使う（2026-09-26）。
  **`presentational-<機能>.tsx` は container と対になっているときだけ例外として許す**
  （`docs/design.md` 2章「機能の中を分ける」）。**箱ごとに何を置くか・`lib/` と `utils/` の
  どちらに置くかは `docs/design.md` 2章「ディレクトリ」「`lib/` と `utils/` に置く基準」が正典**
  （ここには二重に書かない）

**境界のファイルの中に、外の世界に触らない関数が混じっていてよい**（層は「外の世界に触るか」で
決め、ファイルの中身の純度で割り直さない。`docs/architecture/adr/0020-mixed-purity-in-adapter-file.md`）。

## 設計判断（なぜ今の形なのか）

| ファイル                                                     | 判断                                                                         |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `docs/architecture/adr/0001-render-in-browser.md`            | 描く層をブラウザ側へ移す（2026-09-13）                                       |
| `docs/architecture/adr/0002-render-migration-tech-choice.md` | 描く層の移行で決めた技術選択（2026-09-13〜17）                               |
| `docs/architecture/adr/0003-orca-owns-worktree.md`           | worktree を用意するのは orca で、tsukumo はやらない（2026-09-23）            |
| `docs/architecture/adr/0004-turn-number-from-record.md`      | ターンの通し番号は記録が持ち、位置では決めない（2026-09-22）                 |
| `docs/architecture/adr/0005-css-module-output-in-temp.md`    | CSS Modules の成果物は一時ディレクトリへ出して読み、すぐ消す（2026-09-20）   |
| `docs/architecture/adr/0006-prebuild-browser.md`             | ブラウザ側は事前に組み立てて置く（2026-09-21）                               |
| `docs/architecture/adr/0007-vite-build-cli.md`               | 組み立ては `vite build` の CLI を子プロセスで起こす（2026-09-27）            |
| `docs/architecture/adr/0008-sdk-instead-of-tui.md`           | Claude Code の TUI を捨て、SDK で動かす                                      |
| `docs/architecture/adr/0009-speech-via-tool.md`              | セリフはテキストの規約ではなく、ツール呼び出しで受け取る                     |
| `docs/architecture/adr/0010-report-via-tool.md`              | レポートはテキストではなく `report` ツールで受け取る                         |
| `docs/architecture/adr/0011-separate-shell-and-app.md`       | 箱（Orca のタブ）と中身（Web アプリ）を分ける                                |
| `docs/architecture/adr/0012-bundle-vendor-library.md`        | 外部ライブラリは CDN から読まず、同梱して自分で配る                          |
| `docs/architecture/adr/0013-tolerate-missing-display.md`     | 表示物が1つ欠けても起動失敗にしない                                          |
| `docs/architecture/adr/0014-no-bundled-character-asset.md`   | キャラクター素材はリポジトリに同梱しない                                     |
| `docs/architecture/adr/0015-single-host-port.md`             | ホスト依存の操作は1つのポートにまとめる                                      |
| `docs/architecture/adr/0016-html-instead-of-terminal.md`     | 表示はターミナル描画をやめて、すべて HTML にした                             |
| `docs/architecture/adr/0017-serve-from-local-http.md`        | HTML はローカルの HTTP サーバから配る（ファイルに書き出さない）              |
| `docs/architecture/adr/0018-single-page-view.md`             | ビューは1枚のページにまとめる                                                |
| `docs/architecture/adr/0019-layer-as-directory.md`           | 層をディレクトリで表し、依存の向きをテストで縛る                             |
| `docs/architecture/adr/0020-mixed-purity-in-adapter-file.md` | 境界のファイルの中に、外の世界に触らない関数が混じっていてよい（2026-09-16） |
