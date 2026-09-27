# アーキテクチャ詳細

## このドキュメントの読み方

| 知りたいこと                                     | 見る場所                                                                                                                   |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| 各関数の引数・戻り値・分岐条件                   | **コード側のドキュメンテーションコメントが正典**                                                                           |
| 何をどこに置くか                                 | 「新しいコードを置く場所」（原則の要約はCLAUDE.mdに）                                                                      |
| なぜ今の形なのか（別の形に直そうとする前に読む） | 「設計判断（なぜ今の形なのか）」                                                                                           |
| 描画結果をどう検証するか                         | 「手で確かめること」                                                                                                       |
| 踏みやすい落とし穴                               | 「既知の制約・注意点」                                                                                                     |
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
| ## 現在の実装状況               | **どこまで動いていて、何が役目を終える途中か**                |
| ## 採用アーキテクチャ           | 全体像の図と、データの流れ3本                                 |
| ## 新しいコードを置く場所       | 原則1〜5の判断材料                                            |
| ## 設計判断（なぜ今の形なのか） | 今の形を別の形に直そうとする前に、一覧から該当する ADR を読む |
| ## 手で確かめること             | 自動チェックで捉えられない見た目の確認手順                    |
| ## 既知の制約・注意点           | 環境側の前提と、壊しやすいもの                                |

## 現在の実装状況

**2026-09-13 に「描く」層をブラウザ側へ移すと決め、同日中に段7まで終えた。** 移行後の形
（`shared` / `server` / `browser` の3層、WebSocket 1本のプロトコル、React の部品、unified の
Markdown、キャラクターパック）の正典は **`docs/design.md`**。**`src/` は `shared` / `server` /
`browser` の3層と配線（`src/` 直下）だけになった**（旧の `usecase` / `presentation` /
`infrastructure` は消えた）。**2026-09-16 にサーバ側だけをもう一段割り、外の世界に触る
ファイルを `src/server/adapter/` に出した**（2026-09-20 に `core` と `adapter` を `src/server/` の
下へ入れ子にした。`core` は純粋な判断だけになり、`node:` / SDK / `ws` を
import しない。辺は `adapter ──▶ core ──▶ shared ◀── browser` で **`core → adapter` は禁止**。
経緯は `docs/research/architecture-proposal.md`）。**2026-09-25 に、`core` と `adapter` の割りを
機能の中へ入れると決めた**（`src/server/<機能>/{core,adapter}/`。形は `docs/design.md` 2章
「サーバの機能と、機能どうしの辺」、移す段は同「いまの `src/server/` から移す先」。移し終える
までは、まだ移していないファイルが `src/server/core/` `src/server/adapter/` の直下に居る）。
以下「採用アーキテクチャ」はこの新しい経路（WebSocket 1本・
React の部品）を書いている。残るのは段8（キャラクターパック本体の移動・切り替え）と段9
（セッションの復元）で、これは独立した機能追加として `develop/task/` に別タスクである。
段階と完了条件は `docs/history/decision.md`「design.md 12. 移行の段階」
（`docs/design.md` からは 2026-09-21 に移した。章番号は詰めていない）。

**2026-09-11 に方針を全面的に見直した**（`docs/requirements.md` 3章）。新方針（Agent SDK で
Claude Code を動かす）の核（セッション駆動・イベントの変換・`speak` ツール・答え待ちの列）は
入っていて、`pnpm run start` はセッションを起こし、WebSocket 1本でフレームを組み立てて
3つのビューへ配る。**旧方針（transcript の追従・hook の状態ファイル・Orca 経由の入力送信）は
2026-09-12 に撤去した。** 残るホスト依存はビューを開く `showView` 1つだけ。最初に着手すべき
タスクは `develop/task/` が正典（`task status` で見る）。

実装スタックは **Node + TypeScript**、チェックコマンドは `pnpm run check`。
規約は `docs/coding-standards.md` が正典。

**拾うもの・捨てるもの・足すもの**（2026-09-11 の決定。「作り直し前提で始め、使えるものだけ拾う」）:

| 扱い       | もの                                                                                                                                                                                                                                                                                                     |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **拾う**   | キャラクター定義（`src/shared/character-pack/character.ts`）・表情と衣装の対応（`src/shared/character-pack/expression.ts`）・レポートの Markdown 化（`src/browser/components/page/conversation/components/main-view/markdown/markdown.tsx`）・ページと配信（`src/server/view-server/adapter/server.ts`） |
| **捨てる** | transcript の追従と乗り換え（`src/transcript.ts` / `src/transcript-target.ts`）・hook と状態ファイル（`hooks/state.sh` / `src/state.ts`）・Orca 経由の入力送信とキー送信（**2026-09-12 に撤去済み**）                                                                                                    |
| **足す**   | セッション駆動（SDK を起こし、イベントを内部の型に変える）・`speak` の MCP サーバ・入力と回答を受ける WebSocket                                                                                                                                                                                          |

