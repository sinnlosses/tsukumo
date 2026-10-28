# アーキテクチャ詳細

ステータス: **正典**。

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

| 知りたいこと                                     | 見る場所                                           |
| ------------------------------------------------ | -------------------------------------------------- |
| 各関数の引数・戻り値・分岐条件                   | **コード側のドキュメンテーションコメントが正典**   |
| 何をどこに置くか                                 | 「新しいコードを置く場所」（原則1〜5の本文もここ） |
| なぜ今の形なのか（別の形に直そうとする前に読む） | 「設計判断（なぜ今の形なのか）」                   |
| 描画結果をどう検証するか                         | `docs/architecture/testing.md`「手で確かめること」 |
| 要件そのもの（やること・やらないこと）           | `docs/requirements.md` が正典                      |

**各関数の詳しい振る舞いはコード側のコメントが正典。** ここには1〜2行の責務の要約と、
コードを読んでも分からないこと（なぜその置き場所なのか、なぜその案を採らなかったのか）だけを書く。

### このファイルは目次

このファイルは子のファイルの目次と設計判断の ADR の表を持つ入口で、本文は子のファイル
（`docs/architecture/`）にある。下の目次で子を1つ特定し、その子のファイルを丸ごと読む。

**このファイルには「いまどうなっているか」だけを書く。** 却下した案の理由・値の根拠の実測・
覆した決定の記録は `docs/history/` に置き、ここからは1行で参照する（日付は書かない。検査は `test/scripts/document/date-mention.test.ts`）。何を残して何を移すかの表は
`docs/requirements.md`「正典に残すもの・`docs/history/` へ移すもの」。

## 目次

この表は `pnpm run format` が子のファイルの責務の行から書き直すので、手で直さない。

