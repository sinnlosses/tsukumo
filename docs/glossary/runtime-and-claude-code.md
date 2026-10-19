# 用語集: 実行構成と Claude Code 側の仕組み

ステータス: **正典**。入口は `docs/glossary.md`（用語集の方針と、子のファイルの一覧）。

責務: tsukumo がどこで何として動くか（ホスト・部屋・チェックアウトなど）と、Claude Code 側の仕組み（hook・statusline・output style）の用語を持つ。
読む時: 実行の構成や、Claude Code 側の仕組みを指す語の表記に迷ったとき。
直す時: この範囲の用語を足す・識別子を変えるとき（用語はこの子に足し、親には足さない）。

## 節の索引

| 節                        | 収録している用語                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------ |
| ## 実行構成               | サイドカー / ペイン / サイドバー / ホスト / Claude Code / 部屋 / チェックアウト / Beads アダプタ |
| ## Claude Code 側の仕組み | hook / statusline / output style                                                                 |

## 実行構成

### サイドカー

- **英語識別子**: 使わない
- **定義**: **2026-09-11 の方針転換で役目を終えた語。** Claude Code とは別のペインで常駐し、
  transcript と状態ファイルを読んでビューを配るプロセスを指していた
- **注記**: いまの tsukumo は Claude Code を**動かす側**であって、横で覗くプロセスではない。
  **プロセスそのものを指したいときは「tsukumo」と書く**
- **避ける言い方**: **「サイドカー」を現在の説明に使わない**（経緯を語るときだけ使ってよい）

### ペイン

- **英語識別子**: `pane`
- **定義**: ターミナルの分割された1区画
- **注記**: **tsukumo はもうペインを分割しない**（2026-09-11）。画面は1枚のページに収まり、
  ターミナルのペインは tsukumo を起動する1つで足りる。tmux は未導入で、前提にもしない
  （`docs/history/decision.md`「ペイン分割は Orca を前提にした」に経緯がある）

### サイドバー

- **英語識別子**: `sidebar`
- **定義**: 画面レイアウトの右上に置く、幅の狭いビュー。会話ではなく「その他情報」を出す
  （`docs/requirements.md` 4.7）
- **注記**: 中身は上から **(1) タスク一覧 (2) セッション情報** の2区画
  （`docs/architecture/display.md` 4.2）。コンテキスト使用量は出さない。**「いま何をしているか」の区画は
  2026-09-23 に帯の「いまの作業」へ移した**（`docs/architecture/screen-design.md` 13.9）
- **注記**: **雑談中は中身が差し替わる**（2026-09-23）: 上から **プロフィール・最近の話題・
  覚えていること・セッション** の4段で、タスク一覧は出さない（`docs/architecture/screen-design.md` 13.7「雑談のときの
  サイドバー」）
- **注記**: **レポートやセリフはここに出さない**（同じものを2箇所に出さないため）
- **注記**: **中くらいの窓幅（761〜1100px）では柱（英語識別子 `rail`。CSS は `layout-rail`）に畳む**。
  柱の口を押すと、サイドバーがメインビューの上に重なって開く（`docs/architecture/screen-design.md` 13.4）
- **注記**: **狭い画面（760px 以下）では出さず、区画は引き出しのタブに入る**（2026-10-09。タスク一覧は「タスク」、
  雑談の4段は「話題」、目盛りとプラン使用量は「使用量」。`docs/architecture/screen-design.md` 13.9「狭い画面（760px 以下）」）
- **避ける言い方**: 情報パネル、ステータスペイン、HUD

### ホスト

- **英語識別子**: `host`
- **定義**: tsukumo のページを出す相手。実測環境では Orca（ページを開くブラウザタブも含めて指す）。
  ページ自体は「どのホストでも動く Web アプリ」として作る。**頼む仕事はビューを見せること
  （`showView`）とファイルを開くこと（`openFile`）だけ**で、それ以外の依存は持たない
  （`docs/architecture/adr/0011-separate-shell-and-app.md`）
- **注記**: ホストに依存する操作は1つのポート（`src/server/host/core/host.ts`）の裏に置き、実装は
  アダプタ（`src/server/host/adapter/orca-host.ts` と、何も開かない `none-host.ts`）に閉じ込める。
  どれを使うかは `TSUKUMO_HOST` で選ぶ
  （`docs/architecture/adr/0015-single-host-port.md`。「アダプタ」の項は「通信（移行後）」にある）
- **注記**: **「Claude Code」とは別のもの**。Claude Code は CLI を指す
- **避ける言い方**: 箱（ホストに統合した旧称）、端末環境、プラットフォーム、シェル、コンテナ（別の意味に取られる）、ラッパー

### Claude Code

- **英語識別子**: 使わない（コード上に Claude Code を指す識別子は現れない）
- **定義**: Claude Code の CLI そのもの。**tsukumo から見て、SDK が子プロセスとして起こす側**
  （2026-09-11 まではこちらが親で、transcript を書き出す側だった）
- **避ける言い方**: 本体（Claude Code の旧称。「本体のチェックアウト」は別の意味で、チェックアウトの項にある）、親、ホスト、メイン

