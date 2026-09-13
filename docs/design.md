# 設計書（描く層をブラウザ側へ移す）

最終更新: 2026-09-13（起こした日。**移行の決定は同日**。経緯と採らなかった案は
`docs/research/architecture-rethink.md`）
ステータス: **正典**。**構造の移行は段7まで完了**（`protocol` / `core` / `ui` の3層 +
`cli.ts`。`docs/architecture.md`「現在の実装状況」）。残る段8（キャラクターパック）・段9
（セッションの復元）は末尾「移行の段階」の完了条件どおり、別タスクとして進める。

## このドキュメントの読み方

### このファイルは通読しない

節を1つ特定して、その節だけを次の形で読む:

```bash
sed -n '/^## 4\. protocol/,/^## /p' docs/design.md
```

### 節の索引

| 節                             | 中身                                                                       |
| ------------------------------ | -------------------------------------------------------------------------- |
| ## 1. 何を変え、何を残すか     | 決定の要約。**最初にここ**                                                 |
| ## 2. 全体構成                 | 3層（protocol / core / ui）の図、依存の向き、ディレクトリ                  |
| ## 3. 動きの流れ               | 起動・接続・依頼・答え待ち・再接続の順序                                   |
| ## 4. protocol                 | **両側が共有する契約**。イベント・状態・reducer・コマンド・フレーム・版    |
| ## 5. core                     | サーバ側のモジュールと責務。セッション管理・キャラクターパック・偽の駆動   |
| ## 6. ui                       | ブラウザ側の部品の木、状態の持ち方、Markdown、重いライブラリ、立ち絵の動き |
| ## 7. キャラクターパック       | `character.json` + `persona.md` + 素材。人格の注入と切り替え               |
| ## 8. セッションの復元と複数化 | 復元（4.8）を新しい形に載せる。複数セッションへ広げる余地                  |
| ## 9. 会話内容と安全           | `127.0.0.1`・Origin・起動トークン・ディスクに書かない・ブラウザ側のメモリ  |
| ## 10. テスト                  | reducer・スキーマ・部品・偽の駆動 + Playwright・層の検査                   |
| ## 11. ビルドと依存            | `bun build` の入口、tsconfig、**足す依存の一覧（承認済み）**               |
| ## 12. 移行の段階              | 併走の仕組み、段ごとの完了条件、消えるもの、既存タスクとの関係             |

## 1. 何を変え、何を残すか

**変えるのは「描く」層の重心だけ。** サーバが HTML 文字列を組み立てて Server-Sent Events で押し、
ブラウザが Idiomorph で当てる形をやめ、**両側が共有する型付きプロトコルでイベントを押し、
ブラウザ側の React の部品が状態から描く**形にする。言語は TypeScript のまま、ランタイムは当面 Bun
（Node で動く形を保つ）。

| 残すもの                                                                     | 変えるもの                                                           |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Agent SDK で Claude Code を動かす。SDK を import する場所を1ファイルに閉じる | サーバ側の HTML 組み立て（`presentation/view.ts`）→ ブラウザ側の部品 |
| `speak(text, expression)` の MCP ツール。戻り値は `"ok"` だけ                | SSE 5本 + POST 6本 → WebSocket 1本（フレームとコマンド）             |
| `SessionEvent` の union と `applySessionEvent` の純粋な畳み込み              | 自前の Markdown レンダラとサニタイザ → unified（remark / rehype）    |
| 答え待ちの列（`canUseTool` の Promise を保留する）                           | 4層（domain / usecase / presentation / infrastructure）→ 3層         |
| 会話をプロセスの外へ出さない。`127.0.0.1` だけ。ディスクに書かない           | キャラクター定義 → 人格を含む**パック**                              |
| 起動時に `bun build` で束ねてメモリから配る（ディスクに成果物を置かない）    | 1プロセス = 1セッション固定 → 鍵付きの `SessionManager`（いまは1つ） |
| ホストのポート（`showView` 1つ）と Orca のアダプタ                           | HTML の文字列一致のテスト → 部品のテストと偽の駆動                   |

**決めたこと**（迷ったら蒸し返さない。理由は `docs/research/architecture-rethink.md`）:

- UI は **React 19**。Preact は alias で差し替えられる位置に置く（`bun build` の `--define` / alias）
- 通信は **WebSocket 1本**（`ws` パッケージ。`Bun.serve` の WebSocket に寄せない）
- Markdown は **react-markdown + remark-gfm + rehype-raw + rehype-sanitize + rehype-highlight**
- 立ち絵は**動くが話さない**（表情の遷移・まばたき・登場と退場の演出。音声・口パクは持たない）
- 端末ペイン（PTY）は持たない。**設計上の余地も残さない**（2026-09-13。用途が無いことを確認した）
- **TypeScript は本質的な選択、Bun はそうではない**（2026-09-13 のユーザーの問い「既存だからではなく
  本質的な最善手か」への答え）。Agent SDK の公式実装は TypeScript と Python だけで、表示はどの箱でも
  ブラウザの JS なので、**両端を1言語で通せるのは TypeScript だけ**（reducer と zod を両側で共有する
  この設計は、それが無いと成立しない）。**Bun は「道具が1つで済む」以上の実利が無く**、Node 22.18 以降 +
  Vite + Vitest で同じことができ参考資料はそちらが多い。それでも当面 Bun なのは移行の作業量を増やさない
  ためで、**`Bun.*` に寄せない規約を保ち、箱を決めるとき（T-046）に Node へ寄せるかを判断する**
  （Electron なら core を Electron の Node で動かせるので Bun は不要になる）