| ファイル                                       | 説明                                                                                                                                                                                                                                                |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/architecture/browser-box.md`             | `src/browser/` の箱ごとに置くものと import してよい先、上げる・下ろす引き金、領域の機能（枠・画面）と置かれる機能の辺を持つ（ディレクトリの節の後半と、領域の機能の節）。                                                                           |
| `docs/architecture/browser.md`                 | ブラウザ側（`src/browser/`）の中の規則。                                                                                                                                                                                                            |
| `docs/architecture/build.md`                   | 事前の組み立て、作り直しを押す仕組み（HMR）、足す依存の一覧、リポジトリの外に置いたものを持つ。                                                                                                                                                     |
| `docs/architecture/character-pack.md`          | キャラクターパックの形・探索順・`systemPrompt` の append の並び、画面から書くときの                                                                                                                                                                 |
| `docs/architecture/chat-mode.md`               | レポートを出さない場としての雑談モードの仕様（遡れる幅、記憶の層と忘却、定着、                                                                                                                                                                      |
| `docs/architecture/code-placement.md`          | 新しいコードを置くディレクトリの割り当てと、置き場所を決める原則1〜5の判断材料を持つ。                                                                                                                                                              |
| `docs/architecture/command-procedure.md`       | 画面からのコマンドと読み取りの手続き（oRPC）を、どの機能が受け、どの条件で断るかの置き方と、許す依存の辺を持つ。                                                                                                                                    |
| `docs/architecture/container-presenter.md`     | ブラウザ側の機能（枠・画面・置かれる機能）の中を、振る舞いの種類の数で container / presenter と `hooks/`・`domain/` に割る基準を持つ。                                                                                                              |
| `docs/architecture/conversation-safety.md`     | 会話内容と安全の表（バインド先・Origin・起動トークン・ディスク・ブラウザ側のメモリ・CSP・ログ、雑談の記憶、計測・診断の記録、手元の記録）と、テストのフィクスチャ、表のあとの前提（生の会話・127.0.0.1 の割り切り・`~/.tsukumo/` の再利用）を持つ。 |
| `docs/architecture/core-and-adapter.md`        | 判断（core）と境界（adapter）の境目、SDK に触るファイルの分け方、代の持ち物、ツールで受け取るものと使い捨ての `query()` の形など、1ファイルを読んでも分からない横断の規則を持つ。                                                                   |
| `docs/architecture/directory.md`               | リポジトリのディレクトリの木と、設定・タスク一覧の読み元の置き場、ファイル名の付け方、ページの形を持つ（ディレクトリの節の前半）。                                                                                                                  |
| `docs/architecture/display.md`                 | セリフとレポートの出力分離、レポートの記法の規約、立ち絵・吹き出し・メインビュー・                                                                                                                                                                  |
| `docs/architecture/lib-and-utils-criterion.md` | どの層の中にも作れる `lib/` と `utils/` に、tsukumo の語彙を名乗らない道具を振り分ける基準と、`utils/` の歯止めを持つ。                                                                                                                             |
| `docs/architecture/overview-and-layer.md`      | 全体構成の前置き（1つのプロセス・データの流れ3本・外へ出る経路を作らないこと・層の図）と、層と依存の向きを持つ。                                                                                                                                    |
| `docs/architecture/runtime-flow.md`            | 起動・接続・依頼・答え待ち・再接続の順序を持つ。                                                                                                                                                                                                    |
| `docs/architecture/screen-design.md`           | 見た目（色・書体・レイアウトの計画とトークン、誰が差せるか、雑談モードの画面、背景、                                                                                                                                                                |
| `docs/architecture/server-feature.md`          | `src/server/` を割る機能の一覧と、どの機能にも属さない共有の箱、機能どうしの import の規則と辺の表を持つ。                                                                                                                                          |
| `docs/architecture/session-restore.md`         | 復元を新しい形に載せる仕組みと、複数化をやらないこと、ビューの本文の持ち方と再接続を持つ。                                                                                                                                                          |
| `docs/architecture/shared-contract.md`         | サーバとブラウザが共有する契約（イベント・状態・コマンド・フレーム・版）について、コードから読み取れない決定を持つ。                                                                                                                                |
| `docs/architecture/shared-feature.md`          | `src/shared/` を割る機能の置き場と、機能の決め方・辺の規則を持つ。                                                                                                                                                                                  |
| `docs/architecture/stage-item.md`              | キャラビューの席に置くアイテムの一覧と席の選択の置き場と形、画面から足すときの受け取り方と                                                                                                                                                          |
| `docs/architecture/testing.md`                 | 対象ごとのテストの方法、E2E（走らせ方・成果物・シナリオ）、手で確かめる手順を持つ。                                                                                                                                                                 |
| `docs/architecture/workflow-contract.md`       | tsukumo がワークフロー（タスクを段に分けて送り出す手順）に対して定める契約 — 受ける口の名前と引数の意味、                                                                                                                                           |

## 設計判断（なぜ今の形なのか）

この表は `pnpm run format` が ADR の1行目の題とその次のステータスの行から書き直すので、手で直さない。
各 ADR の題の次の空でない行は `ステータス: 採用` か `置き換え済み（→ 00NN）` か `廃止`。採用後の ADR は凍結し、
判断を改めるときは本文を書き換えず新しい番号で書いて、古いほうのステータスを `置き換え済み（→ 新しい番号）` にする。

| ファイル                                                            | 判断                                                                                                  | ステータス             |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------- |
| `docs/architecture/adr/0001-render-in-browser.md`                   | 描く層をブラウザ側へ移す                                                                              | 採用                   |
| `docs/architecture/adr/0002-render-migration-tech-choice.md`        | 描く層の移行で決めた技術選択                                                                          | 採用                   |
| `docs/architecture/adr/0003-orca-owns-worktree.md`                  | worktree を用意するのは orca で、tsukumo はやらない                                                   | 採用                   |
| `docs/architecture/adr/0004-turn-number-from-record.md`             | ターンの通し番号は記録が持ち、位置では決めない                                                        | 採用                   |
| `docs/architecture/adr/0005-css-module-output-in-temp.md`           | CSS Modules の成果物は一時ディレクトリへ出して読み、すぐ消す                                          | 置き換え済み（→ 0006） |
| `docs/architecture/adr/0006-prebuild-browser.md`                    | ブラウザ側は事前に組み立てて置く                                                                      | 採用                   |
| `docs/architecture/adr/0007-vite-build-cli.md`                      | 組み立ては `vite build` の CLI を子プロセスで起こす                                                   | 採用                   |
| `docs/architecture/adr/0008-sdk-instead-of-tui.md`                  | Claude Code の TUI を捨て、SDK で動かす                                                               | 採用                   |
| `docs/architecture/adr/0009-speech-via-tool.md`                     | セリフはテキストの規約ではなく、ツール呼び出しで受け取る                                              | 採用                   |
| `docs/architecture/adr/0010-report-via-tool.md`                     | レポートはテキストではなく `report` ツールで受け取る                                                  | 採用                   |
| `docs/architecture/adr/0011-separate-shell-and-app.md`              | ホスト（Orca か既定のブラウザ）と中身（Web アプリ）を分ける                                           | 採用                   |
| `docs/architecture/adr/0012-bundle-vendor-library.md`               | 外部ライブラリは CDN から読まず、同梱して自分で配る                                                   | 採用                   |
| `docs/architecture/adr/0013-tolerate-missing-display.md`            | 表示物が1つ欠けても起動失敗にしない                                                                   | 採用                   |
| `docs/architecture/adr/0014-no-bundled-character-asset.md`          | キャラクター素材はリポジトリに同梱しない                                                              | 採用                   |
| `docs/architecture/adr/0015-single-host-port.md`                    | ホスト依存の操作は1つのポートにまとめる                                                               | 採用                   |
| `docs/architecture/adr/0016-html-instead-of-terminal.md`            | 表示はターミナル描画をやめて、すべて HTML にした                                                      | 採用                   |
| `docs/architecture/adr/0017-serve-from-local-http.md`               | HTML はローカルの HTTP サーバから配る（ファイルに書き出さない）                                       | 採用                   |
| `docs/architecture/adr/0018-single-page-view.md`                    | ビューは1枚のページにまとめる                                                                         | 採用                   |
| `docs/architecture/adr/0019-layer-as-directory.md`                  | 層をディレクトリで表し、依存の向きをテストで縛る                                                      | 置き換え済み（→ 0037） |
| `docs/architecture/adr/0020-mixed-purity-in-adapter-file.md`        | 境界のファイルの中に、外の世界に触らない関数が混じっていてよい                                        | 採用                   |
| `docs/architecture/adr/0021-feature-state-fold-in-feature.md`       | 機能だけが動かす状態の畳み方は、その機能の shared に置く                                              | 採用                   |
| `docs/architecture/adr/0022-three-setting-homes.md`                 | 設定は誰の・何に属する値かで3つの置き場に割る                                                         | 置き換え済み（→ 0025） |
| `docs/architecture/adr/0023-local-diagnostic-log.md`                | 不具合の経緯は手元の1本の JSONL に、決まった語だけで残す                                              | 採用                   |
| `docs/architecture/adr/0024-no-skill-dependency.md`                 | tsukumo はワークフローの契約だけを定め、特定のスキルに依存しない                                      | 採用                   |
| `docs/architecture/adr/0025-no-project-settings.md`                 | プロジェクトの設定を無くし、Beads を前提にする                                                        | 採用                   |
| `docs/architecture/adr/0026-session-claim-file.md`                  | 使用中のセッションは占有ファイルとプロセスの生存で知る                                                | 採用                   |
| `docs/architecture/adr/0027-markdown-component-entry.md`            | 会話の画面の Markdown を部品に上げるときは、遅延読み込みの口を入口にする                              | 採用                   |
| `docs/architecture/adr/0028-report-block-priority.md`               | レポートの塊は、内容の形で並べた1本の梯子を上から試して選ぶ                                           | 置き換え済み（→ 0038） |
| `docs/architecture/adr/0029-usage-review-own-query.md`              | トークン消費の見直しは、会話とは別の使い捨ての `query()` で走らせる                                   | 採用                   |
| `docs/architecture/adr/0030-workflow-as-skill-sequence.md`          | ワークフローを、契約を満たすスキルの並びにする                                                        | 採用                   |
| `docs/architecture/adr/0031-report-body-as-regions.md`              | レポートの本文は欄の構造のままブラウザへ渡し、欄ごとに独立して描く                                    | 採用                   |
| `docs/architecture/adr/0032-free-html-block.md`                     | モデルが自由に書いた HTML を、レポートに載せる口は持たない                                            | 採用                   |
| `docs/architecture/adr/0033-timeline-block.md`                      | 時刻の軸に行ごとの帯を並べる図は、`timeline` の塊として HTML で描く                                   | 採用                   |
| `docs/architecture/adr/0034-figure-description-drawn-by-tsukumo.md` | 図は書き手が構造を記述し、tsukumo が決まった配色と配置規則で描く                                      | 採用                   |
| `docs/architecture/adr/0035-optional-figure-plugin.md`              | 既存の塊で描けない図は、任意の同梱プラグインのスキルが撮った PNG を `image` の塊で載せる              | 採用                   |
| `docs/architecture/adr/0036-optional-figure-and-preference.md`      | `report` の `figure` は省ける欄にし、図を置くかの既定は利用者の設定に持つ                             | 採用                   |
| `docs/architecture/adr/0037-dependency-cruiser-edge-check.md`       | 層と機能の辺の検査を dependency-cruiser の宣言に移す                                                  | 採用                   |
| `docs/architecture/adr/0038-declare-then-decide-form.md`            | `report` は問いと数を申告させて形は決定表が決め、本文は `body` で受け、差し戻しは文法と数の整合に絞る | 採用                   |
| `docs/architecture/adr/0039-report-via-a2ui-catalog.md`             | `report` を A2UI のカタログとメッセージで受けて描く                                                   | 採用                   |
| `docs/architecture/adr/0040-report-staged-drawing.md`               | `report` の `a2ui` の版を、部品が閉じるたびに草稿として描く                                           | 採用                   |