### 部屋

- **英語識別子**: `room`（名前は `roomName(viewPort)`。`src/shared/view-server/room.ts`）
- **定義**: 起こした tsukumo 1つの居場所。**ビューのポート1つが部屋1つ**で、同じディレクトリで
  2つめを起こすとポートがずれて別の部屋になる
- **注記**: 名前は和の色名12個をポートの並び順に割り当てたもの（7327 が「空色の間」。
  `docs/architecture/screen-design.md` 13.9）で、**語彙の外のポートはポート番号をそのまま名乗る**。
  **名前は画面（帯の左端）のためだけのもので、セッションの目印はポート番号のまま**。
  帯の主の字は作業ディレクトリの名前（`repository.projectName`）で、部屋の名前はその右の補足の字。
  キャラクターの持ち物ではないので、語彙はパックの定義ファイルではなくコード側にある。
  **切り替え画面の行には出さない**（一覧は部屋で絞らず、部屋はポートで決まる起動順の番号なので
  行の見分けに使わない。行を見分けるのは作業ツリーの名前と短縮IDと SDK の見出し。
  `docs/architecture/screen-design.md`「切り替え画面」）
- **避ける言い方**: ルーム、ワークスペース、インスタンス

### チェックアウト

- **英語識別子**: `checkout`（`src/server/checkout/`）
- **定義**: tsukumo のリポジトリの作業ツリー1つ。本体の checkout と `tsukumo-N` の作業ツリーが
  どれもチェックアウトで、**ディレクトリの根の `package.json` の `name` が `tsukumo` のもの**
- **注記**: グローバルの `tsukumo` は本体のチェックアウトの `bin/tsukumo` を指すが、
  チェックアウトの中で打ったときは、そのチェックアウトの `bin/tsukumo` へ委ねる。
  切り替え画面の行に出る**作業ツリーの名前**（`SessionChoice.worktree`）は、セッションの `cwd` の
  末尾のディレクトリ名（無ければ `gitBranch`）で、tsukumo のリポジトリに限らず同じリポジトリの作業ツリーを指す
- **避ける言い方**: ワークツリー（`git worktree` の語を指すときだけ使う）、クローン

### Beads アダプタ

- **英語識別子（予定）**: `beadsTask`（`src/server/**/adapter/` の Beads を読むファイルに置く）
- **定義**: Beads の課題を、組み込みの欄（ID・題・状態・依存・作った時刻と閉じた時刻・`external_ref`・`labels`・
  `description`・`acceptance_criteria`・`notes`）と、metadata の `difficulty`（`haiku`・`sonnet`・`opus`）・
  `loopable`（`Y`・`N`。無い・不正なら無し）だけからタスク一般の形（`TaskSummaryItem`・`DoneTask`。
  `src/shared/repository/task-summary.ts`）へ写す境界。状態は `open` → todo・`in_progress` → doing・
  `deferred` → hold・`closed` → done に写し、ほかの値は生のまま
- **注記**: 属性は metadata の2つに限り、label からは読まない。タスク一般の形は属性を `difficulty`・`loopable` の2欄で持つ（おすすめの選びには使わない）。
  ラベルは字のまま並べるだけで解釈せず、担当（`assignee`）は読まない。特定のスキルが課題に足した独自の状態・本文の節の書式・ID の書き換えは読まない
  （`docs/architecture/adr/0024-no-skill-dependency.md`）。一覧・成果・おすすめは写したあとのタスク一般の形だけを読む
- **避ける言い方**: Beads の読み口（Beads アダプタの旧称）、task-model 方式（スキルの名前で、tsukumo はスキルの規則を写さない）、Beads の形

## Claude Code 側の仕組み

### hook

- **英語識別子（予定）**: `hook`
- **定義**: Claude Code が特定のイベント（`SessionStart` / `PreToolUse` / `Stop` など）で
  実行する外部コマンド
- **注記**: **tsukumo は hook を使わない**（2026-09-11）。状態はすべて SDK のイベントで届く。
  以前は状態ファイルを書くために使っていた
- **注記**: hook の stdout はエスケープされてテキスト扱いになるため、そこから描画はできない
  （`docs/requirements.md`「3. 技術制約」）。登録先の `~/.claude/settings.json` は
  **orca が専有しているので上書きしない**

### statusline

- **英語識別子（予定）**: `statusline`
- **定義**: Claude Code の入力欄下に出る1行の表示。ここに小さいマスコットを出すのが案B
- **注記**: 現状 orca が専有している。優先度は低く、MVPには含めない

### output style

- **英語識別子**: 使わない
- **定義**: Claude Code の応答の人格・口調を定義する設定。実測環境では `Asuna` が有効
- **注記**: **`speak` を呼ぶタイミングの規約もここに書く**（`docs/architecture/display.md` 4.2）
- **注記**: **人格は毎ターン `systemPrompt` の append として渡っている**
  （`src/server/session-driver/adapter/sdk-driver.ts` が `{ type: "preset", preset: "claude_code", append }` を組む）。
  2026-09-11 のスパイクで確かめてあり、未決ではない