### 各ファイルの責務

**2026-09-13 に段7まで進み、`src/` は新3層（`shared` / `server` / `browser`）と配線
（`src/` 直下のファイル）だけになった**（旧の `domain` / `usecase` / `presentation` /
`infrastructure` はすべて消えた）。**2026-09-16 に外の世界に触る境界を足した**ので、サーバ側は
`core`（判断）と `adapter`（境界）の2つに分かれている（2026-09-20 に両方を `src/server/` の
下へ入れ子にした）。

| ファイル                                                                                    | 層         | 責務                                                                                                                                                                |
| ------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/session/session-event.ts`                                                       | shared     | 内部イベント（判別可能な union）の型と、境界で見る**封筒だけ**のスキーマ                                                                                            |
| `src/shared/session/session-state.ts`                                                       | shared     | `SessionState` と `applySessionEvent(state, event, at)`。**サーバとブラウザが同じものを回す**                                                                       |
| `src/shared/session/main-view.ts`                                                           | shared     | メインビューに出す形（`MainViewEntry`）と、やり取り（ターン）ごとのまとめ                                                                                           |
| `src/shared/session/command-suggestion.ts`                                                  | shared     | 入力欄の `/` 補完に出す候補（姿から導くだけ。端末専用のコマンドを除く）                                                                                             |
| `src/shared/command.ts`                                                                     | shared     | ブラウザ → サーバのコマンド（**zod が正典**）と、許可モード・モデルの値の一覧                                                                                       |
| `src/shared/frame.ts`                                                                       | shared     | サーバ → ブラウザのフレームと `PROTOCOL_VERSION`。断られた理由の定型文もここ                                                                                        |
| `src/shared/session-driver/pending-ask.ts`                                                  | shared     | 答え待ちの語彙（`PendingAsk` / `Answer`）と、届いた答えの検証                                                                                                       |
| `src/shared/character-pack/expression.ts` / `character.ts` / `question.ts` / `utterance.ts` | shared     | 表情と衣装・いま出しているキャラクターの姿・質問・セリフと詳細の分け方（どれも純粋関数）                                                                            |
| `src/shared/character-pack/character-definition.ts`                                         | shared     | `character.json` そのものの形。解析と、1件を重ねた書き戻しの文字列（I/Oは持たない）                                                                                 |
| `src/shared/character-pack/character-asset.ts`                                              | shared     | `/character/<pack>/<file>` の URL・取り直しの印・拡張子による立ち絵の仕分け                                                                                         |
| `src/shared/character-pack/expression-choice.ts`                                            | shared     | `speak` が選べる表情とラベル（ラベルの出どころはキャラクター定義）                                                                                                  |
| `src/shared/repository/task-summary.ts`                                                     | shared     | `develop/task/T-xxx.md` の front matter の型と読み取り（ファイルI/Oは持たない）                                                                                     |
| `src/server/session-driver/core/sdk-message.ts`                                             | core       | SDK のメッセージを内部イベントに変換する。知らない種別は無視する                                                                                                    |
| `src/server/session-driver/core/session-driver.ts`                                          | core       | 駆動の契約（`SessionDriver` / `SessionDriverOptions` と既定値）。実装は持たない                                                                                     |
| `src/server/session-driver/adapter/sdk-driver.ts`                                           | adapter    | SDK でセッションを起こし（`query()`）、入力・中断・許可の応答を渡す。**SDK を呼ぶのは `sdk-` で始まるファイルだけ**（原則3）                                        |
| `src/server/session-driver/adapter/sdk-tool.ts`                                             | adapter    | tsukumo の MCP サーバと5つのツール（`speak` / `remember` / `forget` / `recall` / `recall_episode`）                                                                 |
| `src/server/session-driver/adapter/sdk-session.ts`                                          | adapter    | セッションの一覧・transcript の読み直し・印（続きから始めるものを探す・切り替え先を並べる）                                                                         |
| `src/server/session-driver/adapter/sdk-context-usage.ts`                                    | adapter    | コンテキストの内訳を問い合わせ、画面が要る形へ写す                                                                                                                  |
| `src/server/session-driver/adapter/fake-driver.ts`                                          | adapter    | 疑似セッション（`test/fixture/fake-session.json`）どおりにイベントを流す fake driver                                                                                |
| `src/server/session-driver/core/pending-answer.ts`                                          | core       | `canUseTool` に届いた許可要求・質問を積み、画面が答えるまで Promise を保留する                                                                                      |
| `src/server/session/core/session-manager.ts`                                                | core       | 時刻を打ち、サーバ側でも畳み、100ms でまとめて配る。**コマンドの分岐はここだけ**                                                                                    |
| `src/server/session/core/session-launch.ts`                                                 | core       | パックを決め、続きを探し、駆動を起こし、履歴を組み直すまでの順序（外の世界は渡される）                                                                              |
| `src/server/character-pack/core/character-selection.ts`                                     | core       | 初期パックの順位（指定 > 覚えた値 > 既定）・決め方の3つ・知らない名前を既定へ落とす判断                                                                             |
| `src/server/view-server/adapter/server.ts`                                                  | adapter    | ページ・同梱物・立ち絵・ファイル一覧の配信（`127.0.0.1` に listen するのはここ）                                                                                    |
| `src/server/view-server/adapter/session-socket.ts`                                          | adapter    | `/ws` の upgrade（起動トークンと Origin を確かめる）とコマンドの受け口                                                                                              |
| `src/server/core/config.ts`                                                                 | core       | 環境変数の読み取り。**`process.env` を読むのはここだけ**                                                                                                            |
| `src/server/view-server/core/port-resolution.ts`                                            | core       | ビューを配るポートの決定。既定は EADDRINUSE でずらし、明示指定は一度だけ試す                                                                                        |
| `src/server/view-server/adapter/bundle.ts`                                                  | adapter    | `vite build` で作った1組を `dist/browser/` に置く／そこから読む（起動は読むだけ）                                                                                   |
| `src/server/adapter/bundled-path.ts`                                                        | adapter    | 自分で持ち歩くもの（`characters/`・`node_modules/`）の置き場所を、起動先のディレクトリに依存せず解く                                                                |
| `src/server/character-pack/adapter/character-pack.ts`                                       | adapter    | キャラクターパックの列挙・読み込みと `/character/<pack>/<file>` が配ってよい1件の判定                                                                               |
| `src/server/repository/adapter/task-summary.ts`                                             | adapter    | `main` の `develop/task/` の読み直し。`main` の先端が変わったときだけ `tasks-changed` を起こす（`git rev-parse` / `git ls-tree` / `git cat-file --batch` を起こす） |
| `src/server/repository/adapter/git.ts`                                                      | adapter    | **`git` を起こすのはここだけ**。`task-summary.ts`・`main-history.ts`・`repository-file.ts` が使う                                                                   |
| `src/server/repository/adapter/repository-file.ts`                                          | adapter    | 入力欄の `@` 補完に配るパスの列挙。`git.ts` の `runGit` で `git ls-files` を呼ぶ（失敗したら空）                                                                    |
| `src/server/host/core/host.ts`                                                              | （ポート） | ホストに頼む操作の型。**ビューを見せる1つだけ**。特定のホストの語彙を入れない                                                                                       |
| `src/server/host/adapter/orca-host.ts`                                                      | adapter    | `src/server/host/core/host.ts` を Orca の CLI で実装する。**`orca` を呼ぶのはここだけ**                                                                             |
| `src/browser/main.tsx`                                                                      | browser    | ブラウザ側の入口。`<App>` を mount する（副作用はここだけ）                                                                                                         |
| `src/browser/app.tsx`                                                                       | browser    | `<App>`。Provider を重ねて `<Root>` を描く                                                                                                                          |
| `src/browser/components/app/root.tsx`                                                       | browser    | `<Root>`。サーバと繋ぎ（`useSessionConnection`）、パックの見た目を差し、版が合わないときの知らせと立ち絵の先読みをして `<Layout>` を描く                            |
| `src/browser/components/app/pack-appearance.ts`                                             | browser    | パックが差す `accent`・背景・日記の書体を `document.documentElement` の CSS 変数へ流す                                                                              |
| `src/browser/components/app/layout.tsx`                                                     | browser    | `<Layout>`。帯を最上部に置き、出す画面を選ぶ                                                                                                                        |
| `src/cli.ts`                                                                                | （配線）   | 入口。引数の受け取り・環境変数の読み出し・終了コードの返し方だけ                                                                                                    |
| `src/main.ts`                                                                               | （配線）   | 起動の段取り。**即時終了する前提不足（ポート・組み立て・疑似セッション）はここに集めてある**                                                                        |
| `src/current-character.ts`                                                                  | （配線）   | いま出しているパックと選択肢の持ち主。切り替え・画面からの編集で入れ替わるのはここだけ                                                                              |
| `src/view-delivery.ts`                                                                      | （配線）   | ビューの配信。ブラウザ側の配り方と開いているタブを持ち、サーバ・`/ws`・開発サーバを束ねる                                                                           |
| `src/session-start.ts`                                                                      | （配線）   | セッションを1つ起こす。どの駆動で起こすか・続きをどう探すかを決め、順序は `core` に任せる                                                                           |
| `scripts/open-views.ts`                                                                     | （道具）   | 配信中のビューをホストの中に開く。tsukumo 本体からは呼ばれない                                                                                                      |

- **`utterance.ts` はファイルI/Oを持たない。** 入力は文字列だけなので、フィクスチャの文字列で
  そのままテストできる
- **`server.ts` / `session-socket.ts` はテストする。** 「描く」側の入り口だが、配った結果は HTTP と WebSocket の
  両方で外から観測できるので、バインド先・経路・フレームの往復は自動で守れる。目視でしか
  確かめられないのは**ブラウザに出た絵**の側
- **`orca-host.ts` は自動テストの対象外。** 実際に Orca が動いていないと結果を確かめられない。
  ここに判断を書きたくなったら、それは「決める」側に置くべきものが漏れている合図

- **`host.ts` に残っているのは `showView` 1つだけ。** ペインの分割・ターミナルへの文字送信・
  キー送信は 2026-09-12 に撤去した（入力も回答もページ側で完結するようになったため）。
  箱を替えるときに差し替えるのもこの1つ（候補の比較は `docs/research/app-shell.md`）

- **`sdk-message.ts` は SDK の型を import しない。** 依存を機能の `adapter/` 直下の `sdk-` で始まる
  ファイルに閉じるため、届くメッセージは `unknown` で受けて検証する（外部由来の値なので、どのみち構造は
  信用しない）。おかげで変換のテストは SDK を起動しない
- **`session-state.ts` は純粋な畳み込み。** 姿から導くだけのもの（メインビューに出す形・`/`
  補完の候補）は `main-view.ts` / `command-suggestion.ts` に分けてある。状態を持つのはサーバ側の `session-manager` と
  ブラウザ側（`browser/stores/session.ts` の zustand の store）だけで、「イベント1件でどう変わるか」はすべてここのテストで守れる
- **`speak` のセリフは MCP の handler ではなく `assistant` メッセージの変換から取り出す。**
  handler は `"ok"` を返すだけにして、イベントの流れを1本に保つ

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

**境界のファイルの中に、外の世界に触らない関数が混じっていてよい**（2026-09-16 決定）。層は
「外の世界に触るか」で決め、**ファイルの中身の純度で割り直さない**。`adapter/character-pack.ts` の
`characterChangedEvent` はほとんど fs を読まない（読むのは一覧の1件ごとの「変えられるか」を決める
起動先の `characters/local` の有無だけ）が `core` へは出さない。
呼び出し側が配線層だけで、パックの供給元も fs の1つしかないので、割っても「型1つ + 一行関数」の
浅いモジュールが増え、同じ名前のファイルが2つの層に並ぶだけになる
（`docs/research/architecture-proposal.md` 7章が仮定として置いていた分岐は、これで確定）。
**`core` からパックの判断が要るようになったら、層を写した `core/character-pack.ts` ではなく概念で切る**
（同 3章の `core/character-selection.ts`）。

**同じ段落で、`systemPrompt` の append の組み立ては 2026-09-23 に
`system-prompt/core/system-prompt.ts`（`takeSystemPromptAppend`）へ移した。** 当時 `character-pack.ts` に
置いたままでよかったのは、並べるものが人格と規約の2つだけで、呼ぶ側が配線層1つだったから。
その後 `core` 側に規約の選び方（雑談か仕事か）と雑談の記憶の読み戻しが増え、**並びの持ち主が
配線層・`core`・`adapter` の3つに割れて、何がどの順で載るかを1ファイルで読めなくなった**。
これは上の「概念で切る」に当たる分岐で、層を写した `core/character-pack.ts` ではなく
**「`systemPrompt` を組む」という概念**でファイルを切った。`persona.md` の文面は adapter が
fs から読んだ**文字列**で渡すので、`core → adapter` の辺は増えない（パックの型も `core` へ
出ていない）。

## 設計判断（なぜ今の形なのか）

| ファイル                                                     | 判断                                                                       |
| ------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `docs/architecture/adr/0001-render-in-browser.md`            | 描く層をブラウザ側へ移す（2026-09-13）                                     |
| `docs/architecture/adr/0002-render-migration-tech-choice.md` | 描く層の移行で決めた技術選択（2026-09-13〜17）                             |
| `docs/architecture/adr/0003-orca-owns-worktree.md`           | worktree を用意するのは orca で、tsukumo はやらない（2026-09-23）          |
| `docs/architecture/adr/0004-turn-number-from-record.md`      | ターンの通し番号は記録が持ち、位置では決めない（2026-09-22）               |
| `docs/architecture/adr/0005-css-module-output-in-temp.md`    | CSS Modules の成果物は一時ディレクトリへ出して読み、すぐ消す（2026-09-20） |
| `docs/architecture/adr/0006-prebuild-browser.md`             | ブラウザ側は事前に組み立てて置く（2026-09-21）                             |
| `docs/architecture/adr/0007-vite-build-cli.md`               | 組み立ては `vite build` の CLI を子プロセスで起こす（2026-09-27）          |
| `docs/architecture/adr/0008-sdk-instead-of-tui.md`           | Claude Code の TUI を捨て、SDK で動かす                                    |
| `docs/architecture/adr/0009-speech-via-tool.md`              | セリフはテキストの規約ではなく、ツール呼び出しで受け取る                   |
| `docs/architecture/adr/0010-report-via-tool.md`              | レポートはテキストではなく `report` ツールで受け取る                       |
| `docs/architecture/adr/0011-separate-shell-and-app.md`       | 箱（Orca のタブ）と中身（Web アプリ）を分ける                              |
| `docs/architecture/adr/0012-bundle-vendor-library.md`        | 外部ライブラリは CDN から読まず、同梱して自分で配る                        |
| `docs/architecture/adr/0013-tolerate-missing-display.md`     | 表示物が1つ欠けても起動失敗にしない                                        |
| `docs/architecture/adr/0014-no-bundled-character-asset.md`   | キャラクター素材はリポジトリに同梱しない                                   |
| `docs/architecture/adr/0015-single-host-port.md`             | ホスト依存の操作は1つのポートにまとめる                                    |
| `docs/architecture/adr/0016-html-instead-of-terminal.md`     | 表示はターミナル描画をやめて、すべて HTML にした                           |
| `docs/architecture/adr/0017-serve-from-local-http.md`        | HTML はローカルの HTTP サーバから配る（ファイルに書き出さない）            |
| `docs/architecture/adr/0018-single-page-view.md`             | ビューは1枚のページにまとめる                                              |
| `docs/architecture/adr/0019-layer-as-directory.md`           | 層をディレクトリで表し、依存の向きをテストで縛る                           |

## 手で確かめること

**見た目（色・崩れ・間合い）は自動チェックで捉えられない。** 単体テストで守るのは「受け取る」
「決める」と配信そのもの（バインド先・経路・push）、**E2E で守るのは DOM の構造と画面の流れ**
（`docs/design.md` 10章「E2E の走らせ方」。`pnpm run check` の最後の段の `pnpm run test:e2e`）
まで。E2E のスクリーンショットは `/tmp/tsukumo-e2e/` に出るが判定には使わないので、表示に関わる変更をしたら、
次を確認してその結果を `evidence` に書く（`~/.claude/skills/task-workflow/WORKFLOW.md`
「良いevidenceの書き方」と `docs/workflow.md`「タスクを書くとき・受け入れるとき」）。

**fake driver（`TSUKUMO_DRIVER=fake`）で起こせる**ので、claude を起こさず（API を使わず）に
下の手順を回せる（`docs/design.md` 10章）。

**状態ごとの画面を並べて見るときは `node scripts/capture-catalog.ts`。** 疑似セッションの場面
（`test/fixture/fake-session.json` の `turns[].name`）ごとに tsukumo を1件ずつ空きポートで起こし、
広い窓（1400x900）と狭い窓（720x900・縦に積み替わるのでページ全体）で撮る。**同じ場面を別の
操作で何枚も撮る件があるので、名指しは場面の名前ではなく件の名前**（`--only notation-figure`
のように。`--only` に使える名前の一覧は `--help` で出る。**オプション無しで実行すると
カタログ全件を広い窓・狭い窓の2枚ずつ撮ってしまい、60秒では終わらないので踏まない**）。
**件によっては撮る前に操作を当ててから撮る**（領域の内側を送る・ボタンを押す・
入力欄に打つ・`location.hash` を書く、の4種だけ） — 疑似セッションを流しただけでは出ない
状態（記法の見本の下側・タスク一覧のモーダル・`/`と`@`の補完・キャラクター画面）をこれで出している。
`/tmp/tsukumo-catalog/index.html` に並べる（`--out` で置き場を変えられる）。**依頼を手で送らなくても狙った状態が出る**ので、
答え待ちの箱・レポートの記法を直したら前後で撮り比べる。1枚だけ撮って要素の位置と大きさを
数値で読むのは `capture-view.ts`（class セレクタで測るときは `[class*="…"]` — CSS Modules が
`名前_ハッシュ` に焼くため）。**撮った画像はリポジトリに置かない。** 疑似セッションの会話は架空でも、
**タスク一覧のモーダルを撮る件には `develop/task/` の実データのタスク一覧が写る**ので、
画像そのものを他所へ共有・複製しない。

**変更前と撮り比べるときは `node scripts/serve-revision.ts <コミット>`。** 名指ししたコミットを
`/tmp/tsukumo-revision/<sha>/` へ取り出し、そこで組み立てて、空けたポート（既定 7340）と一時ホームで
tsukumo を1つ起こし、URL を出す（`--scene` で疑似セッションの場面も流せる）。その URL を
`capture-view.ts` / `capture-catalog.ts` に渡して撮り、いま居る作業ツリーで起こしたほうと並べる。
**撮り終えたら `node scripts/stop.ts --port 7340` で必ず止める** — 起こしたものは自分では
止まらない（`stop.ts` が中の tsukumo を止めると、外側の `serve-revision.ts` も続いて終わるので、
打つのは1回でよい）。**利用者の tsukumo が 7327〜7330 あたりで動いていることがあるので、
そこは止めない・触らない。**

**変更前を手元に作らない。** `git stash` で退避する方法は採らない——**stash の stack は他の作業ツリーと
共有**なので、別のセッションの退避を取り違えうる。`git checkout` や手での書き戻しで一時的に変更前へ
巻き戻す方法も採らない——戻し忘れると書きかけの変更を失うし、`dist/browser/` が変更前のまま残る
（受け入れ側で `pnpm run build` を打ち直すことになる）。`serve-revision.ts` は取り出しに
**一時 index**（`GIT_INDEX_FILE`）を使うので、**作業ツリーも index も `dist/browser/` も読むだけ**で
済む。`node_modules` はいま居る作業ツリーのものを symlink で借りるので `pnpm install` も要らない
（**`package.json` をまたいで比べるときだけ**この前提が崩れる。そのときは取り出し先で手で打つ）。
**`.git` も同じく symlink で借りる**ので、取り出し先で起こした tsukumo でも成果の画面が `main`
の履歴を表示する（`.git` を書き換える呼び出しはここを通らない——読むだけの `git` しか打たない。
`scripts/serve-revision.ts` の `lendGitDirectory`）。
手順の前後で `git status --short` が変わっていないことを確かめてから `evidence` を書く。

**配信側が疑わしいときは、ブラウザを開く前に `curl` で切り分ける。** 起動時にビューの URL が
表示されるので、`curl <URL>` で HTML が返るかを見る。WebSocket 側はブラウザの開発者ツールの
Network タブで `/ws` の upgrade が101を返し、`hello` フレーム（購読 `frame.subscribe` の封筒の中の `d.json`）が届くかを見る。ここまで出ていれば
配信はシロで、原因はページの側かホストの側にある。

**目視のために起こす tsukumo は `TSUKUMO_VIEW_PORT` を 39000 番台に固定し**、ふだん使いの既定
（7327 から始まる帯）と重ねない。`node scripts/stop.ts --port` は自分で起こしたポートにだけ打つ。
**起こしたままの tsukumo は `pnpm run build` を打ち直しても古い組み立てを配り続ける。** 直しながら
目視するなら `--dev` で起こす（`pnpm run dev`。HMR で差し替わる）か、組み立てのたびに上げ直す。

1. **`pnpm run build` を打ってから** Orca のターミナルで `pnpm run start` を1つ起動する
   （Claude Code の TUI は開かない）。成果物が無いと起動は前提不足で止まり、`src/browser/` の
   ほうが新しいと「古い画面が出る」1行が出る
2. **tsukumo 自身がレイアウトページのタブを開く**ので、それが**Orca 内のブラウザタブ**に
   出ること（外部ブラウザに出ないこと）を見る。タブだけ閉じてしまったときは
   `node scripts/open-views.ts <URL>` で開き直せる
3. **画面の入力欄から依頼を打つ**。送信できること、実行中に中断できること
4. **再読み込みなしに**吹き出しにセリフが出て、メインビューにレポートが流れること
5. ツールを使う依頼で、**帯の「いまの作業」の札に進行が出て、押すと依頼の手順の一覧が開く**こと
6. 許可の要る操作を頼み、**右下の入力欄の上にボタンが出て、枠の色とタブのタイトルが変わり、押すと
   作業が続く**こと
7. ウィンドウの幅を変えて、**折り返しがブラウザ側で追従する**こと
8. `orca` が使えない状況を作っても、プロセスが落ちずに配信を続けること
9. レポートに出た git 管理下のパス（inline code・フェンスのファイル名・相対リンク）を押すと、
   **Orca のエディタでそのファイルが開く**こと（`docs/display.md` 4.2「各表示物」）

`evidence` には「どの環境で何を見たか」を1行で書く。

**claude が自分で始めた続きのターン（`turn-resumed`）の合間を測るときは、疑似セッションの場面
`resumed-report`（`TSUKUMO_FAKE_SCENE=resumed-report`）を使う。** 中間の `report` のあと、
`turn-resumed` → `speech` → ターンの終わりを2回はさみ、最後に完了の一言と最終 `report` が続く。
`turn-resumed` が届いてから次の `speech` / `report` が届くまでのあいだも、メインビューは前の
`report` を出したままで、吹き出しは「（まだ発話がありません）」に戻らず前のセリフを保っている
ことを確かめる（`docs/screen-design.md` 13.9「背景のタスク」）。

**書き終わりの知らせ（`docs/screen-design.md` 13.10「書き終わりの知らせ」）を確かめるときは
疑似セッションの場面 `diary-written`（`TSUKUMO_FAKE_SCENE=diary-written`）を使う。** `diary-requested`
→ `diary-drafting` → `diary-stage`（`write` → `pick`）→ `diary-written` と流れ、成果の画面
（`#achievement?date=2026-09-20`）でも会話の画面でも画面の下中央に札が出ることと、「日記帳で開く」で
その日の見開きが開くこと、× で消えて再読み込みするまで戻らないことを見る。日記の中身（本文・
しおり）も見るときは、`~/.tsukumo/diary/<リポジトリ>/2026-09-20.json`（`TSUKUMO_HOME` を
分けていればその下。置き場の形は `src/server/diary/adapter/diary.ts`）に架空の日記を1件置いてから
起こす——fake driver は `diary` ツールの中身を持たないので、置かなければ手続き `achievement.day` の
その日は「日記が無い」のまま。**この置く手間ごと `capture-catalog.ts` の `diary-book` 件がやる**
（次の段落）ので、見開きを撮るだけなら手で置かなくてよい。