## 2. 全体構成

```
┌────────────────────────────────────────────────────────────┐
│ ui（ブラウザ。React）                                       │
│   <App> ─ <Layout> ─ Main / Character / Sidebar / Dispatch  │
│   状態 = protocol の SessionState（reducer は core と同じ物） │
└──────────────▲───────────────────────────┬─────────────────┘
               │ ServerFrame                │ ClientCommand
               │  hello（snapshot）/ events  │  prompt / answer / …
               │        WebSocket 1本（127.0.0.1、起動トークン付き）
┌──────────────┴───────────────────────────▼─────────────────┐
│ core（Bun。Node でも動く形）                                 │
│   session-manager ── session-driver（SDK）／ fake-driver     │
│   character-pack ／ task-summary ／ config ／ bundle         │
│   server（http: ページ・束ねた JS/CSS・vendor・立ち絵 / ws）  │
│   host（showView）── orca-host                               │
└──────────────▲───────────────────────────┬─────────────────┘
               │ SDKMessage                 │ query / interrupt / canUseTool
┌──────────────┴───────────────────────────▼─────────────────┐
│ Claude Code（SDK が起こす子プロセス）                         │
└────────────────────────────────────────────────────────────┘
      protocol（語彙・イベント・状態・reducer・zod スキーマ。ui と core の両方が import する）
```

### 層と依存の向き

**この形は「共有コントラクト＋クライアント/サーバ分割」で、旧の4層（クリーンアーキテクチャの
写し）とは別物**。`protocol` は TypeScript のモノレポでいう `packages/shared` / `contracts`
の位置（サーバとブラウザの両方が import する契約）、`core` はサーバ、`ui` はクライアントで、
「受け取る／決める／描く」という役割の分割ではなく「どちらの実行環境で動くか」で分けている。

| 層         | 置くもの                                                                                  | import してよい先                   | 実行場所         |
| ---------- | ----------------------------------------------------------------------------------------- | ----------------------------------- | ---------------- |
| `protocol` | 概念の語彙・`SessionEvent`・`SessionState`・`applySessionEvent`・コマンドとフレームの zod | `protocol` のみ（`zod` は可）       | サーバとブラウザ |
| `core`     | SDK・WebSocket・HTTP・ホスト・ファイル・環境変数・セッション管理・偽の駆動                | `protocol`                          | サーバ（Bun）    |
| `ui`       | React の部品・hooks・CSS・Markdown の変換                                                 | `protocol`（React などの npm は可） | ブラウザ         |
| `cli.ts`   | 配線（composition root）                                                                  | すべて                              | サーバ           |

- **`core` と `ui` は互いを import しない。** 両者が知っているのは `protocol` だけ
- **`protocol` は `node:` も `document` も触らない。** これは設計上の好みではなく**物理的な制約**
  である。`protocol` はサーバ（Bun/Node）とブラウザの両方の実行環境で読み込まれるので、
  片方にしか無い API（`node:fs` や `document` など）に触れた時点でもう片方で動かなくなる。
  純粋関数と型と zod スキーマだけが両方で動く共通部分
- 許した辺以外は `test/architecture.test.ts` が落とす（辺は上の3本）

### ディレクトリ

```
src/
  cli.ts                      配線。環境変数の受け取り・起動時の前提チェック・終了処理
  protocol/
    session-event.ts          SessionEvent（zod と z.infer）
    session-state.ts          SessionState と applySessionEvent（いまの session-view.ts）
    command.ts                ClientCommand（zod）
    frame.ts                  ServerFrame（zod）・PROTOCOL_VERSION
    expression.ts / question.ts / pending-ask.ts / task-summary.ts / character.ts
                              語彙（いまの domain のうち、両側が使うもの）
  core/
    session-driver.ts         SDK を import する唯一の場所（いまのまま）
    fake-driver.ts            台本どおりに SessionEvent を流す SessionDriver
    session-manager.ts        sessionId → { driver, state, subscribers }。reducer をサーバ側でも回す
    pending-answer.ts         答え待ちの列（いまのまま。SDK の canUseTool に結び付くので core）
    character-pack.ts         パックの列挙・読み込み（character.json / persona.md / 素材）
    task-summary.ts           develop/tasks.json の読み直し（変化を tasks-changed イベントにする）
    server.ts                 http（ページ・/assets・/vendor・/character）+ ws（フレームとコマンド）
    bundle.ts                 bun build（ui の入口と CSS）
    config.ts                 環境変数の読み取り（ここ以外で process.env に触らない）
    host.ts / orca-host.ts    いまのまま
  ui/
    main.tsx                  入口。<App> を mount する（副作用はここだけ）
    app.tsx                   接続・状態・コマンドの配り口（Context）
    socket.ts                 WebSocket の接続・再接続・フレームの検証
    layout/                   Layout・領域の枠・リサイザ
    main-view/                TurnTabs・Turn・Report（Markdown）・ToolRun・QuestionRecord
    character-view/           Portrait・BalloonTrack・Balloon・動きの hooks
    sidebar/                  Activity・TaskList・SessionInfo
    dispatch/                 Composer・CommandSuggestions・PendingAnswer・TurnStatus
    report/                   markdown.tsx（unified の設定）・sanitize-schema.ts・MermaidBlock・ChartBlock
    style/                    いまの .css を部品ごとに置き直す
test/                         src/<相対パス>.ts → test/<相対パス>.test.ts（いまのまま）
characters/<name>/            character.json・persona.md・素材
vendor/                       mermaid・Chart.js・highlight のテーマ CSS（Idiomorph は消える）
```

