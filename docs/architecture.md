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
| 何をどこに置くか                                 | 「新しいコードを置く場所」（原則の要約はCLAUDE.mdに） |
| なぜ今の形なのか（別の形に直そうとする前に読む） | 「設計判断（なぜ今の形なのか）」                      |
| 描画結果をどう検証するか                         | `docs/architecture/testing.md`「手で確かめること」    |
| 要件そのもの（やること・やらないこと）           | `docs/requirements.md` が正典                         |

**各関数の詳しい振る舞いはコード側のコメントが正典。** ここには1〜2行の責務の要約と、
コードを読んでも分からないこと（なぜその置き場所なのか、なぜその案を採らなかったのか）だけを書く。

### このファイルは通読しない

節を1つ特定して、その節だけを次の形で読む:

```bash
sed -n '/^## shared/,/^## /p' docs/architecture.md
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
| ## 会話内容と安全               | `127.0.0.1`・Origin・起動トークン・ディスクに書く3つの例外と読み戻す口・定着・ブラウザ側のメモリ                                                                      |
| ## 設計判断（なぜ今の形なのか） | 今の形を別の形に直そうとする前に、一覧から該当する ADR を読む                                                                                                         |

## 全体構成

tsukumo は**1つのプロセス**で、Agent SDK（`@anthropic-ai/claude-agent-sdk`）で Claude Code を
子プロセスとして起こし、受け取ったイベントを `shared` の型で `core` が畳み、WebSocket 1本で
`browser`（ブラウザの React の部品）へ配る。**Claude Code の TUI は開かない**ので、利用者が見るのは
tsukumo の画面だけになる。

データの流れは3本ある。

1. **入力欄 → セッション駆動**: `<Composer>` がコマンドの手続き（`session.prompt` /
   `session.interrupt` など）を WebSocket の上で呼び、`session` の行が駆動（SDK または fake driver）へ
   渡す（「コマンドの受け手と手続きの置き方」）
2. **イベント → 各ビュー**: `assistant` のテキストはメインビューの**レポート**、`speak` の
   引数はキャラビューの**セリフと表情**、`tool_use` / `tool_result` はサイドバーの**進行**に
   なる。`applySessionEvent` で畳んだ `SessionState` を、サーバとブラウザが同じ形で持つ
   （「shared」）
3. **`canUseTool` → 答え待ち → お伺い → 回答**: 許可プロンプトと `AskUserQuestion` はどちらも
   `canUseTool` に届く。tsukumo は答え待ちの状態にして**メインビューのお伺いの札**に選択肢を出し（キャラは
   吹き出しで聞くだけ）、選ばれた答えを `canUseTool` の戻り値として SDK へ返す

**外へ出る経路は作らない。** SDK は claude を子プロセスとして起こすだけ、`speak` は tsukumo の
プロセス内の MCP サーバ（戻り値は `"ok"` だけ）、ビューは `127.0.0.1` にだけバインドする。
**会話は tsukumo のプロセスの外へ出さない**（`docs/coding-standards.md`「会話内容の扱い」）。

実際の画面はメインビュー・キャラビュー・サイドバー・入力欄の4領域が**1枚のページ**に入る
（`docs/requirements.md` 4.7 が正典）。

```
browser（React。状態 = shared の SessionState、reducer はサーバと同じ物）
   ▲ ServerFrame（hello の snapshot / events）      │ コマンドの手続き（oRPC）
   │        WebSocket 1本（127.0.0.1、起動トークン付き）▼
server/<機能>/core（純粋な判断。外の世界に触らない）
   ▲ 呼ばれる                                      │ core を import する
server/<機能>/adapter（外の世界に触る場所。1ファイル = 1境界。SDK は sdk-* のファイル群）
   ▲ SDKMessage                                    │ query / interrupt / canUseTool
Claude Code（SDK が起こす子プロセス）