**帯の「いまの作業」の実行中・失敗・背景のタスク、表情やキャラクターを消す確認のモーダル、
日記帳の見開きは、`capture-catalog.ts` に専用の件があるのでそれぞれ手で操作を当てなくてよい**
（`--only <名前>` で1件だけ撮れる）。`current-work-running` / `current-work-failed` は、
名指しで直接起こしても状態が出るよう**自分の `request` を持つ場面**
（`test/fixture/fake-session.json` の同名の場面）を使う——`request` の無い場面は
`src/shared/session/turn-step.ts` の `currentTurnSteps` が「依頼が一度も無い」に畳んで、途中の
`tool-started` があっても帯の一覧に出ない。`current-work-background` は既存の `background-task`
場面をそのまま使う。`portrait-clear-confirm` / `character-delete-confirm` /
`diary-book` は**件専用の隔離ホーム**（`--out` の下の `home/`）を使う——`HomeSetup`
（`scripts/capture-catalog.ts`）が、消せるキャラクターパック（同梱の `chou` を別名でコピー）や
架空の日記を、撮る前にそこへ書く。**既定のホーム（利用者の `~/.tsukumo/`）には触らない。**

**訪問（`docs/requirements.md` 4.13「訪問」）の出入りを確かめるときは、`TSUKUMO_VISIT_QUICK=1`
を添えて疑似セッションの場面 `visit-long-tool` か `visit-background` を使う**（しきい値が 5 秒に
縮む。添えないと 90 秒待つ）。画面にはまだ描かないので、見るのは状態だけ——開発者ツールの
Network タブで `/ws` のフレームを見るか、接続し直して `hello` の `state.visit` を読む。
`visit-long-tool` はツールが 30 秒走り、5 秒ほどで `visit-started` が届き、2 秒ごとに
`visit-line-advanced` が進んで、台本を言い終えると `visit-ended`（`script-finished`）になる。同じ
待ちのあいだに二度は来ない。`visit-background` は背景のタスクだけが動く待ちで来て、9 秒で待ちが
終わると台本の途中でも `visit-ended`（`wait-over`）になる。訪問中に入力欄から依頼を送ると
`request` で帰ることも、ここで確かめられる。客は同梱の `chou` で、**ホームに `visit` の無い
`chou` があると来ない**（ホームのパックが同梱を覆うため）。