**ファイル名は概念**（原則5）。`helpers` / `utils` / `common` は作らない。ディレクトリもファイルも単数形
（`main-view/` のように領域名は用語集の語に合わせる）。

## 3. 動きの流れ

### 起動

1. `cli.ts` が `config.ts` で環境変数を読む（ポート・キャラクター・自動オープン・駆動の種類・新規起動）
2. `bundle.ts` が `ui/main.tsx` と `ui/style/main.css` を `bun build` で束ね、メモリに持つ
   （失敗は起動時の前提不足として即時終了。いまと同じ）
3. `character-pack.ts` が既定のパック（または指定されたもの）を読む
4. `server.ts` が `127.0.0.1` で listen し、**起動トークン**を1つ作る
5. `session-manager.ts` がセッションを1つ作る。駆動は `TSUKUMO_DRIVER` が `fake` なら偽の駆動、
   それ以外は SDK。復元（8章）はここで判定する
6. ホストのポートで `http://127.0.0.1:<port>/?t=<token>` を開く（失敗しても続行）

### 接続

1. ページが `/assets/ui.js` を読み、`<App>` が `/ws?t=<token>` へ接続する
2. サーバは Origin とトークンを確かめ、**`hello` フレーム**（`PROTOCOL_VERSION`・`sessionId`・
   `SessionState` の snapshot・キャラクターの見せ方）を1つ返す
3. 以降、セッションで起きたイベントを **50〜100ms ごとにまとめた `events` フレーム**で押す。
   ブラウザは同じ `applySessionEvent` で畳む。**サーバとブラウザの `SessionState` は構造的に同じ**

### 依頼

1. Composer が `{ type: "prompt", commandId, text }` を送る
2. サーバは zod で検証し、`SessionManager.dispatch(sessionId, command)` → 駆動の `prompt(text)`。
   駆動が `request` イベントを起こし、それが `events` で戻ってくる（**ブラウザはローカルで
   echo しない**。ターンの開始はサーバのイベントで知る）
3. 断片（`partial-utterance`）は1バッチ内で連結して1件にする（転送量の抑制。畳み込みの結果は同じ）
4. 受け付けられないとき（検証に落ちた・セッションがまだ無い・駆動が失敗を返した）は
   `{ type: "error", commandId, reason }` を返す。理由は定型文で、**依頼の文面を含めない**

### 答え待ち

1. `canUseTool` → `pending-answer.ts` の列 → `pending-changed` イベント → 状態の `pending`
2. PendingAnswer 部品が `pending[0]` を描く。押されたら `{ type: "answer", commandId, id, answer }`
3. 列が解決 → `pending-changed` → 箱が消える。解決済みの id への回答は `error`（いまの 409 と同じ）

### 再接続

WebSocket が切れたらブラウザは指数バックオフで繋ぎ直し、**新しい `hello` の snapshot で状態を
置き換える**（差分の取りこぼしを気にしない）。プロセスが落ちている間は「接続が切れている」印を
Layout に出す。復帰したときの「セッションは新規か続きか」は 8章。

## 4. protocol

**zod を使うのは境界の書き込み側と封筒だけ**（2026-09-13、段2 の着手前に決めた）。
`ClientCommand` は**全部 zod が正典**で型は `z.infer`（ブラウザから届く書き込みの経路なので厳密に見る。
`text` の上限もここ）。`ServerFrame` は**封筒（`type` / `protocolVersion`）だけ** zod で、中身
（`state` / `events`）は検証しない。**`SessionEvent` と `SessionState` は zod にしない**（TS の型のまま。
状態にフィールドを1つ足すたびにスキーマを二重に直す手間が、段3〜段9 の各段で効いてくるため）。
境界（WebSocket の両端）で1回だけ検証し、中では検証済みの型を使う。`protocol` の中に `node:` も
`document` も持ち込まない。

### 4.1 SessionEvent

いまの `src/domain/session-event.ts` の union をそのまま持ち越し、次を足す。

| イベント            | 出どころ                  | 中身                                                              | 用途                                                                             |
| ------------------- | ------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `tasks-changed`     | core（`task-summary`）    | `tasks: TaskSummaryItem[] \| undefined`                           | サイドバーのタスク一覧。読み直しは core が mtime で行う                          |
| `character-changed` | core（`character-pack`）  | `name`・`expressions`・`portraits`（表情 → URL）・`outfitAccents` | キャラビューが立ち絵を取りに行く先。切り替え（7章）                              |
| `session-restored`  | core（`session-manager`） | `sessionId`                                                       | 「続きから始まった」表示（8章）                                                  |
| `session-started`   | core（`session-manager`） | `sessionId`・`cwd`                                                | 新規に起きた合図。`session-info`（`init`）は最初の依頼まで届かないので、別に持つ |

イベントは**時刻を持って**送る: `StampedEvent = { at: number; event: SessionEvent }`。`at` は
サーバの `Date.now()`。reducer は `applySessionEvent(state, event, at)`（いまの第3引数 `now` と同じ）。
**ブラウザ側で `Date.now()` を reducer に渡さない**（両側の状態が同じになるように、時刻はイベントの
発生側が決める）。

### 4.2 SessionState

いまの `SessionView` を改名して持ち越し、次を足す。