shared（語彙・イベント・状態・reducer・zod スキーマ）は browser と core の両方が import する。
辺は adapter ──▶ core ──▶ shared ◀── browser（core → adapter は禁止。結ぶのは src/ 直下と src/wiring/ の配線だけ）
```

### 層と依存の向き

**この形は「共有コントラクト＋クライアント/サーバ分割」**。`shared` は TypeScript のモノレポでいう
`packages/shared` / `contracts` の位置（サーバとブラウザの両方が import する契約）、`browser` は
クライアント、`core` と `adapter` はサーバで、「どちらの実行環境で動くか」で分けている。
**サーバ側だけをもう一段、「純粋な判断（`core`）」と「外の世界に触る境界（`adapter`）」に割り**、
その割りは**機能の中**に置く（`server/<機能>/core/` と `server/<機能>/adapter/`。どの機能にも属さない
共有のものだけを `server/core/` と `server/adapter/` の直下に残す）。**`core` と `adapter` という名前は
どの深さでも層だけを表す。** 比べた案は `docs/research/architecture-proposal.md` /
`docs/history/architecture-placement.md` / `docs/history/decision.md`「design.md 2. 全体構成 /
ディレクトリ（`src/server/` を機能で割った）」。

**層はパッケージ（pnpm workspace）には割らない。** `package.json` は1つのまま、層をディレクトリで表す。
パッケージの境界が足す検査は「宣言していない依存を解決できない」ことだけで、辺の検査は割っても
`test/architecture.test.ts` が要るため。比べた案と、割る目安は `docs/research/package-split.md`。

| 層               | 置くもの                                                                                                                                                                                                                                                                                        | import してよい先                                       | 実行場所         |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ---------------- |
| `shared`         | 概念の語彙・`SessionEvent`・`SessionState`・`applySessionEvent`・コマンドとフレームの zod・手続きの契約。**`SessionState` から純粋に導けるもの**も含む（ブラウザしか読まないものを含む。`main-view.ts` `turn-step.ts` `turn-speech.ts` `portrait-motion.ts` `room.ts` `command-suggestion.ts`） | `shared` のみ（`zod`・`@orpc/contract`・`remeda` は可） | サーバとブラウザ |
| `server/core`    | サーバ側の純粋な判断。セッション管理・駆動の契約・イベントの検証・ポートの決定・設定の解釈。**`server/<機能>/core/` と、共有の `server/core/`**                                                                                                                                                 | `shared` / `core`                                       | サーバ（Node）   |
| `server/adapter` | 外の世界に触る場所。SDK・WebSocket・HTTP・ホスト・ファイル・子プロセス・fake driver。**`server/<機能>/adapter/` と、共有の `server/adapter/`**                                                                                                                                                  | `shared` / `core` / `adapter`                           | サーバ（Node）   |
| `browser`        | React の部品・hooks・CSS・Markdown の変換                                                                                                                                                                                                                                                       | `shared`（React などの npm は可）                       | ブラウザ         |
| `src/` 直下      | 配線（composition root。`cli.ts` / `main.ts` と起動の段取り。機能ごとの組み立ての `src/wiring/` を含む）                                                                                                                                                                                        | すべて                                                  | サーバ           |

- **`core` と `browser` は互いを import しない。** 両者が知っているのは `shared` だけ
- **`core → adapter` は禁止。** 辺は `adapter ──▶ core ──▶ shared ◀── browser` の一方通行で、
  `core` と `adapter` を結ぶのは `src/` 直下と `src/wiring/` の配線だけ。**機能をまたいでも同じ**で、どの機能の
  `core/` もどの機能の `adapter/` も import しない（層は機能より先に効く）。**`core` は `node:` / SDK（`@anthropic-ai/*`）/
  `ws` を import しない**ので、`core` から外の世界へ出る道は無い
- **`adapter` は1ファイル = 1つの境界。** インターフェースは切らない（実装が2つあるもの —
  駆動とホスト — だけ、契約の型を `core` に置く: `server/session-driver/core/session-driver.ts` /
  `server/host/core/host.ts`）
- **`shared` は `node:` も `document` も触らない。** 好みではなく**物理的な制約**で、`shared` は
  サーバとブラウザの両方で読み込まれるので、片方にしか無い API に触れた時点でもう片方で動かなくなる
- 許した辺以外は `test/architecture.test.ts` が落とす（層の辺は上の4本。サーバ側の機能どうしの辺は
  次の節の表）

### サーバの機能と、機能どうしの辺

`src/server/` は**機能のまとまりで割り、機能の中を層（`core/` と `adapter/`）で割る**。機能の名前は
`docs/glossary.md` の語（単数形）で、**1つの機能 = 1つのディレクトリ**。機能の中は `core/`（判断）と
`adapter/`（境界）の2段だけで、中身の無い段は作らない。機能の中のファイルは
`ls src/server/<機能>/core/ src/server/<機能>/adapter/` が正典で、各ファイルの持ち物はそのファイルの
冒頭のコメント（「core と adapter」）。

| 機能                 | 何の機能か                                                                                   |
| -------------------- | -------------------------------------------------------------------------------------------- |
| `session/`           | セッションを持つ・起こす・頼む。**各機能の判断を束ねる**（下の「束ねる機能」）               |
| `session-driver/`    | セッション駆動。契約・SDK の実装・fake driver・メッセージの変換・答え待ち・続きから始める    |
| `report/`            | レポートの記法・`report` ツール・検査と差し戻し・塊の使われ方の記録                          |
| `system-prompt/`     | `systemPrompt` の append の組み立てと、セリフの間合いの規約                                  |
| `chat/`              | 雑談モード。作法・記憶・話しかけ・アーカイブ・要約・覚えたこと・定着                         |
| `character-pack/`    | キャラクターパックの選択・読み込み・画面からの編集                                           |
| `visit/`             | 訪問。契機・来客・台本・見張り                                                               |
| `diary/`             | 日記。`diary` ツールと保存                                                                   |
| `achievement/`       | 成果。コミットは `main` の履歴、終えたタスクは Beads の閉じた課題から数える                  |
| `usage-review/`      | 見直し。2つのツール・前回の結果・見送り                                                      |
| `token-usage/`       | トークン消費の記録と集計                                                                     |
| `context-usage/`     | コンテキストの内訳の記録                                                                     |
| `plan-usage/`        | 利用枠（`/usage` と同じ上限）の手続き                                                        |
| `experience-metric/` | 体験の数の記録と集計                                                                         |
| `diagnostic/`        | 診断ログ（不具合の経緯を追う足跡）の書き口・束ね・置き場と掃除                               |
| `host/`              | ホストのポートと Orca・`none` の実装、ホストへ渡す前の門番                                   |
| `view-server/`       | ビューサーバ。ポートの決定・http・ws・同梱の外部ライブラリ・ブラウザ側の組み立てと開発サーバ |
| `repository/`        | 作業ディレクトリの git リポジトリを読む。`git` を起こす口・管理下のファイル・タスク一覧      |
| `recommendation/`    | おすすめの札。候補・使い捨ての `query()`・出力の検査・キャッシュ                             |
| `checkout/`          | 打った場所のチェックアウトと自分の根を比べ、違えば打った側の `bin/tsukumo` へ委ねる          |

**どの機能にも属さない共有のもの**は、`server/core/` と `server/adapter/` の**直下**に置く
（いまあるものは `ls src/server/core/ src/server/adapter/`）。置いてよいのは**どの機能の語彙も名乗らず、読み手が
2つ以上ある（機能・共有の箱・配線のどれでも数える）もの**だけで、読み手が1つの機能だけに
なったらその機能へ下ろす（`browser/domain/` と同じ引き金）。

**機能どうしの import の規則**:

- **層の規則が先に効く。** `core/` は、どの機能のものでも `adapter/` を import しない
- **機能 A が機能 B を import してよいのは、下の表にある組だけ。** 共有の箱はどの機能からも
  読んでよく、**共有の箱は機能を読まない**
- **層ごとに循環させない。** 機能の `core/` どうしの辺と、機能の `adapter/` どうしの辺は、それぞれ
  一方通行（表はその順に並ぶ）。機能の単位で見ると輪が2つある（`chat` ↔ `session-driver` と、
  `view-server` → `session` → `session-driver` → `view-server`）が、どちらも1本が
  `adapter → 別の機能の core` で層の辺と同じ向きなので、ファイルの単位では輪にならない
- **束ねる機能は `session/` の1つ。** `session-manager.ts` は外の世界に触らないので `core` だが、
  各機能の判断（訪問の見張り・日記・トークン消費・雑談のアーカイブ）を読んで1つのセッションに
  まとめる。**外の世界の実装を選んで渡すのは配線（`src/` 直下の `session-start.ts` と `src/wiring/`）**、
  渡されたものを使って順序と状態を持つのが `session/`、という境目
- **セッションの配線は機能ごとに組み立てる。** `src/wiring/<機能>.ts` の `wire<機能>` が、その機能の
  「`createSessionManager` へ渡す口」（`manager`）と「`createSocketRouter` へ渡す口」（`commands`、
  `session` の口の一部なら `sessionCommands`）を返し、`startSession` はそれを spread で結ぶだけにする。
  機能を足すときに触るのは、その機能の組み立てと、結ぶ行だけ。口の揃いは結ぶ側の型検査が見る。
  2つ以上の組み立てが読む値（作業先・時計・引き継ぐ環境・疑似セッション・会話のアーカイブ・成果の
  入れ物）だけを `WiringContext`（`src/wiring/wiring-context.ts`）にまとめて渡し、1つの組み立てしか
  読まないものはその中で作る。組み立てどうしの受け渡しは口で渡す（起こす組み立てが代を起こすたびに
  日記の組み立ての `noteLaunched` を呼ぶ）。`createSessionManager` の引数を機能ごとの束に変える案は
  採らない（`session-manager.ts` は割らない。`docs/architecture/adr/0021-feature-state-fold-in-feature.md`）。
  配線には単体テストを持たない（守る振る舞いは E2E が本物のプロセスで、口の揃いは型検査が守り、
  単体で書くには adapter を差し替える本番に要らない口が要る）
- **Agent SDK を import してよいのは、機能の `adapter/` の直下の `sdk-` で始まるファイルだけ**
  （原則3）。1つの箱にはまとめず、**その境界が属する機能に置く**（「core と adapter」）
- **機能を足すときは、検査の機能の一覧と下の表に足す**（知らない機能のディレクトリと、
  `core/` `adapter/` の外に置いたファイルは `test/architecture.test.ts` が落とす）

| 機能（import する側） | 読んでよい機能                                                                                                                                           | いまある辺の層                                                                                                                                                                                            |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session`             | `session-driver` `chat` `visit` `diary` `token-usage` `context-usage` `experience-metric` `diagnostic` `character-pack` `report`                         | core → core だけ（`session-manager` → `report-usage` `report-image-shelf`）                                                                                                                               |
| `system-prompt`       | `session-driver` `chat` `report`                                                                                                                         | core → core だけ                                                                                                                                                                                          |
| `view-server`         | `session` `achievement`                                                                                                                                  | adapter → core（`session-socket` / `rpc-guard` → `command-session`）・adapter → adapter（`server` → `main-history`）                                                                                      |
| `chat`                | `session-driver` `character-pack`                                                                                                                        | core → core と adapter → core（駆動の契約にある `PersonaMemory` `ChatSummary` などと、`chat-archive-port`）・adapter → adapter（`persona-memory` / `chat-summary` → `character-pack` / `character-edit`） |
| `context-usage`       | `session-driver`                                                                                                                                         | core → core（駆動の契約）                                                                                                                                                                                 |
| `session-driver`      | `chat` `report` `usage-review` `view-server`                                                                                                             | core → core（`report-review` `port-resolution`）・adapter → core（各ツールの判断）                                                                                                                        |
| `diary`               | `character-pack` `repository` `session-driver`                                                                                                           | adapter → adapter・adapter → core（`sdk-diary` → `session-driver/core/tsukumo-tool-name.ts` の `tsukumoToolFullName`）                                                                                    |
| `achievement`         | `repository`                                                                                                                                             | adapter → adapter（`main-history` → `git` `beads`）                                                                                                                                                       |
| そのほか              | —（葉。`report` `visit` `usage-review` `token-usage` `experience-metric` `diagnostic` `character-pack` `host` `repository` `checkout` `recommendation`） | —                                                                                                                                                                                                         |

#### コマンドの受け手と手続きの置き方

**「どのコマンドをどの機能が受け、どの条件で断るか」を、契約と機能の側の表から辿れるようにする。**
画面からのコマンドは `/ws`、読み取りは HTTP の `/rpc` の oRPC の手続き（比較は `docs/research/server-procedure-proposal.md`）。

**辿り方**: `src/router.ts` で名前を探す → `shared/contract/<機能>.ts`（形と断る条件の `meta`）→
`<機能>/adapter/<機能>-procedure.ts`（委ね先）→ `<機能>/core/`（コマンドなら `<機能>-command.ts` の
行）。**どのコマンドでも同じ4段**。

| 置くもの                                        | 場所                                            |
| ----------------------------------------------- | ----------------------------------------------- |
| 契約（形・**断る条件の `meta`**）               | `src/shared/contract/<機能>.ts`                 |
| 機能の表（コマンドだけ）                        | `src/server/<機能>/core/<機能>-command.ts`      |
| 行の型と、葉の行を呼ぶ関数                      | `src/server/core/command-receiver.ts`           |
| 手続き（`implement(contract.<機能>)` の受け手） | `src/server/<機能>/adapter/<機能>-procedure.ts` |
| 照合と断る条件のミドルウェア                    | `src/server/view-server/adapter/rpc-guard.ts`   |

- **断る条件は契約の `meta` に書く**（行には持たない。二重に持たない）。形は
  `{ chatOnly: false | 理由, idleTurn: false | 理由 }`（`src/shared/command.ts` の `CommandMeta`）で、
  理由は `FRAME_ERROR_REASON`（`shared/frame.ts`）の値。**条件と理由を同じ所に書く**。断ったときは
  理由を添えた `REFUSED` が応答で返り、受け手は呼ばれない
- **受け手は3種**（`write` / `call` / `session` の判別可能な合併型。`command-receiver.ts`）。`session` の
  受け手は `CommandSession`（`command-session.ts`）を受け取り、**`session` の表にだけ書ける**（型が
  `session/core/` にあるので、葉の機能からは物理的に書けない）。書き込み口は各機能の `ports` にあり、
  中身を選ぶのはその機能の組み立て（`src/wiring/<機能>.ts`）
- **束ねるのを配線に置く理由**: 表を `session/core/` で束ねると、`session` が `usage-review` と
  `host` を読む辺（いまの表に無い）が要り、`session` がまた全部を知る場所に戻る。配線なら
  **機能どうしの辺の表は増えない**。葉の機能の表と手続きが読むのは `shared` と共有の `core`
  （`command-receiver.ts`）と自分の機能だけ
- **押し出しも手続き**（購読 `frame.subscribe`）。`/ws` の上は**すべて oRPC の手続きの要求と応答**で、
  `hello` / `events` / `refresh` のフレームは Event Iterator で届く。購読の元を**取りこぼさず・捨てずに**
  写し、接続が切れたら購読を外す。購読には照合（`rpcGuard`）だけを掛け、断る条件は見ない
- ブラウザは型付きの client（`src/browser/stores/session.ts` の `dispatch`）で呼ぶ。**送りっぱなしで、
  断られても画面には出さない**（画面は同じ条件で先に操作子を塞いでいる）

`/prompt-image/<id>`・`/report-image/<toolUseId>/<path>`（どちらも `<img src>` で読む）と静的な配信は HTTP の経路のまま。

**許す依存の辺**（`test/architecture.test.ts` が見る）:

| 辺                                    | 許す場所                                                                                                                |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `shared` → 外部                       | `zod` と `@orpc/contract`（`@orpc/server`・`node:` は読まない）。手続きより前から読んでいる `remeda` も可               |
| `@orpc/server` を import してよい場所 | 機能の `adapter/`（`view-server/adapter/` を含む）と配線（`src/router.ts`）だけ。**`core` と共有の箱は禁止**            |
| `browser` → 外部                      | `@orpc/client`（`/rpc` は `@orpc/client/fetch`、`/ws` は `@orpc/client/websocket`）と `@orpc/tanstack-query`            |
| `src/router.ts`（配線）               | すべての機能の `<機能>-procedure.ts` と、口の型のための `<機能>-command.ts`。配線なので**機能どうしの辺の表は増えない** |
| 機能どうしの辺                        | 上の表のまま（受け手が別の機能の判断を要るようになったら、今と同じく表に足す）                                          |

### shared の機能

`src/shared/` も**機能のまとまりで割る**。**機能の名前は `src/server/` の機能の名前をそのまま使い**
（同じ語彙の判断・境界・形が同じ名前の下に並ぶ）、**サーバに無い名前の機能は作らない**。`shared` は
1つの層なので、機能の中は層で割らずファイルを平らに置き、サブディレクトリを作らない。置く物の無い
機能（`system-prompt` `host` など）のディレクトリは作らない。

| 置き場                      | 置くもの                                                                                                                                                                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `shared/<機能>/`            | その機能の語彙（型・検証・純粋な導出）と、その機能だけが動かす `SessionState` の欄の畳み方（「SessionState」）                                                                                                                                               |
| `shared/session/`           | `SessionEvent` / `SessionState` / `applySessionEvent` と、**`SessionState` から純粋に導くだけのもの**（`main-view.ts` `turn-step.ts` `portrait-motion.ts` など）。サーバの `session/` と同じく**各機能の語彙を束ねる**ので、ほかの機能を読む向きの辺が集まる |
| `shared/` の直下            | **どの機能にも属さないプロトコル**だけ: フレームの封筒（`frame.ts`）・コマンドの共通の形（`command.ts`）・手続きの束（`rpc.ts`）                                                                                                                             |
| `shared/contract/<名前>.ts` | 手続きの契約。**名前は手続きの名前**（`rpc.ts` の鍵と `<名前>-procedure.ts`）で、機能の名前とは1対1でないので機能のディレクトリへは寄せない                                                                                                                  |
| `shared/utils/` `lib/`      | tsukumo の語彙を名乗らない道具（「`lib/` と `utils/` に置く基準」）                                                                                                                                                                                          |

**機能の決め方**（上から順に当てる。数えるのはファイル名と import で、読み手の数は数えない）:

1. **サーバのある機能が同じ語彙を持つなら、その機能**。手がかりは、サーバのその機能に同じ名前の
   ファイルがある（`view-server/adapter/session-socket.ts` → `shared/view-server/`）・ファイル名が
   機能の名前で始まる（`report-block.ts` → `shared/report/`）・サーバでその値を組み立てる（外から来た
   値を検証して型にする）のがその機能（`api-trouble.ts` は SDK のメッセージを畳む `session-driver`）
2. 手がかりが食い違ったら、**shared の機能どうしの辺が輪にならないほう**（`character-visit.ts` は
   `character-definition.ts` が読むので、`visit` ではなく `character-pack`）
3. 1に当たらず、`SessionState` / `SessionEvent` から導くだけのものは `session/`
4. tsukumo の語彙を名乗らない道具は `utils/`（歯止めの3つを満たすもの）、残る封筒と束は直下

**辺の規則**:

- **shared の機能どうしの辺は輪にしない**（`session/` が束ね、ほかの機能は `session/` を読まないのが
  既定。雑談のログ `chat/chat-log.ts` のように `SessionState` から導く機能の語彙は `session/` を読んでよい）。
  サーバのような「読んでよい機能」の表は持たない（層が1つで、辺の向きは輪が無いことだけで決まる）
- **機能のディレクトリは `contract/` と `rpc.ts` を読まない**（契約と束が機能の語彙を読む一方向）。
  直下の `frame.ts` `command.ts` は機能から読んでよい（断る理由 `FRAME_ERROR_REASON` と、権限・モデル・
  思考の段の語彙を持つため）
- **機能を足すときは、サーバの機能の一覧に先にあること**。shared の機能の一覧・直下のファイルの一覧・
  機能どうしの輪は `test/architecture.test.ts` が見る

**ブラウザ側とは対応させない。** `src/browser/` は画面と領域（「`src/browser/` の箱と、置く基準」）で割り、
shared の機能の名前には揃えない。ブラウザの部品は要る語彙を `shared/<機能>/<概念>.ts` から直に
import する。**`browser/features/` の「機能」は置かれる機能（「領域の機能と、置かれる機能」）で、
サーバと shared の機能とは別の語**。

### ディレクトリ

```
src/                          配線（composition root）。cli.ts（入口）・main.ts（起動の段取り）・
                              router.ts（全機能の手続きを束ねる）ほか、起動と接続を進める数ファイル
  wiring/<機能>.ts            セッションの配線を機能ごとに組み立てる（上の「サーバの機能と、機能どうしの辺」）
  types/                      どの層にも属さない ambient 宣言（import されない *.d.ts）だけを置く
  shared/                     契約・イベント・状態・reducer・zod スキーマ（両側が読む語彙）。直下はプロトコルだけ
    <機能>/                   機能の語彙。名前はサーバの機能と同じ（上の「shared の機能」）
    contract/<名前>.ts        手続きの契約（形・断る条件の meta）
  server/
    core/ adapter/            どの機能にも属さない共有の判断・境界
    <機能>/core/ adapter/     機能の判断・境界（上の「サーバの機能と、機能どうしの辺」）
  browser/                    React の部品・hooks・CSS（下の「`src/browser/` の箱と、置く基準」）
test/                         src/<相対パス>.ts → test/<相対パス>.test.ts
story/                        src/<相対パス>.tsx → story/<相対パス>.story.tsx（Storybook。設定は .storybook/）
characters/<name>/            character.json・persona.md・素材
plugin/                       セッションに載せる Claude Code のプラグイン（同梱のスキル。`buildQuerySeedOptions` が渡す）
.tsukumo/project.json         このリポジトリのプロジェクトの設定（下の段）
```

**プロジェクトの設定**（`docs/architecture/adr/0022-three-setting-homes.md`）は、起動先の作業ツリーの
`.tsukumo/project.json` の1つだけから読む。形は
`{ "tasks": { "mainBranch": "<ブランチ名>", "runPrompt": "<文面。既定 タスク {id} を進めて（bd show {id} で読める）。>" } }`
（タスク運用を使わないプロジェクトは `{ "tasks": "off" }`）で、検証は `shared/repository/project-settings.ts` の `projectSettingsOf`、読み出しは
`server/repository/adapter/project-settings.ts` の `readProjectSettings` の1か所。結果は
「設定なし（ファイルが無い・`tasks` が無い）・使わない（`tasks` が `"off"`）・読めない（形が違う）・読めた」の4つで、
起動時に覚えず、タスク一覧の見回りと成果の読み出しのたびに読み直す（画面から書いた値が次に読んだときに効く）。
以前の版が書いた `"store": "beads"` の欄は受けて読み捨てる（それ以外の値は「読めない」）。
欄の説明は `README.md`「プロジェクトの設定」。

**タスク一覧の読み元は Beads だけ**（`server/repository/adapter/task-beads-source.ts`。`bd` の課題）。
例外は疑似セッションで、`taskSummaryOptionsOf("fake")` が `bd` の代わりに cwd のファイルを読む口（`fake-beads.ts` の
`readFakeBeadsIssues`）と短い見回りの間隔に差し替える（E2E の足場が課題を置く。設定の読み出しと読み元の選び方はふだんと同じ）。
見張りの `watchTaskSummary` は、設定が前回と変わった見回りでだけ読み元を選び直し、設定が読めないときは
決まった結果（`settings-invalid`）を、使わないときは `off` を返す読み元（`task-source.ts` の `fixedTaskSource`。どちらも Beads を読まない）を置く。設定が無いときも
Beads を試しに読み、`.beads` が無ければ「不明」になる（値を推し量るのではなく、読めるかを試すだけ）。
前回知らせたものと同じ結果は知らせない。前回の初めは画面の初期値と同じ `loading`（最初の見回りの結果がまだ届いていない）なので、
最初から読めないときも初回に必ず `unknown` が届く。
起動直後は、設定が `off`・読めないでなければ、前回読めた一覧（`~/.tsukumo/task-summary.json`。作業ディレクトリごと）を
`bd` の結果を待たずに先に知らせ、読んだ結果が違えば差し替える（同じなら知らせない。読めなければ `unknown`）。
知らせた `known` は覚え直す。画面は `loading` ならサイドバーのタスクの節とタスクのモーダルにスケルトン（文字は出さない）、
`settings-invalid` ならタスクの節の中に「⚠ 読めない」、`unknown` なら「不明」を出し、`off` ならタスクの節ごと出さない
（迎える口の札とおすすめは `loading` も `unknown` と同じ扱いで出さない）。
設定を書くダイアログは帯の右端の歯車のポップオーバーの「プロジェクト」の行から開く。
設定を書く画面（`docs/architecture/screen-design.md` 13.6）の下書きは
`repository.projectSettingsDraft`（`/rpc`）で読み、保存は `projectSettings.save`（`/ws`）で書く。下書きの
推し量り（`origin/HEAD`）は画面の初期値にだけ使い、見張りは読まない。

**ファイル名は概念で、単数形**（原則5）。`helpers/` と `common/` は作らない。**ディレクトリ名に単数形の
縛りは無く**、`src/browser/` の置き場所のディレクトリ（`components/`（とその下の `page/` `domain/` `ui/`）
`features/` `hooks/` `domain/` `lib/` `utils/` `stores/` `styles/` `types/`）は bullet-proof-react の名前を
そのまま採る（`components/` の下の3つは利用者の Next.js の雛形の名前）。機能・領域の名前は用語集の語に、
画面の名前は `stores/location-hash.ts` の `Screen` の値に合わせる。**手本から採るのはディレクトリの形だけ**で、
kebab-case のファイル名・barrel file を作らない・`@/` を使わない相対 import はそのまま（PascalCase・
1部品1フォルダは真似しない）。**例外は `components/ui/` と、ページの `components/` の2つだけ**で、
部品と CSS の対が平たく並ぶと見づらいので部品ごとに `<部品>/<部品>.tsx`・`<部品>.module.css` の
1フォルダへ分ける（例外の中でも `index.tsx` は置かない。`docs/coding-standards.md`「barrel file を作らない」）。
**実体が無い箱は先に作らない**（手本の `app/` `api/` `config/` `assets/` `testing/` などは作らない。
理由は `docs/history/decision.md`「design.md 2. 全体構成 / ディレクトリ（採らなかった bullet-proof-react の要素）」）。
ファイルを移すときは、パスを指す記述が `.module.css` のコメントにもあるので `grep -rn` の対象から外さない。

**story（Storybook）は `src/` に置かず、`story/` の下に描く部品と同じ相対パスで置く**
（テストと同じ写し方）。`src/browser/` は配る束の中身だけにしておき、上の箱と機能の辺の検査が
story を読み手として数えないようにするため。story が import してよいのは `src/browser/` と
`src/shared/` だけ（ブラウザで描くので browser の層と同じ）。置き場と辺は
`test/architecture.test.ts`（`describe("story の置き場", …)`）が見る。ファイル名の接尾辞は
単数形の `.story.tsx`（原則5。Storybook は `.stories` と `.story` のどちらも読む）。

**ページの形**（`components/page/<ページ>/`）:

```
components/page/<ページ>/
  <ページ>.tsx                   container（入口。components/app/layout.tsx が置く）。名前は Screen の値
  presentational-<ページ>.tsx    presenter（器）
  <ページ>.module.css            container / presenter と、2つ以上の部品が読む CSS（あれば）
  domain/ hooks/                 そのページだけの語彙・フック（container / presenter も読むもの）
  components/                    そのページの部品。直下はディレクトリだけ
    hooks/                       components/ の下の2つ以上の部品だけが読むフック
    <部品>/                      1部品1ディレクトリ
      <部品>.tsx                 部品（割るなら container）。外から引くのはこのファイルだけ
      presentational-<部品>.tsx  割るときの presenter
      <部品>.module.css          この部品（と中の子部品）だけが読む CSS
      hooks/ domain/             この部品（と中の子部品）だけのフック・語彙
      components/<子部品>/       この部品だけが使う子部品。ページの components/ の直下の部品だけが持てる
      <概念>/                    下の「機能の中を分ける」の概念のディレクトリ（markdown/ など）
```

- **ページの直下は、container / presenter の対と `<ページ>.module.css`、`domain/` `hooks/` `components/`
  だけ。** 対は**どのページも必ず1対**にする（入口の形が決まっていれば、開く前に中の見当が付き、検査で
  名前を決め打ちできる）。container が state か副作用を持つなら `hooks/use-<ページ>.ts` へ出す。
  **2つ目の画面**（ページの中で並ぶか重なるもの）は直下に置かず `components/<部品>/` の部品にする。
  ファイル名の `-screen` は付けない
- **置き場所は「読み手すべてを含む、いちばん近い箱」で機械的に決める**（部品・フック・語彙・
  CSS のどれも同じ）。数えるのは `import`（`import type` も含む）で、テストは数えない:

  | 読み手                                               | 置き場                                                                                               |
  | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
  | ページの直下（対・`hooks/`・`domain/`）を1つでも含む | ページの `hooks/` / `domain/` / `components/<部品>/`                                                 |
  | `components/` の下の2つ以上の部品（直下は含まない）  | フックは `components/hooks/`、語彙はページの `domain/`、部品は `components/<部品>/`                  |
  | `components/<部品>/` の中だけ（その部品と子部品）    | その部品の中の `hooks/` / `domain/` / `components/<子部品>/`                                         |
  | 2つ以上のページ・枠                                  | ページの外（部品なら `components/domain/`、フックは `browser/hooks/`、それ以外は `browser/domain/`） |

  **入れ子はページの `components/` から2段まで**（子部品だけが使う孫は、親の部品の `components/` に
  子部品と並べる）。CSS は class ごとに読み手を数える（選択子で結ばれた class は束ねて数える。
  `docs/architecture/browser.md`「CSS」）

- **部品のディレクトリの外から引いてよいのは `<部品>.tsx` だけ**（例外は `main.tsx` / `app.tsx` /
  `components/app/` とテスト）。ページの部品を画面の外に置くとき（書き終わりの知らせ `DiaryNotice`）は、
  `components/app/layout.tsx` がその `<部品>.tsx` を直に import する
- 会話の画面は**1ページ**で、4つの領域のうち、メインビュー・キャラビュー・入力欄（`dispatch/`）は `conversation/components/` の下、サイドバーは `domain/sidebar/` の部品。検査は
  `test/architecture.test.ts`（`describe("components/page/ の形", …)`）

**`src/browser/` の箱と、置く基準**（判断に迷ったら「その機能しか読まないなら機能の中」が既定。
領域も同じ）:

| 箱                     | 置くもの                                                                                                     | import してよい先                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `main.tsx` / `app.tsx` | 入口（`main.tsx` は mount だけ）と `<App>`（`app.tsx`。Provider を重ねて `<Root>` を描く）                   | すべて                                                                                                                              |
| `components/app/`      | **`<Root>` と、出す画面を選ぶ `<Layout>`**。すべての画面を知る composition root                              | `components/page` / `components/domain` / `components/ui` / `features` / `hooks` / `domain` / `lib` / `utils` / `stores` / `shared` |
| `components/page/`     | **画面**。1つの画面（会話の画面は1つの領域）に閉じた部品・状態・保存                                         | `components/domain` / `components/ui` / `features` / `hooks` / `domain` / `lib` / `utils` / `stores` / `shared`                     |
| `components/domain/`   | **tsukumo の語彙を持つ部品**。直下は2つ以上の領域が読む部品、サブディレクトリは全画面で共有する枠（領域）    | `components/ui` / `features` / `hooks` / `domain` / `lib` / `utils` / `stores` / `shared`                                           |
| `features/`            | **置かれる機能**（置き場所を持たず、領域に置いてもらう機能の部品・状態）                                     | `components/ui` / `hooks` / `domain` / `lib` / `utils` / `stores` / `shared`                                                        |
| `components/ui/`       | **語彙を持たない** React の部品（値と呼び先を全部受け取る）                                                  | `components/ui` / `hooks` / `lib` / `utils` / `shared`                                                                              |
| `hooks/`               | **語彙を持たない** React のフック（`use-modal-dialog.ts`）                                                   | `lib` / `utils` / `shared`                                                                                                          |
| `domain/`              | **画面全体の語彙**（tsukumo の語彙を名乗り、複数の領域・機能が読むもの。部品ではないもの）                   | `lib` / `utils` / `shared`                                                                                                          |
| `lib/`                 | **固有のライブラリ**（`orpc` のように特定用途のパッケージ）を包む道具                                        | `utils` / `shared`                                                                                                                  |
| `utils/`               | **それ以外**の汎用の道具（実行環境の API・`react` / `remeda` を含む。下の「`lib/` と `utils/` に置く基準」） | —（`utils` の中だけ）                                                                                                               |
| `stores/`              | **画面全体で共有する状態**の store・Context と、それを読む hook                                              | `domain` / `lib` / `utils` / `shared`                                                                                               |
| `styles/`              | **グローバルな CSS だけ**（`theme.css`。領域・機能の見た目はその中）                                         | —                                                                                                                                   |

- **部品の箱の向きは `app.tsx` → `components/app` → `components/page` → `components/domain` → `features` →
  `components/ui` の一方通行**。`components/domain` は画面を知らず、`features/` は自分を置く枠も画面も
  知らず、`components/ui` は tsukumo の語彙を知らない。**画面の組み立てを `components/domain/` へ移さない**
  （枠が画面を import する逆向きの辺になるので、`page` より上の段 `components/app/` に置く）
- **`components/domain` と `components/ui` の線は、tsukumo の語彙を持つかで引く**（`Portrait` は `domain`、
  `Select`・`Button`・`ImageZoom` は `ui`）
- **`stores/` は「状態ライブラリの置き場」ではなく「画面全体で共有する状態の置き場」**（`docs/architecture/browser.md`「状態の持ち方」）。置くのは
  **複数の領域が読む**状態で、領域の中に置けず、`app.tsx` に残すと領域が入口を import することになる
  ので箱が要る。**1本の hash の書き方は `stores/location-hash.ts` だけが知る**。領域と機能が触れるのは
  `stores/` が公開する hook までで、`app.tsx` と `stores/` の中身を組み立てる側として import しない
- **領域どうし・機能どうしは import しない**（唯一の例外が「領域 → 置かれる機能」の1方向。次の節。
  親が子を組む形も数える）。またいで要るものは、**語彙を持つ部品なら `components/domain/`、フックなら
  `hooks/`、状態なら `stores/`、それ以外は tsukumo の語彙を名乗るなら `domain/`、ライブラリを包む道具なら
  `lib/` へ上げる**。上げる引き金は「2つ目の読み手が出たとき」で、1つの領域しか読まないものは領域の中に残す
- **引き金は逆にも引く。** 読み手が1つの領域だけに戻ったら、その中へ**下ろす**。`browser/lib/` と
  `browser/domain/`、`components/domain/` の直下に「1つの領域（機能）だけが読むファイル」が無いことは
  `test/architecture.test.ts` が見る（どの領域・機能も読まないものは対象外）
- **`domain/` と `lib/` の線は、tsukumo の語彙を名乗るか、固有のライブラリ（`orpc` のような）を
  包むかで引く。** `domain/appearance-color.ts` は `localStorage` を包むが名前が指すのは**画面の色**
  なので `domain/`、`domain/tool-summary.ts` は純関数で `remeda`（用途を問わない汎用ライブラリ）しか
  使わず、`shared/` の型にも依存する（`utils/` の歯止め3を満たさない）ので、`lib/` ではなく `domain/`
- 検査は `test/architecture.test.ts`（領域と置かれる機能の一覧が横の辺を、箱の一覧が縦の辺を落とす）

### 領域の機能と、置かれる機能

画面を組み立てる部品のまとまりは3種類ある。**まとまりどうしの辺は「枠・画面 → 置かれる機能」と
「画面 → 枠」だけ**を許し、それ以外は落とす。

| 種類                       | どういうものか                                                       | 置き場                    | 辺                                                                                                         | いまの中身                                                   |
| -------------------------- | -------------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **枠**（frame）            | 全画面で共有する枠。差し込み口は props で受け、画面を知らない        | `components/domain/<枠>/` | 画面と `<Layout>` から import してよい。**枠どうしは import しない**                                       | `screen-nav` / `sidebar`                                     |
| **画面**（screen）         | 1つの画面 = 1つのページ。**どの画面を出すかを決めるのは `<Layout>`** | `components/page/<画面>/` | `<Layout>` だけが import する。**画面どうしは import しない**                                              | `conversation` / `character` / `token-usage` / `achievement` |
| **置かれる機能**（placed） | 自分の置き場所を持たず、枠か画面の中に置いてもらう                   | `features/<機能>/`        | 枠・画面から import してよい。**自分はどの機能も、枠・画面も、`components/domain` も import しない（葉）** | `task-board` / `current-work`                                |

- **`components/domain/` の直下のファイルは領域ではなく共有の部品**。**直下にサブディレクトリを足す
  ときは枠として一覧に載せる**（載せ忘れは検査が `throw` する。どの一覧にも無いディレクトリが
  `features/` と `components/domain/` の直下、`components/page/` の下にあれば落ちる）
- **どの画面にも出るが、1つの画面と語彙を共有するものは、その画面の中に置く**（書き終わりの知らせは
  成果の画面と見開きを開く合図と鈴の絵を共有する）。どこに出すかは `<Root>` が決める
- **「置かれる機能」にするのは、中身が領域の持ち物でなくなったとき**（`task-board` はサイドバーの
  一覧と画面いっぱいの `<dialog>` の対で、どちらも**タスクの語彙**で書かれている。`current-work` は
  帯と会話の画面の2箇所に置かれ、どちらの持ち物でもない）。置かれる機能の側は
  「サイドバー」も「区画」も名乗らず、置き場所を知らないまま書く。語彙を持たない `components/ui/` とは別物
- **区画ひとまとまりは領域の側に置く。** 枠・見出しの文言・押せる口・購読・state を1ファイルにまとめて
  領域の中に置き（`components/domain/sidebar/components/task-section.tsx`）、置かれる機能からは「何を描くか」だけを
  import する。**購読と state を区画が持つ**ので、描き直しはその区画で止まる（`<Root>` へ上げると
  タスクが変わるたびに全領域が描き直される）。例外はタスクのモーダルで、開く口がサイドバーの外（レポートの
  目録の1行のタスクID）にもあり、狭い画面ではサイドバーが隠れるので、開いているかは store
  （`stores/task-board-request.ts`）が持ち、`<dialog>` は会話の画面に1つだけ置く
  （`conversation/components/requested-task-board/`）

### 機能の中を分ける（container / presenter と `hooks/`）

**この節の「機能」は、枠・画面・置かれる機能のすべてを指す。** ページでは、この節の割り方をページの
中の部品に1つずつ掛け（ページの入口だけはいつも対）、置き場は「機能の直下」を「読み手すべてを含む、
いちばん近い箱」に読み替える。1つの機能に container が複数あってよい（`dispatch` の `composer` /
`turn-status`）。

**割るかどうかは、部品が抱えている「振る舞いの種類」の数で決める。行数もフックの本数も数えない。**

| 種類                   | どういうものか                                                                       | 例                                                        |
| ---------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| **保つ**（state）      | `useState` / `useRef` で持ち、イベントで遷移する                                     | 開いているか・下書き・選んだ位置                          |
| **外と同期**（副作用） | `useEffect`・タイマー・`<dialog>` の DOM・取得（`useQuery`）・DOM の出来事の読み替え | 1秒ごとの刻み・`showModal()`・`git ls-files` の一覧の取得 |
| **畳む**（算出）       | 受け取った値を**画面に出す形**へ変える                                               | 経過秒 → 「1分05秒」・並びの反転・候補の絞り込み          |

**ストアを読むだけは数えない**（「props で降ろす代わりに自分で読む」だけで、部品の中身は増えない。`docs/architecture/browser.md`「状態の持ち方」）。
**2種類以上そろったら割り、1種類までは1ファイルのままにする**（2種類そろうと、片方を読むためにもう片方を
読み飛ばすことになる）。**割り方は「余分な種類を外へ出す」方向で決める**:

| 抱えているもの                                         | 割り方                                                                | 例                                                            |
| ------------------------------------------------------ | --------------------------------------------------------------------- | ------------------------------------------------------------- |
| 3種類そろっている                                      | container / `hooks/use-<名前>.ts` / `presentational-<名前>.tsx` の3つ | `task-board` / `chat-view`                                    |
| **外の世界に触るフックだけ**が余分                     | そのフックだけを `hooks/use-<概念>.ts` へ出し、残りは1ファイルのまま  | `main-view.tsx` → `main-view/hooks/use-active-turn-scroll.ts` |
| **純関数だけ**が余分で、**フックを呼ばない相手**が読む | `domain/<概念>.ts` へ出す                                             | `task-board/domain/task-list-count.ts`                        |

3つに割るときの分担:

| ファイル                    | 持つもの                                                                          | 持たないもの                       |
| --------------------------- | --------------------------------------------------------------------------------- | ---------------------------------- |
| `<名前>.tsx`（container）   | フックを呼び、**戻り値を展開して渡す**（presenter の Props はフックの戻り値の型） | JSX の中身・算出・条件分岐         |
| `hooks/use-<名前>.ts`       | state・副作用・イベントの読み替え。**画面に出す形の値と呼び先を返す**             | JSX                                |
| `presentational-<名前>.tsx` | 器だけ。受け取ったものを `components/` に渡す                                     | **フックを1つも持たない**・算出    |
| `components/*.tsx`          | 部品ひとつずつ。class を付けて値を置く                                            | 算出・判定（**畳んだ値で受ける**） |
| `domain/*.ts`               | **フックに入れられない**機能固有の語彙（対応表・文言）                            | JSX・フック・React                 |

- **部品に算出を残さない。** フックが畳んでから渡し、部品に残ってよいのは**class を選ぶ分岐だけ**
- **純関数でも、まず `hooks/use-<名前>.ts` に入らないかを見る**（呼ぶのがそのフック1つならフックの下に
  置く）。**`domain/` を切るのは、フックを呼ばない相手が読み、その機能固有の語彙で名乗れるものだけ**
  （フックに置くと、フックを使わない側が `use-*.ts` を import することになる）。フックでない純関数は
  `hooks/` に置かない
- **`presentational-` の接頭辞は、この形のときだけ付けてよい**（`CLAUDE.md` 原則5 の例外。**container と
  1対1で対になっている**ことがファイル名で分かるため）。**フックと presenter の名前は container の名前に
  合わせる**（機能名で名乗ると対が分からなくなる）。**1ファイル1フック**
- **機能の中の `hooks/` に置くのは、その機能だけが読むフック**（container と対になっていないフックは
  **その概念**の名前）。読み手が2つになったら `browser/hooks/` へ上げる
- 語彙を持たない汎用の部品は、読み手が1つでも `components/ui/` に置く。**描き直しを止める `memo` は
  presenter 側に残す**（container はフックのぶん毎回描き直される）

**機能の中に、概念の名前のサブディレクトリ（`main-view/markdown/`）を置いてよい。** 切るのは
**ファイルが3つ以上でその概念だけで閉じている**・**`hooks/` `components/` `domain/` のどれか1つに
収まらない**・**名前がその機能の中の概念**の3つがそろったときだけで、そろったら `hooks/` などより優先する
（その概念だけが読むフックも中に入れ、中では接頭辞を落とす）。2つ目の読み手を得たらディレクトリごと上げる
（演出の `reveal/` は `browser/domain/reveal/`）。

**機能の中の `components/` はストアを読んでよい**が、**2つそろったときだけ**: (1) props で降ろす道に
`memo` か、その事情を知らない部品が挟まっている（降ろすと `memo` の前提が崩れ、黙って描き直しが増える。
`task-run-confirm.tsx`）、(2) 読んだ値で分けるのは class と文面だけ。どちらかを満たさないなら、
ストアを読む側を container へ出す。

### `lib/` と `utils/` に置く基準

**どの層の中にも `lib/` と `utils/` を作ってよい。** どちらも層の中で「tsukumo の語彙を名乗らない道具」を
分ける箱で、**層をまたぐ import の可否は変わらない**（`lib/` に入れても `core → adapter` は禁止のまま）。
判定は**ファイル名が指している概念1つ**で決める（原則5）:

1. **tsukumo の語彙**（`docs/glossary.md` に載る語）なら、どちらにも置かない。`shared` は機能のディレクトリ（「shared の機能」）、
   サーバ側は機能の `core/` か `adapter/` の直下、`browser` は `browser/domain/`。領域・機能の中の
   ものは、**その領域（機能）しか読まないならその中に残す**（名前が形式を指していても）
2. 残ったものを、**固有のライブラリ（`orpc` のように特定用途のパッケージ）を包むか、
   それ以外か**で分ける:

| ファイル名が指しているもの                                                                                  | 箱       | 例                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **固有のライブラリを包む道具**                                                                              | `lib/`   | `browser/lib/socket.ts` / `browser/lib/rpc-client.ts`（`@orpc/*`）                                                                  |
| **それ以外の汎用の道具**（実行環境の API・言語の標準・`react` / `remeda` のような用途を問わないライブラリ） | `utils/` | `browser/utils/clock.ts`（`Temporal`）・`browser/utils/data-url.ts`（`FileReader`）・`browser/utils/debounce.ts`（`react` の hook） |

実行環境の API（DOM・`node:fs` など）も、`react`・`remeda` のような用途を問わない汎用ライブラリも
`utils/` 側。**固有の用途にしか使わないパッケージ**（`orpc` のような）だけが `lib/` に残る。
**「複数箇所から呼ばれる」はどちらにも置く理由にならない。**

**`utils/` の歯止め**（3つとも満たすものだけ置ける）:

1. **import は `utils/` の中と、汎用のライブラリ・実行環境の API だけ**（`shared/` や層の中の他の
   箱への import があるなら `utils/` ではない）
2. **ファイル名が動詞か、名前の付いた手法**（`string.ts` `format.ts` のような型・種類の名前と `misc.ts` は置けない）
3. **別のプロジェクトへ1文字も変えずにコピーして意味が通る**

**`helpers/` と `common/`、ファイル名の `utils.ts` / `helpers.ts` / `common.ts` は作らない**（判定の問いを
持たず、何を置いてよいかが決まらない）。

- `adapter/lib/` は**境界を名乗らず、技術の扱い方だけを知っている道具**
  （「JSONL を1行ずつ読む」）で、読み手が1つの機能だけならその機能の `adapter/lib/`、2つ以上なら共有の
  `server/adapter/lib/`
- `core/lib/` に入れてよいのは **`node:` を要求しない技術**だけ。`shared/lib/` は**両方の実行環境で動く技術**だけ
- **`src/browser/utils/` の辺は `test/architecture.test.ts` が見る**（箱の辺と歯止め1）。他の層に `utils/` を
  作るときも、同じ検査を足す。**ライブラリに依存しない小物は、`utils/` を作る前に remeda（`docs/architecture/build.md`）にあるかを見る**

## 新しいコードを置く場所

**新しいコードは `src/shared/` / `src/server/<機能>/core/` / `src/server/<機能>/adapter/` /
`src/browser/` に置く**（「全体構成」）。**層の名前は「どの実行環境で動くか」を表す**
（2026-09-20。`docs/history/architecture-placement.md`）。サーバ側は**まずどの機能かを決め**
（機能の一覧は「サーバの機能と、機能どうしの辺」）、**外の世界（SDK・
HTTP/WebSocket・ホスト・ファイル・子プロセス）に触るならその機能の `adapter/`、触らない判断なら
`core/`。** どの機能にも属さず2つ以上の読み手を持つものだけ、共有の `src/server/core/` /
`src/server/adapter/` の直下に置く。

ディレクトリの割り当ては次のとおり。

| 置き場所                     | 実行場所         | 何を置くか                                                                                                                               |
| ---------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `src/`                       | —                | tsukumo 本体。直下は配線（`cli.ts` が入口、`main.ts` が起動の段取り。サーバで動く）                                                      |
| `src/shared/`                | サーバとブラウザ | 語彙・イベント・状態・畳み込み・コマンドとフレーム。**両側が読む契約**                                                                   |
| `src/server/<機能>/core/`    | サーバ（Node）   | その機能の純粋な判断。`node:` / SDK / `ws` を import しない。共有のものは `src/server/core/` の直下                                      |
| `src/server/<機能>/adapter/` | サーバ（Node）   | その機能の外の世界に触る境界。1ファイル = 1つの境界（SDK・HTTP・fs・子プロセス）。共有のものは `src/server/adapter/` の直下              |
| `src/browser/`               | ブラウザ         | ブラウザ側の React の部品。中は `features/` `components/` `hooks/` `lib/` `utils/` `stores/` `styles/`（箱ごとの置くものは「全体構成」） |
| `test/`                      | —                | テスト。`src/<相対パス>.ts` → `test/<相対パス>.test.ts` で対応させる                                                                     |
| `characters/`                | —                | キャラクター定義とサンプル素材                                                                                                           |
| `scripts/`                   | —                | 開発・調査用のスクリプト。本体から呼ばれない                                                                                             |

**`scripts/` は本体から呼ばれない調査用の道具置き場**（端末の実測幅を測るプローブなど）。
`src/` に混ぜると「tsukumo が動くのに必要なもの」と区別がつかなくなる。

置き場所の判断は次の原則で決める。**まだ存在しないディレクトリは、必要になったときに作る**
（空のディレクトリを先に切らない）。

- **原則1**: **Claude Code の TUI を使わない。** TUI には割り込めないので、パイプ・hook の
  stdout・本体へのパッチを経路にせず、SDK で動かす側に回る。理由は
  `docs/requirements.md`「3. 技術制約」
- **原則2**: **両側で共有する契約（`shared`）／サーバ（`core` と `adapter`）／
  クライアント（`browser`）に分け、層をディレクトリで表す**（詳細と理由の正典は
  「全体構成」）。サーバ側は機能ごとのディレクトリ（`src/server/<機能>/`）の中で
  `core` と `adapter` に割り、機能どうしの辺は「全体構成」の表にある組だけにする。`shared` に置くのは両側の契約と、`SessionState` から純粋に導ける
  ものだけで、「受け取る／決める／描く」という役割の分割ではない。**サーバ側は判断（`core`）と
  外の世界に触る境界（`adapter`）に割れていて、`core → adapter` は禁止**（結ぶのは `src/` 直下と
  `src/wiring/` の配線だけ）。**許した依存の辺以外は `test/architecture.test.ts` が落とす**
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
  から（「`lib/` と `utils/` に置く基準」）。**SDK の境界を1つの機能にまとめない**
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
  （「機能の中を分ける」）。**箱ごとに何を置くか・`lib/` と `utils/` の
  どちらに置くかは「ディレクトリ」「`lib/` と `utils/` に置く基準」が正典**
  （ここには二重に書かない）

**境界のファイルの中に、外の世界に触らない関数が混じっていてよい**（層は「外の世界に触るか」で
決め、ファイルの中身の純度で割り直さない。`docs/architecture/adr/0020-mixed-purity-in-adapter-file.md`）。

## 動きの流れ

### 起動

0. `cli.ts` が打った場所（cwd）のチェックアウトと自分の根を比べる。別のチェックアウトの中なら、
   そこの `bin/tsukumo` を同じ引数で子として起こし、終了コードとシグナルを伝えて終わる
   （`bin/tsukumo` が無ければ食い違いを出して止まる。外か同じ根なら下へ進む）
1. `cli.ts` が `config.ts` で環境変数を読み、`main.ts` の `run(config, launch)` を呼ぶ（`launch` は引数の `--dev`）
2. `main.ts` が**即時終了する前提**を3つ確かめる — ポート番号として読めるか（`port-resolution.ts`）、
   組み立て済みの成果物（`dist/browser/`。`docs/architecture/build.md`）を読めるか（ソースのほうが新しければ、止めずに1行
   知らせる）、fake driver なら疑似セッションを読めるか
3. `current-character.ts` が初期パック（指定されたもの・覚えていたもの・既定）を決める。
   **以降このパックの持ち回りはここに閉じる**
4. `view-delivery.ts` が**起動トークン**を1つ作り、`server.ts` を `127.0.0.1` で listen させる
   （`--dev` のときは Vite の開発サーバもここで差し込む。`docs/architecture/build.md`「作り直しを押す仕組み」）
5. `session-start.ts` が `session-manager.ts` にセッションを1つ作る。駆動は `TSUKUMO_DRIVER` が
   `fake` なら fake driver、それ以外は SDK。復元（「セッションの復元と複数化」）はここで判定する
   （どちらも起こす組み立ての `src/wiring/session-launch.ts`）。起こしたセッションは
   `view-delivery.ts` の `connect` で `/ws` に繋ぐ
6. ホストのポートで `http://127.0.0.1:<port>/?t=<token>` を開く（失敗しても続行）

**起こし直し**（`session.switchCharacter` / `session.setChatMode` / `session.switchSession`）も、駆動を
起こす一続き（`session/core/session-launch.ts` の `createSessionLaunch`）は起動時とまったく同じものを
通る。違うのは `session-manager.ts` が `generation` を1つ進めて古い駆動のイベントを捨ててから同じ
一続きをもう一度呼ぶ、という外側だけ（「セッションの復元と複数化」）。一続きの中の順序（パックと記憶の状態 → 続きから始めるか
→ 切り替え先の一覧 → 駆動 → 続きからなら履歴の再生 → 一覧の読み直し）は `createSessionLaunch` が正典。
続きの選択と切り替え先の一覧はメモリに持った一覧（`session-driver/core/session-catalog.ts`）から出し、
transcript の一覧を読み直すのは駆動を返したあとなので、起こし直しの `hello` はそれを待たない。
タスク一覧の見張り（`watchTaskSummary`）は一続きの外で `session-manager.ts` が1つだけ持ち、
起こし直しでは作り直さない。タスク一覧は作業ディレクトリのもので駆動1代の持ち物ではないので、
起こし直しの `hello` にもそれまでの一覧を載せる（画面を初期化しても一覧は空に戻らない）。
見回りは画面が購読しているあいだだけ回り（起動時の1回は購読なしでも読む）、Beads 方式では課題の変化の印が
前回と同じなら `bd list` を打たない（印が取れないときは毎回打つ）。

### 接続

1. ページが組み立て済みのスクリプトを読み、`<App>` が `/ws?t=<token>` へ接続して、購読の手続き
   `frame.subscribe` を呼ぶ
2. サーバは upgrade の前に Origin とトークンを確かめ、購読の最初に **`hello` フレーム**
   （`PROTOCOL_VERSION`・`SessionState` の snapshot・キャラクターの見せ方）を1つ流す
3. 以降、セッションで起きたイベントを **50〜100ms ごとにまとめた `events` フレーム**で押す。
   ブラウザは同じ `applySessionEvent` で畳む。**サーバとブラウザの `SessionState` は構造的に同じ**

### 依頼

1. Composer が手続き `session.prompt({ text, images })` を `/ws` の上で呼ぶ
2. サーバは契約の zod で検証し、断る条件（`meta`）を見てから `session` の行 → 駆動の `prompt(text)`。
   駆動が `request` イベントを起こし、それが `events` で戻ってくる（**ブラウザはローカルで
   echo しない**。ターンの開始はサーバのイベントで知る）
3. 断片（`partial-utterance`）は1バッチ内で連結して1件にする（転送量の抑制。畳み込みの結果は同じ）
4. 受け付けられないとき（検証に落ちた・断る条件に当たった・駆動が失敗を返した）は手続きの応答が
   エラーになる（断ったときは契約の `REFUSED` と定型文の理由）。**依頼の文面を含めない**

### 答え待ち

1. `canUseTool` → `pending-answer.ts` の列 → `pending-changed` イベント → 状態の `pending`
   （畳むときに届いた時刻 `askedAt` を打つ）
2. お伺いの札（`Inquiry`）が `pending[0]` を `useInquiryAnswer` で描く。答えたら `session.answer({ id, answer })`
3. 列が解決 → `pending-changed` → 札が消える。解決済みの id への回答は `REFUSED`

### 再接続

WebSocket が切れたらブラウザは指数バックオフで繋ぎ直し、購読し直して、**新しい `hello` の snapshot で状態を
置き換える**（差分の取りこぼしを気にしない。`lastEventId` での再開は使わない）。購読が終わった・投げた
ときも接続を閉じて同じ道で繋ぎ直す。プロセスが落ちている間は「接続が切れている」印を
Layout に出す。復帰したときにセッションを続きから起こし直す話は「セッションの復元と複数化」。

## shared

**zod を使うのは境界の書き込み側と封筒だけ。**
コマンドの契約の入力（`src/shared/contract/<機能>.ts`）は**全部 zod が正典**（ブラウザから届く書き込みの
経路なので厳密に見る。`text` の上限もここ）。`ServerFrame` は**封筒（`type` / `protocolVersion`）だけ** zod で、中身
（`state` / `events`）は検証しない。**`SessionEvent` と `SessionState` は zod にしない**（TS の型のまま。
状態にフィールドを1つ足すたびにスキーマを二重に直す手間のほうが効いてくるため）。
境界（WebSocket の両端）で1回だけ検証し、中では検証済みの型を使う。`shared` の中に `node:` も
`document` も持ち込まない（「層と依存の向き」）。

### SessionEvent

`SessionEvent` の一覧とフィールド、各イベントの出どころは `src/shared/session/session-event.ts` の型定義
（`kind` ごとの doc コメント）を正典とする。ここに残すのは、コードから読み取れない決定だけ。

**イベントは時刻を持って送る**（`StampedEvent`）。`at` はサーバの時計で、reducer は
`applySessionEvent(state, event, at)`。**ブラウザ側で時計を reducer に渡さない**（両側の状態が同じに
なるように、時刻はイベントの発生側が決める）。

**`state.model` は `init` を待たずに先回りで更新する**（`/model` を送ったそのターンの `init` はまだ古い
モデルを返す）。`assistant` に乗る `local_command_run` の `args` が `MODEL_ALIASES`（「ClientCommand」）と完全一致する
ときだけ更新する。**`local_command_run` を持たない古い SDK ではこの経路が黙って効かなくなり**、テストは
通ってしまうので、SDK の下限を下げるときは確かめ直す（版の実測は `docs/history/decision.md`
「design.md 2〜11章（約1000行へ締めたときに落とした経緯と実測）」）。`session.setModel` も同じ
`model-changed` を使い、駆動が確定を待ってから出す（駆動を経るのでローカル echo の禁止には当たらない）。

**`request` は文面だけでなく、添えた画像の控え（`images: string[]`）も運ぶ**（`docs/requirements.md`
4.10）。**原寸は載らない** — 原寸はモデルへ渡ったあとサーバのメモリの棚（`prompt-image-shelf.ts`）に
直近ぶんだけ残る。控えを作るのはブラウザ側で、**サーバは画像を加工しない**。

**`character-changed` は、いま出しているパックの姿と一緒に全パックぶんの一覧（`packs`）を運ぶ。**
**一覧だけの別のイベントにはしない**（契機が重なり、分けると片方を出し忘れたときに一覧と姿がずれる）。
ターンの中では流れない。1件の形・配り直す契機・素材の URL は `docs/architecture/character-pack.md`「パックの一覧と素材の URL」。

**API の不調は3つのイベントと `turn-finished` の `outcome` で運ぶ**（`api-retry` / `api-error` /
`rate-limit-changed`、`outcome: completed | interrupted | failed(cause)`。型は `src/shared/session-driver/turn-failure.ts`）。

- **`api-error` だけではターンの失敗にしない**——本体が立て直して続けることがあるので、失敗かどうかは
  `result` を写した `outcome` が決める
- `result` は API のエラーの種類を持たないので、**種類を足すのは畳み込み**（そのターンの `api-error`、
  無ければ最後の `api-retry`、どちらも無ければ `unknown`）。変換（`sdk-message.ts`）は状態を持たない
  1メッセージ1変換のまま保つ
- **中断は失敗にしない**（`error_during_execution` は、`terminal_reason` が中断か無いときは `interrupted`）
- **運ぶのは型の決まった値だけ**で、`result` の `errors` の自由文は契約に入れない（`docs/requirements.md` 4.1）

### SessionState

`SessionState`（`src/shared/session/session-state.ts`）の各フィールドと理由は、その型（および
`TurnProgress` / `CharacterInfo` など内訳の型）の doc コメントを正典とする。ここに残すのは、
`SessionState` の外側にある決定だけ。

**`connection`（接続中／切断中）は `SessionState` に入れない**（サーバ側に意味が無いため）。
ブラウザだけが持つ状態で、`src/browser/stores/session.ts` の `SessionStoreState` が `SessionState` と
同じ store に相乗りさせて配る。

**畳み込みの規則は `shared` の側が持つ**（`speeches.slice(-1)`・`speechCalledInTurn`・
`MAX_SESSION_STATE_TURNS` の窓）。**記録（`SessionRecord`）を依頼の区切りでターンに割るのは
`src/shared/session/turn.ts` の `splitIntoTurns` だけ**で、メインビュー・ターンごとのセリフ・依頼の手順・記録の
窓はその並びの上で自分の形に変え、依頼より前の記録（`PRE_REQUEST_TURN_ID`）をどう扱うかも各所が決める。

**成果は `SessionState` に入れない。** 成果の画面の中身は、画面が開いているときにブラウザが読み取りの
手続き（`achievement.day` / `achievement.calendar`）で取りに行く（状態に入れるとどの画面でもフレームと
再接続のたびに運び、数えるのに `git` を何度も起こす）。応答の決まり:

- **応答はサーバの今日（`today`）を持つ。** 日の境目を決めるのはサーバの `local-time.ts` の1箇所で、
  ブラウザは時計を読まず、「今日」「昨日」と「次の日」を押せるかを `today` との比較で決める
- **読めないものは応答の値で伝える**（画面に何を出すかは `docs/requirements.md` 4.11「数えられない・読めないとき」）。
  コミットの数が読めなければ `unknown`、数えられない場面は `{ kind: "unknown" }`（200）、
  **数える途中の `git`・`bd` の失敗は 503** で、部分的な数を配らない。日記が読めないのは `unreadable` として数と一緒に配る
- 入るのは数・時刻・タスクの ID と `summary`・日付と日記だけで、コミットの件名も会話の文面も
  入らない。起動トークンが要る（「会話内容と安全」）

**経過時間**は `turn` が持つ時刻から browser が計算する（`SessionState` に秒数は入れない）。

**API の不調の持ち方**。3つに分けて持つ。消える理由がそれぞれ違うため:

- **`apiTrouble`**（`src/shared/session-driver/api-trouble.ts`）は**いまのターンの中だけ**の状態。ターンの境目と、
  **モデルが何かを出したとき**（`MODEL_OUTPUT_EVENT_KINDS`）に下ろす。呼び直しが実った合図は SDK から
  来ないので、応答が届いたことを合図の代わりにする
- **`rateLimit`**（`src/shared/session-driver/rate-limit.ts`）は**セッションを通した**状態で、次の
  `rate-limit-changed` が来るまで持つ（戻る時刻を過ぎても、戻ったかは次の知らせでしか分からない）
- **失敗の理由**は `turn` の `finished` の `ending`（次の依頼まで）と、記録の `turn-failure`（記録の窓から
  落ちるまで）の2か所に残す

**記録の時刻**。記録のうち**依頼（`request`）とセリフ（`speech`）の2種類だけ**が `time: RecordTime` を
持つ。読むのは雑談のログ（`docs/architecture/screen-design.md` 13.7「時刻と日の区切り」）と、キャラビューのセリフのログの依頼の区切りで、
仕事のメインビューへ渡す形（`MainViewEntry`）には載せない。

- **形は判別可能な合併型**（`RecordTime`）: `stamped` は起きた時刻が分かり、`restored` は前のセッションを
  組み直したもので時刻が分からない（`at: number | undefined` にしない）
- **時刻を打つのはサーバ**（イベントの `at` をそのまま写す）。畳み込みの中で時計は読まない（「SessionEvent」）
- **ほかの種類には足さない**（雑談のログが拾わないうえ、記録を作る場所すべてに時刻の出どころが要る）
- **復元した記録の時刻は運ばない**（transcript を読む口が時刻を落として返し、アーカイブと文面で
  突き合わせると別の時刻を付けうる。間違った時刻より「分からない」を出す）
- **組み直しの終わりは `history-restored` イベントで伝え**、畳み込みはそこまでの依頼とセリフを
  `restored` に書き換える。**起こし直すと記録は空から始まる**ので、再生のイベントに打たれる `at`
  （流し直した時刻）を残すと、起こし直した直後のログが全部「いま」に見える

**`session-state.ts` は純粋な畳み込み。** 姿から導くだけのもの（メインビューに出す形・`/`
補完の候補）は `main-view.ts` / `command-suggestion.ts` に分けてある。状態を持つのはサーバ側の `session-manager` と
ブラウザ側（`browser/stores/session.ts` の zustand の store）だけで、「イベント1件でどう変わるか」はすべてここのテストで守れる。

**1つの機能だけが動かす欄の畳み方は、その機能の `shared/<機能>/` に置く**（訪問の `applyVisitEvent` の形）。
当てるのは、その機能のイベントだけで動き、値の置き換えより多い判断を持つ欄の組だけで、値を写すだけの
イベントと、記録・ターン・セリフ・API の不調の芯は `session-state.ts` に残す。

- **`SessionState` の形は平らなまま変えない。** 部分の reducer は自分の欄だけを受けて返し、`SessionState` を
  受け取らない（別の部分の状態が要るときは入口が値にして渡す）
- **またがるイベント**（`turn-finished`・`session-ended`・`conversation-cleared`・`history-restored`）は
  `applySessionEvent` の1つの `case` で畳み、各部分は名前の付いた関数で反応を出す
- **テスト**は部分の reducer を直に呼ぶものを `test/shared/<機能>/` に置き、`session-state.test.ts` には芯と、
  委ねていること・またがるイベントの効き方だけを残す

理由・分けないと決めたもの（`sdk-message.ts`・`session-manager.ts`）・採らなかった案は
`docs/architecture/adr/0021-feature-state-fold-in-feature.md`。

### ClientCommand

**節の名前は移す前のまま**（コマンドの和 `ClientCommand` は手続きへ移して消えた）。コマンドの一覧と
入力は機能ごとの契約 `src/shared/contract/<機能>.ts`（zod。「shared」の冒頭の決定どおりここが正典）、束は
`src/shared/rpc.ts` の `commandContract` を見る。どの機能が受けるか・断る条件は
「コマンドの受け手と手続きの置き方」。

- `text` の上限は `MAX_PROMPT_TEXT_LENGTH`（`src/shared/contract/session.ts`）
- `images` は**原寸と控えの対**（`PromptImage`。`src/shared/session-driver/prompt-image.ts` が正典）。値そのものは
  `docs/requirements.md` 4.10 が正典。**1枚も無いのが普通**なので、field ごと省いた形も受け取って空に
  畳む。WebSocket の `maxPayload` は原寸が上限まで全部通る大きさにしてある
- `PermissionMode` と `ModelAlias` の値の一覧は **`shared`（`src/shared/command.ts`）に1つだけ
  置く**。SDK の型との一致は `core` 側のテストで守る

### ServerFrame

`ServerFrame` の一覧とフィールドは `src/shared/frame.ts` の型定義（`type` ごとの doc コメント）を
正典とする。

- `protocolVersion` が browser の `PROTOCOL_VERSION` と違えば、browser は会話の画面の代わりに
  「ページを読み込み直してください」を出し、以降の `events` を畳まない（起こし直したプロセスと古いタブの
  組み合わせで起きる。画面だけ差し替わった道は`docs/architecture/build.md`の指紋で塞いだが、塞ぎ損ねたときは上げ直すまで
  直らないので、知らせにはそれも書く）。版の合う `hello` がまた届けば戻る

### 版と互換

`PROTOCOL_VERSION` は整数1つ。**イベントの追加は版を上げない**（知らない `kind` は reducer が
無視する）。既存イベントの形を変える・状態の形を変えるときだけ上げる。

## core と adapter

サーバ側は機能ごとのディレクトリの中が `core/`（判断）と `adapter/`（外の世界に触る境界）に
分かれている（「サーバの機能と、機能どうしの辺」）。各ファイルの持ち物はそのファイルの冒頭と
doc コメントが正典で、機能の数え方・契機・上限は `docs/requirements.md`（成果と日記は 4.11、
見直しは 4.12、訪問は 4.13）。ここには、1ファイルを読んでも分からない横断の規則だけを置く。

**境目の基準は「`shared` の語彙で書けるか / SDK の語彙を名乗るか」。** 駆動の契約
（`SessionDriver` と `SessionDriverOptions`）は `session-driver/core/session-driver.ts`、SDK の実装は
`adapter/` の `sdk-` で始まるファイル。`core` の契約は何がどの順で載るかを決めずに受け取るだけに
する（`systemPrompt` の append は文字列で受け、組むのは `takeSystemPromptAppend`。`docs/architecture/character-pack.md`）。
疑似セッションを流す `fake-driver.ts` も同じ契約で、`session-manager` はどちらが動いているかを知らない。

**SDK に触るファイルは、SDK のどの口に触るかで分ける**（import してよい先は
原則3）。駆動の `session-driver/adapter/` に `query()`・ツール・セッションの一覧・
`/context` の内訳の4つがあり、`sdk-driver.ts` 以外を呼ぶのは駆動と配線だけ。使い捨ての `query()` は、
それを使う判断と同じ機能に置く（`sdk-visit-script.ts` / `sdk-diary.ts` / `sdk-chat-consolidation.ts`）。

- **`sdk-message.ts` は SDK の型を import しない。** 依存を機能の `adapter/` 直下の `sdk-` で始まる
  ファイルに閉じるため、届くメッセージは `unknown` で受けて検証する（外部由来の値なので、どのみち構造は
  信用しない）。おかげで変換のテストは SDK を起動しない
- **SDK のイベント種別は増えうる。** 旧方針で transcript の `type` が実際に増えたのを観測して
  いる（2026-09-08 → 2026-09-09 で5種類増えた）。**知らないものは無視して落ちないこと**
- **ホストのポートにあるのは `showView` と `openFile` の2つ**（2026-09-12 にペインの分割・
  文字送信・キー送信を撤去し、2026-09-24 に `openFile` を足した。見せたビューを閉じる手段は
  `showView` の結果に付く）。ここに操作を足す前に、ページ側で完結しない理由があるかを確かめる
- **Orca はエージェント端末への合成入力を弾く**（2026-09-11 実測）。`orca terminal send` も
  `orca keypress` も claude の端末には届かない。**この経路に戻ろうとしないこと**

**2つのファイルが共有する定数は、読む側の層で置き場を決める。** `core` と `adapter` の両方が読む
ものは `core` に置き、`adapter` がそこから取る（`TSUKUMO_MCP_SERVER_NAME` / `SPEAK_TOOL_NAME` は
`core/tsukumo-tool-name.ts`。`core → adapter` は禁止なので逆には置けない）。両側と画面が読む既定値は
`shared` の1箇所（既定の effort は `BUILTIN_SESSION_DEFAULT.effort`）で、adapter は自分の定数を持たない。

**代のあいだだけ意味のある勘定は、駆動1代ぶんの持ち物（`SessionGeneration`）に集める。**
起こし直し（`restart`）はそれを丸ごと作り直すことで、勘定を1つずつ空へ戻す行を持たない
（足した勘定を `restart` へ戻し忘れても型は落とさないため）。配る束・トークンの累計・訪問の見張り・
日記の書き手は代をまたがず、コンテキストの内訳を書いた印と依頼の原寸の棚だけがまたぐ。代を
閉じたあとに届いたイベントは捨てる。

**イベントを受けて何かを記録するものは、その概念のファイルへ寄せる。** `token-usage.ts` /
`context-usage.ts` は書き口の契約と走行中の勘定を、`chat-archive-entry.ts` は「どのイベントを
アーカイブの1行にするか」を持つ。`session-manager.ts` に残るのは、どの順で・どちらの由来の
ときに呼ぶか（`origin` と `chatMode` の門）だけ。

**ツールで受け取るものは、同じ形で受ける**（`report`・見直しの2つ・`diary`）:

- **引数の検査は境界で2段**。型・列挙・整数は zod の形で SDK が先に断り（handler は呼ばれない）、
  形の外の条は `core` の窓口が断る。断るときは理由と直し方を `isError` 付きで返し、モデルが
  書いた文面は写さない。**断った呼び出しは状態を変えない**。受け付けたら `"ok"` だけを返す
  （見直しの段だけは、見送った提案の識別子を続けて返す）
- **イベントを作るのは、預かりが要るかで決める。** 差し戻しの判定が出るまで預かる `report` は
  `assistant` メッセージの変換（`sdk-message.ts`）が作る。預かりの要らない見直しと日記は、検査を
  通したときに handler が流し、変換はそのツールを知らない。handler が流したものは復元の再生に
  出てこないので、起こし直すと状態は初期値から始まる
- **`speak` のセリフは MCP の handler ではなく `assistant` メッセージの変換から取り出す。**
  handler は `"ok"` を返すだけにして、イベントの流れを1本に保つ

**使い捨ての `query()`**（訪問の台本・日記・雑談の定着）は、会話の駆動と次の形で切り離す:

- `systemPrompt` は文字列で丸ごと置き換え、組み込みのツール・設定・セッションの保存を持たせない
- 使用量はトークン消費の記録に混ぜない（記録は会話の `query()` の累計の差で、混ぜると差が崩れる）
- 疑似セッション（`TSUKUMO_DRIVER=fake`）では起こさない（書き手の出どころで「起こさない」を選ぶ）
- 書く口は起こせない・中断・時間切れ・形の崩れでも reject せず、「作れた／作れなかった」に畳む
  （常駐プロセスは落ちない）。訪問の台本と日記の書き手は代の持ち物で、代を閉じると中断する
- 渡した文面も受け取ったものもログに書かない（「会話内容と安全」）

## セッションの復元と複数化

**復元の決定は `docs/requirements.md` 4.8 のまま**（`cwd` + tsukumo の印（パックごと。`docs/architecture/character-pack.md`）、
常に自動で続きから、**復元のためには**会話を保存しない、失敗したら新規で起こす）。**雑談の会話の
アーカイブ（`docs/architecture/character-pack.md`「雑談の記憶の置き場」）は復元の材料ではない** — 画面を組み直すのは transcript からで、アーカイブは読み戻さない。

- 画面の履歴の組み直しは「`getSessionMessages` → `SessionEvent[]`（時刻付き）→ `session-manager` の
  `state` に畳む」だけ。接続したブラウザは `hello` の snapshot でそのまま同じ姿になる
  （**ブラウザ側に復元の特別な経路は要らない**）
- 組み直した記録の1件ごとの時刻は「分からない」に倒すが、**最後のやり取りの「所要」だけは transcript の時刻から戻す**
  （2026-10-04 利用者の決定）。`getSessionMessages` は型に無い `timestamp` を各メッセージに載せて返すので、
  最後の依頼と最後のメッセージの時刻を `restored-turn-span` にして畳む。読めなければ足さない
- 逃げ道は `TSUKUMO_NEW_SESSION=1`（起動時）と、画面から新規に起こすコマンド（契約に
  はまだ足していない）
- **どのセッションの続きから始めるかは画面から選べる**（帯のセッションの札から開く切り替え画面 →
  `session.switchSession` → `session-launch` の起こし直し）。並ぶのは**同じパック・同じモードの、
  目印（`@7327` / `@7328`）違い**で、新しいほうから `MAX_SESSION_CHOICES` 件まで。**起動時は
  自動で続きから始まる**（選ばせる画面は出さない）
- **ビューの本文はメモリにしかない。** プロセスを落とすとブラウザのタブは繋ぎ先を失う
  （WebSocket が指数バックオフで繋ぎ直し続ける。「再接続」）。起動し直せば
  同じ URL でそのまま復帰し、**前の続きから始まる**（claude 側の会話は `resume`、画面の履歴は
  transcript の読み直しで戻る。`docs/requirements.md` 4.8）

**複数化はやらない**（`docs/requirements.md` 2.2）。**`SessionManager` はセッションを1つだけ持ち、
鍵（`sessionId`）を持たない**。キャラクター・雑談モード・セッションの切り替えは、同じ `SessionManager` の
中で駆動を起こし直す（何代目かの印で古い駆動のイベントを捨てる）ので、古い側と新しい側を
並べて持つ場面が無い。`hello` も `sessionId` を名乗らない（画面に出るセッションのIDは
`SessionState` の側にある claude 自身のID）。広げるときの形はここに描かない
（要件から落としたので、描いておくと布石として読まれる）。

## 会話内容と安全

`docs/coding-standards.md`「会話内容の扱い」は最優先のまま。境界と、会話をディスクに書く例外:

| 項目                                               | 扱い                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| バインド先                                         | `127.0.0.1` だけ。変えない                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Origin                                             | WebSocket の upgrade で確かめる（`Origin` が無ければ通す、あれば自分と一致）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 起動トークン                                       | 起動ごとに乱数を1つ作り、`/ws?t=` で要求する。ページの URL に付けて配る（`showView` に渡す URL に含む）。同じマシンの別プロセスが `127.0.0.1:7327` を読める、という既知の割り切りを塞ぐ                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ディスク                                           | 会話を**書く**のは**3つの例外だけ**（下の「あらすじ」「雑談の会話のアーカイブ」「エピソード索引」。「直近の雑談を逐語で読み戻す」と「定着」の行は書かずに**読む・渡す**ほう）。組み立てた成果物（`dist/browser/`）に会話は入らない。`localStorage` に置くのは領域の比率だけ（キャラクターパックへ書くのは**会話ではなくキャラクターの属性1行**だけ。下の行）                                                                                                                                                                                                                                                                                                                                                                                         |
| ブラウザ側のメモリ                                 | `SessionState` として会話の一部を持つ。**同じオリジンの `127.0.0.1` のタブの中に閉じる**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| CSP                                                | ページの応答に `Content-Security-Policy` を付ける（値は `src/server/view-server/adapter/server.ts` の `PAGE_CONTENT_SECURITY_POLICY`）。スクリプトは同じオリジンのファイルだけ（開発サーバのときだけ Vite の前置きのために `'unsafe-inline'`）。`style-src` は mermaid の図の `<style>` と立ち絵の SVG の `style` 属性のために `'unsafe-inline'` を許し、画像・書体・接続は同じオリジンと `data:` に閉じる。立ち絵の SVG の無害化（`docs/architecture/browser.md`「立ち絵の動き」）の後ろ盾。`/character/` の応答は `sandbox` 付きで、直接開かれた SVG も動かない                                                                                                                                                                                    |
| ログ                                               | 断ったときの理由（`REFUSED`）は定型文。サーバの stderr に会話を出さない                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 定着（雑談の記憶を畳む）                           | 仕事の窓（16 KiB）から溢れた会話（雑談と仕事）の逐語を、背景の使い捨て `query()`（同じマシンの claude の子プロセス。`persistSession: false`・ツールなし）に渡してエピソードとあらすじを書かせる。**ユーザーが認めた例外**（`docs/requirements.md` 2.2 の外部送信に当たらない。範囲と形は `docs/architecture/chat-mode.md` 4.9「窓から溢れた会話は定着で畳む」、置き場は `docs/architecture/character-pack.md`「雑談の記憶の置き場」）。渡した文面も受け取った出力も**画面にも 手続きの応答にも stderr にも出さない**（画面に出すのは話題の見出しだけ）。tsukumo は `/compact` を投げない                                                                                                                                                             |
| あらすじ                                           | `~/.tsukumo/chat-summary/<pack>.md` に**最新の1つだけ**を上書きで持つ（8 KiB まで。書くのは定着）。**ユーザーが認めた「別の場所に複製しない」の例外の1つ目**（範囲・理由・形・上限は `docs/architecture/chat-mode.md` 4.9、置き場は `docs/architecture/character-pack.md`「雑談の記憶の置き場」）。載せ直すのは**雑談と仕事のセッションの `systemPrompt`** で、雑談の条件は「新規に起こした」か「`/clear` を見たあと」の2つ（1行目の印が持つ）、仕事は起こすたび                                                                                                                                                                                                                                                                                     |
| 雑談の会話のアーカイブ                             | `~/.tsukumo/chat-archive/<pack>/<日付>.jsonl` に、雑談の依頼とセリフ、仕事の依頼の冒頭・最終レポートの `conclusion`・セリフを、表情つきで1行ずつ追記する（レポートの本文・ツールの入出力は書かない）。**ユーザーが認めた「別の場所に複製しない」の例外の2つ目**（範囲・理由・形・上限は `docs/architecture/chat-mode.md` 4.9、置き場は `docs/architecture/character-pack.md`「雑談の記憶の置き場」）。**画面の 100 ターンには影響されない。** 画面にも 手続きの応答にも stderr にも出さない                                                                                                                                                                                                                                                          |
| エピソード索引                                     | `~/.tsukumo/chat-archive/<pack>/episode.jsonl` に、定着が書いた見出し・要旨・手がかり語と、アーカイブの行の範囲を1件ずつ追記する（思い出した記録は `recalled.jsonl`。文面を持たない）。**例外の3つ目**。**逐語は持たず、アーカイブを指す目次**。`recall` の一覧と `recall_episode` の1件（8 KiB・1ターンに2件）だけがセッションの文脈（雑談・仕事）へ戻す（範囲と形は `docs/architecture/chat-mode.md` 4.9、置き場は `docs/architecture/character-pack.md`「雑談の記憶の置き場」）                                                                                                                                                                                                                                                                   |
| 直近の雑談を逐語で読み戻す                         | アーカイブの**新しいほうから雑談 64 KiB・仕事 16 KiB まで**を読み、**そのセッションの `systemPrompt`** へ逐語のまま載せる。載せる条件はあらすじと同じ。**渡す先はそこだけ**で、画面にも手続きの応答にも stderr にも出さない。逐語が新しいセッションの transcript に書かれることは承認に含まれる（範囲と量は `docs/architecture/chat-mode.md` 4.9「直近の会話は逐語のまま読み戻す」、読み口の置き場は `docs/architecture/character-pack.md`「雑談の記憶の置き場」）                                                                                                                                                                                                                                                                                   |
| 人格への書き戻し（覚えたこと）                     | 雑談で覚えたことを `~/.tsukumo/characters/<pack>/persona.md` の末尾の節へ1行ずつ足す。**利用者については書かない**（範囲・形・上限は `docs/architecture/chat-mode.md` 4.9）。会話の文面はディスクに届かない                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| コンテキストの内訳の記録                           | `~/.tsukumo/context-usage/<日付>.jsonl` に、**セッション1つにつき1行**だけ積む（最初のターンが終わったとき、`detail: "full"` で取った値）。**会話の複製ではない** — 入るのは数と、SDK が内訳として返す名前（分類の表示名・MCP ツール名・メモリファイルのパス・スキル名）だけで、文面の口が型に無い。**ターンごとのトークン消費の記録（`~/.tsukumo/token-usage/`）とは置き場も版も分ける** — 「書いてよいもの」の線が種類ごとに違い、同じファイルに混ぜると広いほうの線が狭いほうにもかかるため（線の正典は `src/shared/context-usage/context-usage-record.ts`）                                                                                                                                                                                      |
| 体験の数の記録                                     | `~/.tsukumo/experience-metric/<日付>.jsonl` に、**閉じた依頼1つにつき1行**と、**つまずきから立ち直るたびに1行**を積む（測り方は `docs/architecture/screen-design.md` 13.13「体験の数の記録」）。**会話の複製ではない** — 入るのは数（ミリ秒・回数）・時刻・セッションID・局面の名前だけで、文面の口が型に無い（線の正典は `src/shared/experience-metric/experience-metric-record.ts`）。外へは送らず、集計は `scripts/experience-metric.ts` が手元で読むだけ                                                                                                                                                                                                                                                                                         |
| 診断ログ                                           | `~/.tsukumo/diagnostic/<日付>.jsonl` に、不具合の経緯を追う足跡を積む（いまは畳んだ `SessionEvent` 1件につき1行。100 ミリ秒ごとに束ねて書く）。依頼を SDK へ渡してから SDK が書き終えるまで、または書き終えてから本体の最初のメッセージまでが 3 秒を超えたときだけ、区間のミリ秒の1行（`prompt-delay`）も書く。14日を過ぎた日付のファイルは起動のたびに消す。**会話の複製ではない** — 入るのは時刻・駆動の代・決まった語（イベントの種類の名前など）だけで、任意の文字列を受ける欄が型に無い。イベントの中身・`error.message` は入れない（線の正典は `src/shared/diagnostic/diagnostic-record.ts`、線の規約は `docs/coding-standards.md`「会話内容の扱い」）。外へは送らず、stderr にも出さない。読むのは `scripts/diagnostic.ts` が手元で並べるだけ |
| 見直しの結果と見送りの記録                         | `~/.tsukumo/usage-review.json`（前回の見直しの結果。直前の1回だけ）と `~/.tsukumo/usage-review-dismissed.json`（見送った提案の識別子）。**会話の複製ではない** — 入るのはスキルが渡した見直しの結果（`UsageReviewFindings`。見出し・根拠・やることの文字列を含むが、これ自体が「見直しの結果」であって会話ではない）と、種類:対象の形の識別子の文字列だけ（線の正典は `src/shared/usage-review/usage-review.ts`）                                                                                                                                                                                                                                                                                                                                    |
| 日記                                               | `~/.tsukumo/diary/<リポジトリ>/<日付>.json` に、振り返りの使い捨ての問い合わせでキャラクターが `diary` ツールで渡した日記（本文・しおり・表情）を、書いた時刻と書いたパックの名前を添えて日ごとに書き足す（**ユーザーの決定**。置き場と形は `src/server/diary/adapter/diary.ts` の冒頭）。**会話の複製ではない** — 入るのはツールが渡した日記（キャラクターがその日の仕事について書いた成果物）と、タスクの ID・`summary`・理由だけで、依頼の文面・セリフ・ほかのツールの引数と結果は通らない（線の正典は `src/shared/diary/diary.ts`）。**文面はログにも 手続きの応答にも stderr にも出さず、画面（成果の画面）にだけ配る**                                                                                                                         |
| おすすめの札のキャッシュ                           | `~/.tsukumo/recommendation.json` に、おすすめの札の問い合わせに渡した候補の並びと返った札（候補のキーと理由の1行）の組を新しい順に8件まで持つ。**会話の複製ではない** — 候補はタスク一覧（ID・要約・`difficulty`・依存）と中身を持たない「前回の続き」だけで、前のセッションの要約は渡さず書かない（`docs/coding-standards.md`「会話内容の扱い」。線の正典は `src/server/recommendation/core/recommendation-candidate.ts`）                                                                                                                                                                                                                                                                                                                          |
| タスク一覧の記憶                                   | `~/.tsukumo/task-summary.json` に、作業ディレクトリごとに最後に読めたタスク一覧（ID・要約・状態・`difficulty`・依存・本文）を新しい順に8件まで持つ。**会話の複製ではない** — 入るのは Beads の課題の要約と本文だけで、本文を含むのでログには出さない（線の正典は `src/server/repository/adapter/task-summary-memory.ts`）                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 迎えの挨拶の直近                                   | `~/.tsukumo/welcome-greeting.json` に、迎えの挨拶の問い合わせが書いた挨拶（札ありの文・札なしの文）を新しい順に5件まで持つ。**会話の複製ではない** — 問い合わせに渡すのは `persona.md`・表情の選択肢・月と曜日と時刻の帯・直近の挨拶・続きからの印と前回からの経過の帯だけで、会話から導いた材料は渡さない（`docs/coding-standards.md`「会話内容の扱い」）                                                                                                                                                                                                                                                                                                                                                                                           |
| テストのフィクスチャ・fake driver の疑似セッション | 手で書いた架空の会話だけ                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

- **SDK のイベントはユーザーの生の会話である。** 本文・ツールの入出力・`speak` の引数を、
  別の場所に複製しない、外部に送らない、ログに丸ごと出さない
  （`docs/coding-standards.md`「会話内容の扱い」）。**「複製しない」に認められた例外は
  3つだけ**（あらすじ・会話のアーカイブ・エピソード索引。記憶は雑談と仕事で1つ）で、範囲は同じ節の表が正典。
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

例外を認めた日付と発言は `docs/history/decision.md`「design.md 2〜11章（約1000行へ締めたときに落とした経緯と実測）」。

## 設計判断（なぜ今の形なのか）

この表は `pnpm run format` が ADR の1行目の題から書き直すので、手で直さない。

| ファイル                                                      | 判断                                                                       |
| ------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `docs/architecture/adr/0001-render-in-browser.md`             | 描く層をブラウザ側へ移す（2026-09-13）                                     |
| `docs/architecture/adr/0002-render-migration-tech-choice.md`  | 描く層の移行で決めた技術選択（2026-09-13〜17）                             |
| `docs/architecture/adr/0003-orca-owns-worktree.md`            | worktree を用意するのは orca で、tsukumo はやらない（2026-09-23）          |
| `docs/architecture/adr/0004-turn-number-from-record.md`       | ターンの通し番号は記録が持ち、位置では決めない（2026-09-22）               |
| `docs/architecture/adr/0005-css-module-output-in-temp.md`     | CSS Modules の成果物は一時ディレクトリへ出して読み、すぐ消す（2026-09-20） |
| `docs/architecture/adr/0006-prebuild-browser.md`              | ブラウザ側は事前に組み立てて置く（2026-09-21）                             |
| `docs/architecture/adr/0007-vite-build-cli.md`                | 組み立ては `vite build` の CLI を子プロセスで起こす（2026-09-27）          |
| `docs/architecture/adr/0008-sdk-instead-of-tui.md`            | Claude Code の TUI を捨て、SDK で動かす                                    |
| `docs/architecture/adr/0009-speech-via-tool.md`               | セリフはテキストの規約ではなく、ツール呼び出しで受け取る                   |
| `docs/architecture/adr/0010-report-via-tool.md`               | レポートはテキストではなく `report` ツールで受け取る                       |
| `docs/architecture/adr/0011-separate-shell-and-app.md`        | 箱（Orca のタブ）と中身（Web アプリ）を分ける                              |
| `docs/architecture/adr/0012-bundle-vendor-library.md`         | 外部ライブラリは CDN から読まず、同梱して自分で配る                        |
| `docs/architecture/adr/0013-tolerate-missing-display.md`      | 表示物が1つ欠けても起動失敗にしない                                        |
| `docs/architecture/adr/0014-no-bundled-character-asset.md`    | キャラクター素材はリポジトリに同梱しない                                   |
| `docs/architecture/adr/0015-single-host-port.md`              | ホスト依存の操作は1つのポートにまとめる                                    |
| `docs/architecture/adr/0016-html-instead-of-terminal.md`      | 表示はターミナル描画をやめて、すべて HTML にした                           |
| `docs/architecture/adr/0017-serve-from-local-http.md`         | HTML はローカルの HTTP サーバから配る（ファイルに書き出さない）            |
| `docs/architecture/adr/0018-single-page-view.md`              | ビューは1枚のページにまとめる                                              |
| `docs/architecture/adr/0019-layer-as-directory.md`            | 層をディレクトリで表し、依存の向きをテストで縛る                           |
| `docs/architecture/adr/0020-mixed-purity-in-adapter-file.md`  | 境界のファイルの中に、外の世界に触らない関数が混じっていてよい             |
| `docs/architecture/adr/0021-feature-state-fold-in-feature.md` | 機能だけが動かす状態の畳み方は、その機能の shared に置く（2026-09-30）     |
| `docs/architecture/adr/0022-three-setting-homes.md`           | 設定は誰の・何に属する値かで3つの置き場に割る（2026-10-03）                |
| `docs/architecture/adr/0023-local-diagnostic-log.md`          | 不具合の経緯は手元の1本の JSONL に、決まった語だけで残す（2026-10-04）     |