**fake driver の質問の場面を Playwright で自動操作すると、`turnInProgress` が解けないまま残る
ことがある**（再現条件は分かっておらず、手で触ったときには起きていない。操作側の問題の
可能性もある）。そのときは疑似セッションの `opening` に質問を足して、開いた時点で出す形で
確かめる。もう一度踏んだら条件を書き足す。

## 既知の制約・注意点

- **`~/.claude/settings.json` の hooks と statusLine は orca（`~/.orca/agent-hooks/`）が
  専有している。** 設定を足すときは既存エントリを壊さず追記する。上書きすると orca 側が
  黙って動かなくなる。**tsukumo 自身は hook を使わない**（旧方針のエントリ5件は 2026-09-12 に
  外した。残っている12件はすべて orca のもの）
- **SDK のイベント種別は増えうる。** 旧方針で transcript の `type` が実際に増えたのを観測して
  いる（2026-09-08 → 2026-09-09 で5種類増えた）。**知らないものは無視して落ちないこと**
- **SDK のイベントはユーザーの生の会話である。** 本文・ツールの入出力・`speak` の引数を、
  別の場所に複製しない、外部に送らない、ログに丸ごと出さない
  （`docs/coding-standards.md`「会話内容の扱い」）。**「複製しない」に認められた例外は
  雑談モードの3つだけ**（あらすじ・会話のアーカイブ・エピソード索引）で、範囲は同じ節の表が正典。
  **本文・ツールの入出力はその例外に入らない**