| 追加                                                               | 出どころ                              | 理由                                                                             |
| ------------------------------------------------------------------ | ------------------------------------- | -------------------------------------------------------------------------------- |
| `turnStartedAt` / `turnFinishedAt`                                 | `request` / `turn-finished` の `at`   | いまは `event-sink.ts` が畳み込みの外で持っている。`at` が来るので中に入れられる |
| `tasks`                                                            | `tasks-changed`                       | サイドバー                                                                       |
| `character`（`name`・`portraits`・`outfitAccents`・`expressions`） | `character-changed`                   | 立ち絵の取り先。**素材そのものは入れない**（URL だけ）                           |
| `restored: boolean`                                                | `session-restored`                    | 続きから始まったことの表示                                                       |
| `connection`                                                       | **ブラウザだけ**が持つ（`ui` の状態） | 接続中／切断中。`SessionState` には入れない（サーバ側に意味が無い）              |

`speeches.slice(-1)`（`request` で前のターンの最後の1件だけ残す）・`speechCalledInTurn`・行頭マーカーの
補助・`MAX_SESSION_VIEW_TURNS` の窓、といった**畳み込みの規則はいまのまま**。テストも持ち越す。

**経過時間の表示**は `turnStartedAt` / `turnFinishedAt` から ui が計算する（1秒ごとの刻みは ui の
ローカルな時計。`SessionState` に秒数は入れない）。

### 4.3 ClientCommand

```ts
type ClientCommand =
  | { type: "prompt"; commandId: string; text: string }
  | { type: "interrupt"; commandId: string }
  | { type: "answer"; commandId: string; id: string; answer: Answer }
  | { type: "set-model"; commandId: string; model: ModelAlias }
  | { type: "set-permission-mode"; commandId: string; mode: PermissionMode }
  | { type: "switch-character"; commandId: string; name: string } // 7章。段8 で足す
  | { type: "new-session"; commandId: string } // 8章。段9 で足す
```

- `commandId` はブラウザが作る（`crypto.randomUUID()`）。`error` フレームの突き合わせにだけ使う
- `text` の上限はいまの `MAX_DISPATCH_TEXT_LENGTH`（20,000 文字）を zod の `max` に移す
- `PermissionMode` と `ModelAlias` の値の一覧は **`protocol` に1つだけ置く**（いまは
  `session-driver.ts` と `view.ts` に写しがある。SDK の型との一致は `core` 側のテストで守る）

### 4.4 ServerFrame

```ts
type ServerFrame =
  | { type: "hello"; protocolVersion: number; sessionId: string; state: SessionState }
  | { type: "events"; events: StampedEvent[] }
  | { type: "error"; commandId: string | undefined; reason: string }
```

- `hello` は接続ごとに1回。**snapshot はサーバ側の reducer が持っている `SessionState`**
  （`session-manager` が同じ `applySessionEvent` で畳み続けている）
- `protocolVersion` が ui の `PROTOCOL_VERSION` と違えば、ui は「ページを読み込み直してください」を
  出して以降のフレームを無視する（起こし直したプロセスと古いタブの組み合わせで起きる）
- `error` の `reason` は定型文（`"依頼の形式が正しくない"` など）。会話の内容を含めない

### 4.5 版と互換

`PROTOCOL_VERSION` は整数1つ。**イベントの追加は版を上げない**（知らない `kind` は reducer が
無視する。いまの「未知の種別で落ちない」と同じ）。既存イベントの形を変える・状態の形を変えるときだけ上げる。

## 5. core

### session-driver.ts（いまのまま）

`SessionDriver` の契約（`prompt` / `interrupt` / `answer` / `pending` / `setModel` /
`setPermissionMode` / `close`）と `onEvent` はそのまま。足すのは次の2つだけ。

- `persona: string | undefined` を受け取り、`systemPrompt.append` に `REPORT_NOTATION_PROMPT` と
  一緒に足す（7章）
- `resume: string | undefined`（8章。T-078 のとおり）

### fake-driver.ts

`SessionDriver` と同じ契約で、**台本（`StampedEvent[]` の JSON）を時間どおりに流す**。`prompt()` を
受けたら台本の次の場面を再生し、`canUseTool` 相当の答え待ちも積む（`answer()` で解決）。台本は
`test/fixture/` に**手で書いた架空の会話**として置く（`docs/coding-standards.md`「会話内容の扱い」）。
用途は 10章（目視・Playwright・スクリーンショット）。`TSUKUMO_DRIVER=fake` で選ぶ。

### session-manager.ts

```ts
type SessionHost = {
  readonly sessionId: string
  readonly driver: SessionDriver
  state: SessionState // サーバ側でも reducer を回す（hello の snapshot のため）
  readonly subscribers: Set<(frame: ServerFrame) => void>
}
```

- `create(options)`: 駆動を起こし、`onEvent` で **(1) 時刻を打ち (2) 自分の `state` を畳み
  (3) バッチに積む**。50〜100ms ごとに `events` フレームを購読者へ配る（いまの `throttle` を流用）
- `dispatch(sessionId, command)`: `switch (command.type)` で駆動へ渡す。**ここが唯一の分岐**
  （いまの `view-server.ts` の6つの handler が1つになる）
- `subscribe(sessionId, send)`: 接続ごとに `hello` を送ってから購読に加える
- **いまは要素1つ。** 鍵（`sessionId`）を持たせておくのは 8章のため

### character-pack.ts

7章。`listCharacterPacks(dirs)` と `readCharacterPack(dir)`。読めないものは `undefined`（立ち絵なしの
フォールバック）。

### task-summary.ts

いまの読み直し係を、**mtime が変わったときだけ `tasks-changed` を起こす**形にする（1〜2秒の
ポーリング。`fs.watch` は macOS でも取りこぼすことがあるので使わない）。

### server.ts

| 経路                           | 中身                                                                                                               | トークン |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------ | -------- |
| `GET /`                        | ページ（`<div id="app">` と `<script src="/assets/ui.js">` と `<link href="/assets/ui.css">`。**本文は入れない**） | 不要     |
| `GET /assets/ui.js` / `ui.css` | 起動時に束ねたもの（メモリ）                                                                                       | 不要     |
| `GET /vendor/<name>`           | allowlist の対応表にある同梱物だけ（いまのまま）                                                                   | 不要     |
| `GET /character/<file>`        | いまのパックの素材。**`character.json` に書かれたファイル名だけ**を配る（パスから組み立てない）                    | 不要     |
| `GET /ws?t=<token>`            | WebSocket。Origin とトークンを確かめてから upgrade                                                                 | **必要** |

会話の内容が乗るのは `/ws` だけ。他は静的な物か素材なので、トークン無しでよい。

### config.ts

| 環境変数              | 意味                                              | 既定             |
| --------------------- | ------------------------------------------------- | ---------------- |
| `TSUKUMO_VIEW_PORT`   | いまのまま（既定 7327、塞がっていれば +1 で20個） | 7327             |
| `TSUKUMO_CHARACTER`   | パックの名前（`characters/<name>`）または絶対パス | `tsukumo-spirit` |
| `TSUKUMO_OPEN_VIEW`   | いまのまま                                        | 開く             |
| `TSUKUMO_DRIVER`      | `sdk` / `fake`                                    | `sdk`            |
| `TSUKUMO_NEW_SESSION` | `1` で復元せず新規に起こす（8章の逃げ道）         | 復元する         |

`TSUKUMO_CHARACTER_DIR` は `TSUKUMO_CHARACTER` に統合する（ディレクトリの指定は絶対パスで足りる）。

## 6. ui

### 6.1 部品の木

```
<App>                        socket.ts で接続。SessionState と dispatch(command) を Context で配る
└ <Layout>                   grid。リサイザ。接続切れの印。答え待ちの印（タブのタイトル・枠色）
   ├ <MainView>              <TurnTabs> + <Turn>（今回・1つ前・2つ前）
   │   └ <Turn>              <RequestHeading> + [<Report> | <ToolRun> | <QuestionRecord>]*
   │       └ <Report>        Markdown（6.3）。書きかけはブロック単位で memo
   ├ <CharacterView>         <Portrait> + <BalloonTrack>
   │   ├ <Portrait>          立ち絵。SVG はインラインで差し色、ラスタは <img>。動きの hooks（6.5）
   │   └ <BalloonTrack>      <Balloon>*。最新を一番下、下端の位置を固定（4.2 の決定どおり）
   ├ <Sidebar>               <Activity> + <TaskList> + <SessionInfo>
   │   └ <SessionInfo>       モデル / 許可モード の <select>、キャラクターの <select>（段8）、続きから始まった印
   └ <Dispatch>              <PendingAnswer> + <Composer> + <TurnStatus>
       ├ <PendingAnswer>     許可（許可 / 拒否）・質問（選択肢 + 自由入力。**複数選択はチェックボックス**）
       ├ <Composer>          <textarea>。Enter 改行 / ⌘Enter 送信。<CommandSuggestions> を内包
       └ <TurnStatus>        送信 ⇄ 中断、経過 / 所要
```

**部品は `SessionState` と `dispatch` だけを見る。** DOM を直接いじる配線（`MutationObserver`・
`data-` 属性で状態を渡す）は持たない。

### 6.2 状態の持ち方

| 状態                                                             | 置き場所                                                                                  |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `SessionState`                                                   | `<App>` の `useReducer(applySessionEvent)`。`events` フレームを畳む。`hello` で置き換える |
| 接続中 / 切断中、プロトコルの版違い                              | `<App>` のローカル状態                                                                    |
| 選んでいるターン（`turnId`）、追従中か（いちばん下を見ていたか） | `<MainView>` のローカル状態（規則はいまの `main-turns.ts` のまま）                        |
| 入力欄の下書き、候補の開閉と選択位置                             | `<Composer>` のローカル状態                                                               |
| 質問の選択（送る前）                                             | `<PendingAnswer>` のローカル状態                                                          |
| 経過時間の秒数                                                   | `<TurnStatus>` の1秒タイマー（`turnStartedAt` から計算）                                  |
| 領域の比率                                                       | `<Layout>`。`localStorage` に**比率だけ**保存（会話は保存しない）                         |

zustand などの状態ライブラリは**入れない**。必要になるまで `useReducer` + Context で足りる。

### 6.3 Markdown（`report/markdown.tsx`）

```
react-markdown
  remarkPlugins: [remark-gfm]
  rehypePlugins: [rehype-raw, [rehype-sanitize, schema], rehype-highlight]
  components: { code: フェンスの言語で MermaidBlock / ChartBlock / 通常 に振り分け, a: 許可スキームだけ }
```

- **`schema` はいまの `sanitizeReportHtml` の許可リストを写す**（54要素・42属性 + `class` の語彙
  `note` / `badge` / `cols` / `card` など）。`style` 属性は `url(` / `@import` を含むものを落とす
  規則も `schema` の `attributes` の正規表現で表す。**規約（`report-notation.ts`）・schema・CSS の
  3つは同じコミットで揃える**（いまの決定のまま）
- 引用 `> `・ネストしたリスト・水平線・列揃え（`:---:`）は GFM でそのまま描ける。
  `report-notation.ts` から「描けない記法」の迂回の記述を外す（T-063 はこの段で閉じる）
- **流れる本文**: 書きかけの Markdown を空行で塊に割り、塊ごとに `memo`（鍵は塊の文字列）。
  描き直すのは末尾の塊だけ。未終端のコードフェンスは末尾の塊の中に閉じているので、
  途中で表や見出しに化けない