- **`thinking` は表示しない。** モデルの内部の思考なので、出すと事故になる
- **ビューは 127.0.0.1 に配られるので、同じマシンの他のプロセスからは読める。** 単一利用者の
  開発機を前提にした割り切りで、外からは届かないことだけを保証している。認証を足すより先に、
  この前提が変わっていないかを確認する
- **ビューの本文はメモリにしかない。** プロセスを落とすとブラウザのタブは繋ぎ先を失う
  （WebSocket が指数バックオフで繋ぎ直し続ける。`docs/design.md` 3章「再接続」）。起動し直せば
  同じ URL でそのまま復帰し、**前の続きから始まる**（claude 側の会話は `resume`、画面の履歴は
  transcript の読み直しで戻る。`docs/requirements.md` 4.8）
- **Orca はエージェント端末への合成入力を弾く**（2026-09-11 実測）。`orca terminal send` も
  `orca keypress` も claude の端末には届かない。**この経路に戻ろうとしないこと**
- **ホストのポートにあるのは `showView` と `openFile` の2つ**（2026-09-12 にペインの分割・
  文字送信・キー送信を撤去し、2026-09-24 に `openFile` を足した）。ここに操作を足す前に、
  ページ側で完結しない理由があるかを確かめる
- **リポジトリの外に置いたのは `pnpm link --global` の2つだけ**（2026-09-12。2026-09-27 に
  `bun link` から移した）。`~/Library/pnpm/tsukumo`（`bin/tsukumo` へのシンボリックリンク）と
  `~/Library/pnpm/global/` 配下（pnpm が管理する登録簿）。**シェルの設定ファイルは書き換えていない。**
  消すときはリポジトリの直下で `pnpm unlink --global`