- コードスパンの中の HTML は文字のまま（GFM の仕様どおり。自前の特別扱いは要らなくなる）

### 6.4 重いライブラリ

| もの                                                               | 読み方                                                                                                                         | 置き場所           |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ------------------ |
| React・react-markdown 一式・`ws`（ブラウザ側は標準の `WebSocket`） | `bun build` が npm から束ねる                                                                                                  | `node_modules`     |
| highlight.js                                                       | `rehype-highlight`（`lowlight` の common 言語）を束ねる。テーマ CSS は `vendor/` のまま                                        | 束ねる / `vendor/` |
| mermaid（3.3MB）・Chart.js                                         | いまのまま **`vendor/` に置き、その記法が出たときだけ `<script>` で読む**。`MermaidBlock` / `ChartBlock` が `useEffect` で描く | `vendor/`          |
| Idiomorph                                                          | **消える**                                                                                                                     | —                  |

CDN からは読まない（いまのまま）。`bun build` の出力は1本（コード分割はしない。分割すると
ディスクに置かないメモリ配信と噛み合わない）。

### 6.5 立ち絵の動き（余地。段の中では作らない）

`<Portrait>` は `expression` と `outfit` を props で受け、**遷移は hooks の中の状態機械**で表す
（前の表情 → 次の表情のクロスフェード、待機中のまばたき、ターン開始の登場）。素材が SVG なら
CSS の `@keyframes` と `<g>` の差し替えで足り、Lottie / Live2D を使うなら安定した `<canvas>` を
この部品が持つ。**音声・口パクは作らない。** ここに何を作るかは `docs/requirements.md` 4.3 の
決定を待つ（この設計書は「部品の中に閉じる」ことだけを決める）。

### 6.6 CSS

いまの `src/presentation/style/*.css` を `src/ui/style/` へ移し、部品ごとのファイルに置き直す。
クラス名は用語集の語（`balloon` / `portrait` / `turn-tab` など）を保つ。CSS Modules は使わない
（既存の資産をそのまま活かす）。`main.css` の `@import` を `bun build` で束ねる形はいまのまま。

## 7. キャラクターパック

```
characters/<name>/
  character.json     name / portraits（表情 → ファイル名）/ outfitAccents / expressions（名前 → 日本語ラベル）/ speechMarker
  persona.md         人格。tsukumo が systemPrompt.append で足す（speak の使い方・セリフと詳細の書き分けを含む）
  *.svg / *.png      素材
```

- **`expressions` のラベルを定義に移す**（いまは `expression.ts` の `expressionLabel` にコードで
  持っている。原則4）。`speak` の enum と説明はここから作る
- **`speechMarker`**（行頭マーカー。既定 `アスナ: `）も定義に移す（いまは `utterance.ts` の定数）
- `persona.md` は**tsukumo 向けの人格**。グローバルの `~/.claude/output-styles/asuna.md` は
  TUI 向けの正典のまま触らない
- **二重適用を避ける**: tsukumo のセッションではグローバルの出力スタイルも効くので、`persona.md` と
  重なる。`applyFlagSettings({ outputStyle: "default" })`（セッション限り。設定ファイルは書き換わらない。
  2026-09-12 実測）で中立に戻してから `persona.md` を足す。**これが効くか（人格が1つになるか）は
  段8 の最初にスパイクで確かめる。** 効かなければ `settingSources` からユーザー設定を外す案を検討する
  （orca の hooks も外れるので、その影響を先に見る）
- **切り替え**（`switch-character`）は**別のパックでセッションを起こし直す**（会話は続かない。
  `speak` の enum を作り直す必要があり、`setMcpServers` / `reinitialize` で足りるかは未実測。
  起こし直しなら確実）。切り替え時に画面から消すのは吹き出し・立ち絵・メインビューの3つ
- 素材が1体しか無いときも `<select>` は出す（選択肢1つ。無いように見えるほうが分かりにくい）
- パックの探し先は **tsukumo 同梱の `characters/` と、起動先の `characters/local/`** の2箇所。
  同名なら起動先が勝つ

## 8. セッションの復元と複数化

**復元の決定は `docs/requirements.md` 4.8 のまま**（`cwd` + tsukumo の印、常に自動で続きから、
tsukumo 側に会話を保存しない、失敗したら新規で起こす）。新しい形では次が楽になる。

- 画面の履歴の組み直しは「`getSessionMessages` → `SessionEvent[]`（時刻付き）→ `session-manager` の
  `state` に畳む」だけ。接続したブラウザは `hello` の snapshot でそのまま同じ姿になる
  （**ブラウザ側に復元の特別な経路は要らない**）
- 「続きから始まった」は `session-restored` イベント → `state.restored` → `<SessionInfo>` の印
- 逃げ道は `TSUKUMO_NEW_SESSION=1`（起動時）と `new-session` コマンド（画面から。段9）

**複数化はまだしない。** `SessionManager` が `sessionId` を鍵に持っているので、後から
(1) 複数プロジェクトを1つの画面で切り替える、(2) `tsukumo` コマンドを常駐へ接続するクライアントにする
（client–daemon）、へ広げられる。そのときの `hello` は `sessions: SessionSummary[]` を持ち、
`ClientCommand` に `select-session` が加わる。**いま作るのは鍵だけ**（`docs/requirements.md` 7章の未決事項）。

## 9. 会話内容と安全

`docs/coding-standards.md`「会話内容の扱い」は最優先のまま。新しい形で変わる点と変わらない点:

| 項目                                 | 扱い                                                                                                                                                                                              |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| バインド先                           | `127.0.0.1` だけ。変えない                                                                                                                                                                        |
| Origin                               | WebSocket の upgrade で確かめる（いまの POST と同じ規則。`Origin` が無ければ通す、あれば自分と一致）                                                                                              |
| 起動トークン                         | **新規**。起動ごとに乱数を1つ作り、`/ws?t=` で要求する。ページの URL に付けて配る（`showView` に渡す URL に含む）。同じマシンの別プロセスが `127.0.0.1:7327` を読める、という既知の割り切りを塞ぐ |
| ディスク                             | 書かない。`bun build` の出力もメモリ。`localStorage` に置くのは領域の比率だけ                                                                                                                     |
| ブラウザ側のメモリ                   | `SessionState` として会話の一部を持つ。**同じオリジンの `127.0.0.1` のタブの中に閉じる**（いまも DOM として持っている。持ち方が変わるだけ）                                                       |
| ログ                                 | `error` フレームの `reason` は定型文。サーバの stderr に会話を出さない（いまのまま）                                                                                                              |
| テストのフィクスチャ・偽の駆動の台本 | 手で書いた架空の会話だけ                                                                                                                                                                          |

## 10. テスト

| 対象                           | 方法                                                                                                                       | 置き場所                              |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| reducer（`applySessionEvent`） | いまの `session-view.test.ts` をそのまま持ち越す（純粋関数）                                                               | `test/protocol/session-state.test.ts` |
| zod スキーマ                   | 受け付ける形・落とす形を1件ずつ                                                                                            | `test/protocol/command.test.ts` など  |
| SDK の型との一致               | `PERMISSION_MODES` / `MODEL_ALIASES` が SDK の型と同じ値であること（型レベルの検査）                                       | `test/core/session-driver.test.ts`    |
| `session-manager`              | 偽の駆動を差し込み、`hello` → `events` の順序・バッチ・`dispatch` の分岐                                                   | `test/core/session-manager.test.ts`   |
| `server`（ws）                 | 接続 → `hello` が返る、トークン無しは 403、Origin 違いは 403、コマンド → 駆動が呼ばれる                                    | `test/core/server.test.ts`            |
| ui の部品                      | `bun test` + `happy-dom` + `@testing-library/react`。**役割と文言で当てる**（HTML の文字列一致はしない）                   | `test/ui/**`                          |
| 層の検査                       | `protocol ← core` / `protocol ← ui` / `core ⟂ ui` の3辺。外部ツールは増やさない                                            | `test/architecture.test.ts`           |
| 画面全体                       | **偽の駆動で起こした tsukumo に Playwright**（`webapp-testing` スキル）。数値で読めるものは CDP で読む。色・間合いは人の目 | `scripts/`（本体から呼ばれない）      |

**ブラウザに出た絵は自動テストで守らない**、という方針は変えない。変わるのは「claude を起こさずに
絵を出せる」こと（偽の駆動）で、目視の手順が `docs/architecture.md`「手で確かめること」から
API を使わない形になる。

## 11. ビルドと依存

- `bundle.ts` は `bun build src/ui/main.tsx --target=browser` と `bun build src/ui/style/main.css`
  を起動時に起こす（いまと同じ形。JSX は tsconfig の `"jsx": "react-jsx"` で自動）
- tsconfig に `"jsx": "react-jsx"` を足す。ブラウザの型は `@types/bun` が持っているのでそのまま
- HMR は持たない（欲しくなったら Vite を**開発時だけ**足す。配る経路は変えない）

**足す依存**（`CLAUDE.md`「外部依存を増やすときは承認を得る」。**2026-09-13 に「移行しようか」の
決定で一括して承認済み**。ここに無いものを足すときは改めて承認を得る）:

| 種別    | パッケージ                                                                         | 用途                                                                      |
| ------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| runtime | `react` `react-dom`                                                                | ui                                                                        |
| runtime | `ws`                                                                               | core の WebSocket サーバ                                                  |
| runtime | `react-markdown` `remark-gfm` `rehype-raw` `rehype-sanitize` `rehype-highlight`    | Markdown                                                                  |
| runtime | `remark-cjk-friendly`                                                              | CJK の強調（`**「…」**`）。2026-09-13 にユーザーの承認を得て追加（T-104） |
| dev     | `@types/react` `@types/react-dom` `@types/ws` `@testing-library/react` `happy-dom` | 型とテスト                                                                |
| dev     | `playwright-core`                                                                  | 画面全体の確認（10章）                                                    |

`zod` はある。`@anthropic-ai/claude-agent-sdk` はある。**`Bun.*` の固有 API に寄せない**規約は続く
（`ws` を選ぶのはそのため）。

**`playwright-core` を選ぶ理由**（2026-09-13 にユーザーの承認を得て追加。10章が名指ししていたのに
この一覧から漏れていたのを埋めた）: **ブラウザを落とさない**。`playwright` の側は postinstall で
約130MB のブラウザを `~/Library/Caches/ms-playwright` へ取りに行くが、`playwright-core` は driver
だけ（13MB）で、`chromium.launch({ channel: "chrome" })` として**手元の Google Chrome を動かす**。
リポジトリの外に何も置かないので、`node_modules` を消せば消える。**テストランナーは足さない**
（`@playwright/test` ではなくライブラリだけを使い、`bun test` と競合させない）。呼ぶのは
`scripts/capture-view.ts` で、**`bun run check` には入れない**（生きたサーバが要って遅いため)。

## 12. 移行の段階

### 併走の仕組み