- **`~/.tsukumo/` は旧方針の hook が使っていた置き場を再利用している**（2026-09-15 に整理）。
  `state.json` は当時「イベント種別とモデル名」を書く場所で、いまは**次に起こすときの初期値**
  （覚えたキャラクターの名前と、新しいセッションの既定。`src/server/session/adapter/remembered-default.ts`）。**形の違う古いファイルが残っていると読めずに既定のパックへ
  落ちる**（旧形式の `state.json` が残っていたせいで、前回選んだキャラクターを覚える仕組みを
  入れた直後の1回だけ意図しないキャラクターで立ち上がった）。旧方針の残骸（`targets/`・`transcript-path`・書きかけの
  `state.json.tmp.*`）は消してある。**同じ置き場に別の用途を足すときは、先に何が残っているかを見る**
- **cwd に依存してよいのは起動先プロジェクトのものだけ。** 作業ディレクトリ・
  `develop/task/`・相対指定で渡した素材（`TSUKUMO_CHARACTER` に相対パスを渡した場合）
  はそこに当たる。**自分で持ち歩くもの（既定の立ち絵・`node_modules` の外部ライブラリ）は
  tsukumo 自身の場所から読む**（`src/server/adapter/bundled-path.ts`）。`tsukumo` コマンドをどの
  プロジェクトのディレクトリで起こしても見つかるようにするための区別
- **出力スタイル（`~/.claude/output-styles/`）はセッションを起こしたときにしか読まれない。**
  `/clear` では読み直されない（2026-09-10 実測）。書き換えを効かせるには tsukumo を起こし直す