**領域ごとに置き換える。** ページは1枚のまま、旧の領域は `data-event-path` で SSE を購読し、新の
領域は React の root を mount する。両方のスクリプト（`browser.js` と `ui.js`）を同じページに読む
期間を許す。**段ごとに `bun run check` が通り、tsukumo が使える状態を保つ。**

### 段と完了条件

| 段  | やること                                                                                                                                                                                                                                         | 完了条件                                                                                                                                                                                                                          | 消えるもの                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **正典を直す**（この設計書、`docs/architecture.md`、`docs/requirements.md`、`docs/coding-standards.md`、`docs/glossary.md`、`CLAUDE.md`）                                                                                                        | 節の数が変わらない。`bun run check` が通る                                                                                                                                                                                        | —                                                                                                                               |
| 2   | **`src/protocol/` を切る**（`domain` + `session-view.ts` を移し、`command.ts` / `frame.ts` を足す）。**`src/core/` に `session-manager` / `server`（ws）/ `fake-driver` / `config` を足す。** 依存を入れ、`ui.js` の空の入口を束ねてページに読む | ws のテスト（接続 → `hello`、トークン、Origin、`prompt` → 駆動）。偽の駆動で起こして `hello` の snapshot が `curl`（`websocat` 相当）で読める。`test/architecture.test.ts` が3辺で通る。**見た目は変わらない**                    | `usecase/event-sink.ts` の状態保持（`session-manager` へ）                                                                      |
| 3   | **サイドバー**を React にする。`tasks-changed` イベントを足す                                                                                                                                                                                    | 部品のテスト（進行・タスク一覧・セッション情報の3区画が状態から出る。`<select>` が `set-model` / `set-permission-mode` を送る）。偽の駆動 + Playwright で3区画が出る。**見た目が変わらない**（CDP で列揃えなどの数値が段2と同じ） | `/events/sidebar`、`buildSidebarBody`、`browser/session-info.ts`                                                                |
| 4   | **入力欄**を React にする（Composer・候補・答え待ち・経過時間）                                                                                                                                                                                  | 部品のテスト（⌘Enter 送信・Enter 改行・IME 中は送らない・候補の絞り方・**複数選択がチェックボックス**・許可 / 拒否）。偽の駆動で許可と質問に答えられる                                                                            | `/events/turn-status`、`/events/pending-answer`、`/api/*` の5本、`browser/dispatch.ts` ほか3本                                  |
| 5   | **キャラビュー**を React にする。`character-changed` イベントと `/character/<file>` を足す                                                                                                                                                       | 部品のテスト（最新が一番下・件数によらず下端が同じ・立ち絵なしのフォールバック）。偽の駆動 + CDP で最新の `rect` が段4と同じ                                                                                                      | `/events/character`、`buildCharacterBody`、`character-asset.ts` の埋め込み                                                      |
| 6   | **メインビュー**を React にし、**Markdown を unified に置き換える**。`report-notation.ts` から迂回の記述を外す                                                                                                                                   | 部品のテスト（タブの規則・追従・引用 / ネスト / 水平線 / 列揃え・`note` / `badge` / `cols` / `card` が通り `script` が落ちる・流れる本文の末尾だけ描き直す）。偽の駆動 + Playwright で1往復。**T-063 が閉じる**                   | `/events/main`、`presentation/view.ts`、`report-html.ts`、`browser/` 全部、`vendor/idiomorph.min.js`、`view.test.ts`（3,224行） |
| 7   | **後始末**: `presentation/` `usecase/` `domain/` `infrastructure/` のディレクトリを消し、`index.ts` → `cli.ts`。`docs/architecture.md`「現在の実装状況」を「移行完了」に                                                                         | `src/` に3層と `cli.ts` だけ。`bun run check`。実機で1往復（Orca のタブ）                                                                                                                                                         | 旧の4層                                                                                                                         |
| 8   | **キャラクターパック**（`persona.md`・`expressions` のラベル・`speechMarker` の定義への移動・切り替え）。**最初に二重適用のスパイク**                                                                                                            | スパイクの結果が `evidence` にある。`<select>` で切り替わり、吹き出し・立ち絵・メインが消えて新しいキャラで1往復。**T-064 / T-065 が閉じる**                                                                                      | `expressionLabel` / `DEFAULT_SPEECH_MARKER` のコード上の定数                                                                    |
| 9   | **セッションの復元**を新しい形に載せる（T-078 の本文どおり。`session-restored`・`new-session`）                                                                                                                                                  | T-078 の完了条件                                                                                                                                                                                                                  | —                                                                                                                               |

段2〜6 は**1段ずつ**進める（次の段に入る前に前の段の「消えるもの」を実際に消す。併走を長引かせない）。

### 既存タスクとの関係

| タスク                                | 扱い                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------- |
| T-088（`view.ts` を割る）             | **閉じる**（割った先ごと段6で消える）                                     |
| T-063（引用・ネスト・水平線・列揃え） | **段6に統合**（unified で描ける。自前レンダラに足さない）                 |
| T-064 / T-065（キャラクター切り替え） | **段8**                                                                   |
| T-078（復元の実装）                   | **段9**。本文の「使う SDK の口」はそのまま                                |
| T-093（規約の「印」）                 | 独立。ただし語彙を増やすなら段6以降は `sanitize-schema.ts` と揃える       |
| T-094（`dl` の CSS）                  | 独立。CSS は段6で `src/ui/style/` へ移る                                  |
| T-076（待ち時間の表示）               | 独立（決めるタスク）。実装は段4以降の部品に載せる                         |
| T-046（箱）                           | 独立。二層にしたことで Electron / Tauri のどちらにも `loadURL` だけで載る |
