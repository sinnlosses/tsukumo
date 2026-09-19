# 設計書（描く層をブラウザ側へ移す）

最終更新: 2026-09-13（起こした日。**移行の決定は同日**。経緯と採らなかった案は
`docs/research/architecture-rethink.md`）
ステータス: **正典**。**構造の移行は段7まで完了**（`protocol` / `core` / `ui` の3層 +
`cli.ts`。2026-09-16 に**サーバ側を `core`（判断）と `adapter`（境界）に割った**。
`docs/architecture.md`「現在の実装状況」）。**段9（セッションの復元）も入った**
（2026-09-13。`docs/requirements.md` 4.8。画面からの `new-session` コマンドだけは、セッションを
起こし直す仕組みを作る段8と一緒に入れる）。残る段8（キャラクターパック）は末尾「移行の段階」の
完了条件どおり、別タスクとして進める。

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
| ## 2. 全体構成                 | 層（protocol / core / adapter / ui）の図、依存の向き、ディレクトリ         |
| ## 3. 動きの流れ               | 起動・接続・依頼・答え待ち・再接続の順序                                   |
| ## 4. protocol                 | **両側が共有する契約**。イベント・状態・reducer・コマンド・フレーム・版    |
| ## 5. core と adapter          | サーバ側のモジュールと責務。判断（core）と外の世界に触る境界（adapter）    |
| ## 6. ui                       | ブラウザ側の部品の木、状態の持ち方、Markdown、重いライブラリ、立ち絵の動き |
| ## 7. キャラクターパック       | `character.json` + `persona.md` + 素材。人格の注入と切り替え               |
| ## 8. セッションの復元と複数化 | 復元（4.8）を新しい形に載せる。複数セッションへ広げる余地                  |
| ## 9. 会話内容と安全           | `127.0.0.1`・Origin・起動トークン・ディスクに書かない・ブラウザ側のメモリ  |
| ## 10. テスト                  | reducer・スキーマ・部品・偽の駆動 + Playwright・層の検査                   |
| ## 11. ビルドと依存            | `bun build` の入口、tsconfig、**足す依存の一覧（承認済み）**               |
| ## 12. 移行の段階              | 併走の仕組み、段ごとの完了条件、消えるもの、既存タスクとの関係             |
| ## 13. 画面のデザイン          | 色・書体・レイアウトの計画とトークン。**誰が差せるか**の区別               |

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
  ためで、**`Bun.*` に寄せない規約を保つ**。**2026-09-17 に「いま寄せ替えない」と決めた**（箱が
  Orca のブラウザタブである限り、Node へ移す差し迫った理由が無い）。**再検討するのは箱が変わった
  ときだけ**（Electron なら core を Electron の Node で動かせるので Bun は不要になる）

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
│ core（サーバ側の純粋な判断。外の世界に触らない）              │
│   session-manager ／ session-driver（駆動の契約）／ config    │
│   sdk-message ／ session-restore ／ pending-answer ／ host    │
└──────────────▲───────────────────────────┬─────────────────┘
               │ 呼ばれる                   │ core を import する
┌──────────────┴───────────────────────────▼─────────────────┐
│ adapter（外の世界に触る場所。1ファイル = 1つの境界）          │
│   sdk-driver（SDK）／ fake-driver（台本）                     │
│   server（http: ページ・束ねた JS/CSS・vendor・立ち絵 / ws）  │
│   character-pack ／ task-summary ／ bundle ／ orca-host       │
└──────────────▲───────────────────────────┬─────────────────┘
               │ SDKMessage                 │ query / interrupt / canUseTool
┌──────────────┴───────────────────────────▼─────────────────┐
│ Claude Code（SDK が起こす子プロセス）                         │
└────────────────────────────────────────────────────────────┘
      protocol（語彙・イベント・状態・reducer・zod スキーマ。ui と core の両方が import する）
      辺は adapter ──▶ core ──▶ protocol ◀── ui（**core → adapter は禁止**。結ぶのは cli.ts だけ）
```

### 層と依存の向き

**この形は「共有コントラクト＋クライアント/サーバ分割」で、旧の4層（クリーンアーキテクチャの
写し）とは別物**。`protocol` は TypeScript のモノレポでいう `packages/shared` / `contracts`
の位置（サーバとブラウザの両方が import する契約）、`ui` はクライアント、`core` と `adapter` は
サーバで、「受け取る／決める／描く」という役割の分割ではなく「どちらの実行環境で動くか」で
分けている。**サーバ側だけをもう一段、「純粋な判断（`core`）」と「外の世界に触る境界
（`adapter`）」に割ってある**（2026-09-16。`docs/research/architecture-proposal.md`）。

| 層         | 置くもの                                                                                   | import してよい先                   | 実行場所         |
| ---------- | ------------------------------------------------------------------------------------------ | ----------------------------------- | ---------------- |
| `protocol` | 概念の語彙・`SessionEvent`・`SessionState`・`applySessionEvent`・コマンドとフレームの zod  | `protocol` のみ（`zod` は可）       | サーバとブラウザ |
| `core`     | サーバ側の純粋な判断。セッション管理・駆動の契約・イベントの検証・ポートの決定・設定の解釈 | `protocol` / `core`                 | サーバ（Bun）    |
| `adapter`  | 外の世界に触る場所。SDK・WebSocket・HTTP・ホスト・ファイル・子プロセス・偽の駆動           | `protocol` / `core` / `adapter`     | サーバ（Bun）    |
| `ui`       | React の部品・hooks・CSS・Markdown の変換                                                  | `protocol`（React などの npm は可） | ブラウザ         |
| `cli.ts`   | 配線（composition root）                                                                   | すべて                              | サーバ           |

- **`core` と `ui` は互いを import しない。** 両者が知っているのは `protocol` だけ
- **`core → adapter` は禁止。** 辺は `adapter ──▶ core ──▶ protocol ◀── ui` の一方通行で、
  `core` と `adapter` を結ぶのは `cli.ts` だけ。**`core` は `node:` / SDK（`@anthropic-ai/*`）/
  `ws` を import しない**ので、`core` から外の世界へ出る道は無い
- **`adapter` は1ファイル = 1つの境界。** インターフェースは切らない（実装が2つあるもの —
  駆動とホスト — だけ、契約の型を `core` に置く: `core/session-driver.ts` / `core/host.ts`）
- **`protocol` は `node:` も `document` も触らない。** これは設計上の好みではなく**物理的な制約**
  である。`protocol` はサーバ（Bun/Node）とブラウザの両方の実行環境で読み込まれるので、
  片方にしか無い API（`node:fs` や `document` など）に触れた時点でもう片方で動かなくなる。
  純粋関数と型と zod スキーマだけが両方で動く共通部分
- 許した辺以外は `test/architecture.test.ts` が落とす（辺は上の4本）

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
  core/                       サーバ側の純粋な判断。node: / SDK / ws を import しない
    session-driver.ts         駆動の契約（SessionDriver / SessionDriverOptions と既定値）だけ
    session-manager.ts        sessionId → { driver, state, subscribers }。reducer をサーバ側でも回す
    session-launch.ts         起こす一続きの順序（外に触る部分は cli.ts が渡す。起動も切り替えも同じ）
    character-selection.ts    どのパックを出すかの順位（一覧を作るのは adapter/character-pack.ts）
    pending-answer.ts         答え待ちの列（SDK の型は持たない。結び付けるのは adapter 側）
    sdk-message.ts            SDK のメッセージを検証して SessionEvent にする（SDK を import しない）
    session-restore.ts        続きから始めるセッションを選ぶ・transcript を履歴イベントにする
    port-resolution.ts        どのポートで試すかの決定（listen そのものは adapter/server.ts）
    config.ts                 環境変数の解釈（読み取りは cli.ts。ここは渡された env を見るだけ）
    report-notation.ts / speech-cadence.ts   systemPrompt に足す規約の文面
    host.ts                   ホストのポート（showView）。実装は adapter/orca-host.ts
  adapter/                    外の世界に触る場所。1ファイル = 1つの境界
    sdk-driver.ts             SDK を import する唯一の場所。SessionDriver の本物の実装
    fake-driver.ts            台本どおりに SessionEvent を流す SessionDriver（台本は fs から読む）
    server.ts                 http（ページ・/assets・/vendor・/character）+ ws（フレームとコマンド）
    character-pack.ts         パックの列挙・読み込み（character.json / persona.md / 素材）
    character-edit.ts         画面から変えた立ち絵・差し色を ~/.tsukumo/characters/ へ書く
    remembered-character.ts   覚えたキャラクター名（~/.tsukumo/state.json）
    task-summary.ts           develop/tasks.json の読み直し（変化を tasks-changed イベントにする）
    bundle.ts / ui-rebuild.ts bun build（ui の入口と CSS）と src/ui/ の見張り
    bundled-path.ts           同梱物の位置（import.meta.url）。tsukumo-home.ts は ~/.tsukumo/
    orca-host.ts              `orca` コマンドを起こす唯一の場所
  ui/
    main.tsx                  入口。部品の木を組み立てて mount する（副作用はここだけ）
    css-variable.d.ts         ui 全体に効く型拡張（import されない ambient 宣言）
    css-module.d.ts           `*.module.css` を import したときの型（同上）
    features/                 機能。**機能どうしは import しない**
      layout/                 Layout・領域の枠・リサイザ・比率の保存
      main-view/              TurnTabs・Turn・Report・QuestionRecord と markdown/（unified 一式）
      character-view/         Portrait・BalloonTrack・Balloon・動きの hooks
      sidebar/                Activity・TaskList・TaskBoard（表のモーダル）・SessionInfo
      dispatch/               Composer・CommandSuggestions・PendingAnswer・TurnStatus
      character-screen/       キャラクター画面と作る画面（13.6）。立ち絵・差し色の差し替え、使う人が変える色
                              （機能の見た目は、それぞれの中の `<機能>.module.css`。6.6）
    components/               機能の語彙を持たない React の部品（Select・Portrait と portrait.module.css）
    lib/                      機能の語彙を持たない道具（WebSocket・再読み込み・要約・設定の保存）
    stores/                   画面全体で共有する状態（セッション・選んでいるターン・出している画面）
    styles/                   グローバルな CSS はこの1枚だけ（theme.css。トークン・body・リンク）
test/                         src/<相対パス>.ts → test/<相対パス>.test.ts（いまのまま）
characters/<name>/            character.json・persona.md・素材
```

**ファイル名は概念**（原則5）。`helpers` / `utils` / `common` は作らない。**単数形の規約は
`src/ui/` の置き場所のディレクトリ（`features/` `components/` `lib/` `stores/` `styles/`）だけ
外れる**（2026-09-16。bullet-proof-react の名前をそのまま採る。`protocol` / `core` / `adapter` と、
機能の中のファイル名は単数形のまま。`main-view/` のように機能の名前は用語集の語に合わせる）。

**`src/ui/` の箱と、置く基準**（bullet-proof-react の語をそのまま使う。判断に迷ったら
「その機能しか読まないなら機能の中」が既定）:

| 箱            | 置くもの                                                          | import してよい先                            |
| ------------- | ----------------------------------------------------------------- | -------------------------------------------- |
| `main.tsx`    | 入口。Provider と `<Layout>` に機能を差し込む（composition root） | すべて                                       |
| `features/`   | 1つの機能に閉じた部品・状態・保存                                 | `components` / `lib` / `stores` / `protocol` |
| `components/` | **機能の語彙を持たない** React の部品（値と呼び先を全部受け取る） | `lib` / `protocol`                           |
| `lib/`        | 機能の語彙を持たない道具（React の部品ではないもの）              | `protocol`                                   |
| `stores/`     | **画面全体で共有する状態**の Context と、それを読む hook          | `lib` / `protocol`                           |
| `styles/`     | **グローバルな CSS だけ**（`theme.css`。機能の見た目は機能の中）  | —                                            |

- **`stores/` は「状態ライブラリの置き場」ではなく「画面全体で共有する状態の置き場」**
  （zustand を入れない決定は 6.2 のまま。中身は `useReducer` + Context）。実体は3つあり、
  `stores/session.tsx` は `SessionState` を畳んで全機能に配り、`stores/turn-selection.tsx` は
  メインビューとキャラビューに同じターンの選択を配り、`stores/screen.tsx` は `location.hash` から
  **出している画面**を読む（Context ではなく `useSyncExternalStore`。書く口 `navigateTo` も同じ
  ファイル。13.6）。**どれも複数の機能が読む**ので機能の中に置けず、`main.tsx` に残すと機能が
  入口を import することになる（だから箱が要る）
- **接続（`lib/socket.ts`）と再読み込み（`lib/refresh.ts`）は状態ではなく道具**なので `lib/`。
  入口の `main.tsx` は直下のまま（`app/` を作らない理由は下の表）
- **機能どうしは import しない。** 機能をまたいで要るものは、**部品なら `components/`、
  部品でないなら `lib/`、状態なら `stores/` へ上げる**。上げる引き金は「2つ目の読み手が出たとき」で、
  1つの機能しか読まないものは機能の中に残す（`features/layout/split.ts`・
  `features/character-screen/appearance-color.ts` がその例）
- **機能は `main.tsx` と `stores/` の中身を「組み立てる側」として import しない。** 機能が触れるのは
  `stores/` が公開する hook（`useSession` / `useTurnSelection`）まで
- **親が子を組む形も機能どうしの import に数える。** `<Layout>` は領域の中身を props で
  受け取るだけで他の機能を知らず、**どの画面を出すかは `main.tsx` の中の `<Root>` が選ぶ**
  （6.1・13.6）
- 検査は `test/architecture.test.ts`（いまの `UI_REGIONS` の検査を、上の辺に合わせて書き直す）

**移動の対応表**（組み替えのときはこの表だけを見て動かす。**ファイルの中身は動かさない**）。
**この表より後に出てくる `src/ui/` のパスは、すべて組み替え後の形で書いてある**（移動そのものは
別のタスクで行うので、しばらくの間はコードの側が古い。12章の移行の記録だけは当時のまま）:

| いまのパス                                                                                                                                                                 | 新しいパス                            |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `src/ui/main.tsx`                                                                                                                                                          | 変えない（`bun build` の入口）        |
| `src/ui/css-variable.d.ts`                                                                                                                                                 | 変えない（ui 全体に効く）             |
| `src/ui/app.tsx`                                                                                                                                                           | `src/ui/stores/session.tsx`           |
| `src/ui/turn-selection.tsx`                                                                                                                                                | `src/ui/stores/turn-selection.tsx`    |
| `src/ui/socket.ts`                                                                                                                                                         | `src/ui/lib/socket.ts`                |
| `src/ui/refresh.ts`                                                                                                                                                        | `src/ui/lib/refresh.ts`               |
| `src/ui/component/tool-summary.ts`                                                                                                                                         | `src/ui/lib/tool-summary.ts`          |
| `src/ui/component/select.tsx`                                                                                                                                              | `src/ui/components/select.tsx`        |
| `src/ui/layout/` の3件（`layout.tsx` / `layout-resizer.tsx` / `split.ts`）                                                                                                 | `src/ui/features/layout/`             |
| `src/ui/main-view/` の5件（`main-view.tsx` / `turn.tsx` / `turn-tabs.tsx` / `report.tsx` / `question-record.tsx`）                                                         | `src/ui/features/main-view/`          |
| `src/ui/report/` の7件（`markdown.tsx` / `sanitize-schema.ts` / `split-blocks.ts` / `mermaid-block.tsx` / `chart-block.tsx` / `vendor-script.ts` / `vendor-globals.d.ts`） | `src/ui/features/main-view/markdown/` |
| `src/ui/character-view/` の4件（`character-view.tsx` / `portrait.tsx` / `balloon-track.tsx` / `balloon.tsx`）                                                              | `src/ui/features/character-view/`     |
| `src/ui/sidebar/` の6件（`sidebar.tsx` / `activity.tsx` / `section.tsx` / `session-info.tsx` / `task-list.tsx` / `task-board.tsx`）                                        | `src/ui/features/sidebar/`            |
| `src/ui/dispatch/` の5件（`dispatch.tsx` / `composer.tsx` / `command-suggestions.tsx` / `pending-answer.tsx` / `turn-status.tsx`）                                         | `src/ui/features/dispatch/`           |
| `src/ui/appearance/` の残り3件（`appearance.tsx` / `appearance-color.ts` / `character-edit.tsx`）                                                                          | `src/ui/features/appearance/`         |
| `src/ui/style/` の10件（`.css`。ファイル名は変えない）                                                                                                                     | `src/ui/styles/`                      |

**同時に直すもの**（移動だけでは動かない点。振る舞いは変えない）:

- `src/ui/app.tsx` が公開する `App` は **`SessionProvider` に改名**する（ファイル名が
  `stores/session.tsx` になり、`<App>` という名前は「アプリ全体」を指していないため）。
  読み替えるのは `src/ui/main.tsx` と部品のテストだけ（`SessionContext` / `useSession` の名前は変えない）
- `src/ui/features/layout/layout.tsx` は `<Appearance>` を import しない（段7の時点では
  `renderAppearance: (onResetSplit: () => void) => ReactNode` を props で受け取っていたが、
  「見た目」の引き出し自体を 2026-09-20 に無くしたので、いまは `<Layout>` が比率を戻すボタンを
  直接描く。13.6）
- `src/adapter/bundle.ts` の `buildStyleSheet` の入口が `src/ui/styles/main.css` になる
  （`buildUiScript` の `src/ui/main.tsx` は変わらない。`ui-rebuild.ts` は `src/ui/` を丸ごと
  見張っているので変わらない）
- テストは `test/ui/<新しい相対パス>.test.ts` へ同じ形で移す（`test/ui/component/` は
  `test/ui/lib/` と `test/ui/components/` に割れ、`test/ui/report/` は
  `test/ui/features/main-view/markdown/` になる）
- パスを本文に書いているコメントを追随させる（`src/core/report-notation.ts`・
  `src/protocol/session-state.ts`・`src/protocol/session-socket.ts`・`src/adapter/server.ts`・
  `test/dom-environment.ts`・`test/cli.test.ts`）。**`docs/` 側の旧パスは10箇所あり
  （`requirements.md` 7・`architecture.md` 1・`glossary.md` 1・`workflow.md` 1）、移動と
  同じコミットで追随させた**（2026-09-16 の実測。この対応表と12章の移行の記録、
  `docs/research/` は当時の記録なので残す）

**採らなかった bullet-proof-react の要素**（実体が無い箱を先に作らないため。要るようになったら足す）:

| 採らないもの                           | 理由                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/`                                 | 画面の切り替えは `location.hash` を読む hook 1つ（`stores/screen.tsx`）で、ルーターも `app/` に置くほどの配線も無い。入口の中身は `main.tsx` 1つになる（状態は `stores/`、接続と再読み込みは `lib/` へ分かれる）。入口は `bun build` の入口でもあるので直下に置く。**機能が `app/` を import しない**という bullet-proof-react の向きも、箱を作らなければ破りようがない |
| `api/`（機能の中も含む）               | REST も react-query も無い。サーバとの往復は WebSocket 1本で `lib/socket.ts` と `stores/` に閉じている                                                                                                                                                                                                                                                                  |
| `types/`                               | 型の正典は `src/protocol/`。ui 側に置くと契約が二重になる（原則2）。ambient な `.d.ts` は import されないので使う場所の隣に置く                                                                                                                                                                                                                                         |
| `utils/`                               | 実体は `tool-summary.ts` 1つで、置くと「どこにも属さない小物」の受け皿になる（原則5）。`lib/` に入れる                                                                                                                                                                                                                                                                  |
| `hooks/`（共有）                       | 共有の hook が無い。`useSession` / `useTurnSelection` は Context の付属なので provider と同じファイルに置く                                                                                                                                                                                                                                                             |
| `config/`                              | 設定と環境変数は `src/core/config.ts` と `src/cli.ts` が持ち、ui は `SessionState` で受け取るだけ                                                                                                                                                                                                                                                                       |
| `assets/`                              | 立ち絵も外部ライブラリもサーバが配る（`characters/` と `node_modules/`）。ui に素材を置かない                                                                                                                                                                                                                                                                           |
| `testing/`                             | テストは `test/` に `src/` の形を写す既存の規約がある（`test/dom-environment.ts` がその置き場）                                                                                                                                                                                                                                                                         |
| `index.ts`（barrel file）              | 2026-09-13 の決定のまま禁止。bullet-proof-react 自身も tree-shaking の理由で外している                                                                                                                                                                                                                                                                                  |
| `@/` の絶対 import                     | 相対パス + 拡張子付きの既存の書き方を変えない（`bun build` と `tsc` の設定を増やさない）                                                                                                                                                                                                                                                                                |
| 機能の中の `components/` `utils/`      | 1機能は3〜6ファイルなので階層を増やさない（例外は `main-view/markdown/`。置き場所ではなく概念の名前）                                                                                                                                                                                                                                                                   |
| ESLint の `import/no-restricted-paths` | lint は oxlint で、同等の規則が無い。辺の検査は `test/architecture.test.ts` で行う                                                                                                                                                                                                                                                                                      |

## 3. 動きの流れ

### 起動

1. `cli.ts` が `config.ts` で環境変数を読む（ポート・キャラクター・自動オープン・駆動の種類・新規起動）
2. `bundle.ts` が `ui/main.tsx` を `bun build` で束ね、**スクリプトと CSS の1組**をメモリに持つ
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
Layout に出す。復帰したときにセッションを続きから起こし直す話は 8章。

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

| イベント            | 出どころ                                                                                               | 中身                                                                   | 用途                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `tasks-changed`     | adapter（`task-summary`）                                                                              | `tasks: TaskSummaryItem[] \| undefined`                                | サイドバーのタスク一覧。読み直しは adapter が mtime で行う                       |
| `character-changed` | adapter（`character-pack`）                                                                            | `name`・`expressions`・`portraits`（表情 → URL）・`outfitAccents`      | キャラビューが立ち絵を取りに行く先。切り替え（7章）                              |
| `session-started`   | core（`session-manager`）                                                                              | `sessionId`・`cwd`                                                     | 新規に起きた合図。`session-info`（`init`）は最初の依頼まで届かないので、別に持つ |
| `model-changed`     | core（`sdk-message`。`assistant` の `local_command_run`） / adapter（`sdk-driver`。`setModel` の確定） | `model: string`（1: `/model` の引数そのまま。2: `MODEL_ALIASES` の値） | `state.model` の出どころを3つにする（下記）                                      |

**`state.model` の出どころは `session-info`（`init`）だけではない**（2026-09-17）。`init` は
ターンの頭に届くので、`/model haiku` を送ったそのターンの `init` はまだ古いモデルを返し、
正しい値が載るのは**次の依頼の** `init` から。そこで `assistant` に乗る `local_command_run:
{ command: "model", args }` を先回りで見て、`args` が `MODEL_ALIASES`（4.3）と完全一致する
ときだけ `state.model` を更新する（一致しなければ何もせず、次の `init` を待つだけにする。
知らない値でサイドバーを誤った値に倒さないため）。

**サイドバーの `<select>` から `set-model` を送ったときも同じ `model-changed` を使う**
（2026-09-17）。`src/adapter/sdk-driver.ts` の `setModel` が `session.setModel()` の確定を
待ってから出す（駆動を経ているので、これは「ブラウザ側のローカル echo」の禁止（3章「依頼」）
には当たらない）。本物の駆動がこれを出していなかった間、選んだ直後に次のイベントで
`state.model` が古い値へ戻って見える不具合があった（偽の駆動 `fake-driver.ts` は最初から
`session-info` の再送でこれをやっていたため、目視確認では気づけなかった）。

**`local_command_run` は SDK 0.3.274 で入った**（0.3.268 には無い。2026-09-17 に両方で実測）。
古い SDK では `assistant` に `local_command_source`（英語の文面だけ）と `result` の
`local_command`（コマンド名だけで引数を持たない）しか来ず、**どちらからもモデル名を構造的に
取り出せない**。`package.json` の下限をこれより下げると、この経路は黙って効かなくなる
（`init` を待つ元の1ターン遅れに戻るだけで、テストは通ってしまう）。

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
  | { type: "refresh"; target: "page" | "style" }
```

- `hello` は接続ごとに1回。**snapshot はサーバ側の reducer が持っている `SessionState`**
  （`session-manager` が同じ `applySessionEvent` で畳み続けている）
- `protocolVersion` が ui の `PROTOCOL_VERSION` と違えば、ui は「ページを読み込み直してください」を
  出して以降のフレームを無視する（起こし直したプロセスと古いタブの組み合わせで起きる）
- `error` の `reason` は定型文（`"依頼の形式が正しくない"` など）。会話の内容を含めない
- `refresh` は**セッションとは無関係**で、`src/ui/` を見張っている開発中だけ届く（11章）。
  `style` は CSS だけ取り直す、`page` はページごと読み込み直す。会話の内容は乗らない

### 4.5 版と互換

`PROTOCOL_VERSION` は整数1つ。**イベントの追加は版を上げない**（知らない `kind` は reducer が
無視する。いまの「未知の種別で落ちない」と同じ）。既存イベントの形を変える・状態の形を変えるときだけ上げる。

## 5. core と adapter

**サーバ側は2つのディレクトリに分かれている**（2章の表）。`core/` は純粋な判断だけで
`node:` / SDK / `ws` を import せず、外の世界に触るものは `adapter/` にある。この章の各節は
ファイル名で引けるようにしてあるので、どちらのディレクトリにあるかは各節の冒頭を見る。

### session-driver.ts（core）と sdk-driver.ts（adapter）

**契約は `core/session-driver.ts`、SDK の実装は `adapter/sdk-driver.ts`**。境目の基準は
「`protocol` の語彙で書けるか / SDK の語彙を名乗るか」で、`SessionDriver` の契約
（`prompt` / `interrupt` / `answer` / `pending` / `setModel` / `setPermissionMode` / `close`）と
`onEvent`・`SessionDriverOptions`・`DEFAULT_PERMISSION_MODE` / `DEFAULT_MODEL` は `core` 側、
`query()` を回す `startSession` と `buildQuerySeedOptions`・`findSessionToResume` /
`readRestoredEvents`・SDK の型を持つ `DEFAULT_EFFORT` は `adapter` 側。

- `persona: string | undefined` を受け取り、`systemPrompt.append` に tsukumo 側の規約
  （`SPEECH_CADENCE_PROMPT` / `REPORT_NOTATION_PROMPT`）と一緒に足す（7章）
- `resume: string | undefined`（8章。T-078 のとおり）

### fake-driver.ts（adapter）

`SessionDriver` と同じ契約で、**台本（`StampedEvent[]` の JSON）を時間どおりに流す**。`prompt()` を
受けたら台本の次の場面を再生し、`canUseTool` 相当の答え待ちも積む（`answer()` で解決）。台本は
`test/fixture/` に**手で書いた架空の会話**として置く（`docs/coding-standards.md`「会話内容の扱い」）。
用途は 10章（目視・Playwright・スクリーンショット）。`TSUKUMO_DRIVER=fake` で選ぶ。

**場面には名前が付く**（`turns[].name`。`{ name, steps }` の並び）。`TSUKUMO_FAKE_SCENE` で
名指しすると、その場面を起こした直後に `opening` の続きとして流し、次の `prompt()` はその次の
場面から続く。**依頼を手で送らずに特定の状態を出す**ための口で、状態のカタログを撮る
`scripts/capture-catalog.ts` が使う（`docs/architecture.md`「手で確かめること」）。

### session-manager.ts（core）

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

### character-pack.ts（adapter）

7章。`listCharacterPacks(dirs)` と `readCharacterPack(dir)`。読めないものは `undefined`（立ち絵なしの
フォールバック）。

**`remembered-character.ts`** はその隣に置く別モジュールで、直前に出していたパックの名前だけを
`~/.tsukumo/state.json` に読み書きする（`readRememberedCharacter` / `writeRememberedCharacter`。
書き込みの失敗で例外を投げない）。外の世界（ホームのファイル）に触るのはここだけで、覚えた名前が
`listCharacterPacks` の一覧に無いときに既定へ落とす判断は呼び出し側（`cli.ts`）が持つ。選択そのものは
セッション限りだが、次の起動の初期値としては覚える（13.6「第3の扱い」）。

**`character-edit.ts`** は書き込む側（7.1）。画面から届いた立ち絵・差し色を
`~/.tsukumo/characters/<name>/` に書き、書けたパックを読み直して返す（受け付けなければ `undefined`）。
**ホームの場所を組み立てるのは `tsukumo-home.ts` の1関数だけ**で、`state.json` もパックの置き場も
その下に並ぶ。

### task-summary.ts（adapter）

いまの読み直し係を、**mtime が変わったときだけ `tasks-changed` を起こす**形にする（1〜2秒の
ポーリング。`fs.watch` は macOS でも取りこぼすことがあるので使わない）。

### server.ts（adapter）

| 経路                              | 中身                                                                                                                  | トークン |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------- |
| `GET /`                           | ページ（`<div id="app">` と `<script src="/assets/ui.js">` と `<link href="/assets/style.css">`。**本文は入れない**） | 不要     |
| `GET /assets/ui.js` / `style.css` | 束ねたもの（メモリ。11章の見張りで差し替わる）                                                                        | 不要     |
| `GET /vendor/<name>`              | allowlist の対応表にある外部ライブラリだけ（実ファイルは `node_modules`。`vendor-asset.ts`）                          | 不要     |
| `GET /character/<file>`           | いまのパックの素材。**`character.json` に書かれたファイル名だけ**を配る（パスから組み立てない）                       | 不要     |
| `GET /ws?t=<token>`               | WebSocket。Origin とトークンを確かめてから upgrade                                                                    | **必要** |

会話の内容が乗るのは `/ws` だけ。他は静的な物か素材なので、トークン無しでよい。

### config.ts（core）

| 環境変数              | 意味                                              | 既定             |
| --------------------- | ------------------------------------------------- | ---------------- |
| `TSUKUMO_VIEW_PORT`   | いまのまま（既定 7327、塞がっていれば +1 で20個） | 7327             |
| `TSUKUMO_CHARACTER`   | パックの名前（`characters/<name>`）または絶対パス | `tsukumo-spirit` |
| `TSUKUMO_OPEN_VIEW`   | いまのまま                                        | 開く             |
| `TSUKUMO_DRIVER`      | `sdk` / `fake`                                    | `sdk`            |
| `TSUKUMO_FAKE_SCENE`  | `fake` のとき起こした直後に流す場面の名前         | 流さない         |
| `TSUKUMO_NEW_SESSION` | `1` で復元せず新規に起こす（8章の逃げ道）         | 復元する         |
| `TSUKUMO_WATCH_UI`    | `1` で `src/ui/` を見張って組み立て直す（11章）   | 見張らない       |

`TSUKUMO_CHARACTER_DIR` は `TSUKUMO_CHARACTER` に統合する（ディレクトリの指定は絶対パスで足りる）。

## 6. ui

### 6.1 部品の木

```
<SessionProvider>            lib/socket.ts で接続。SessionState と dispatch(command) を Context で配る
└ <TurnSelectionProvider>    選んでいるターンを配る（6.2）
   └ <Root>                  main.tsx の中（export しない）。useScreen() で出す画面を選ぶ（6.2・13.6）。
      │                      **会話の画面は外さず hidden で隠す**（下書き・選んでいるターン・スクロール位置を保つ）
      ├ <Layout>             会話の画面。grid。リサイザ。接続切れの印。答え待ちの印（タブのタイトル・枠色）。
      │  │                   右下に「領域の比率を既定に戻す」を常設（13.6）
      │  ├ <MainView>        <TurnTabs> + <Turn>（直近5件、`MAX_MAIN_VIEW_TURNS`）
      │  │   └ <Turn>        <RequestHeading> + [<Report> | <QuestionRecord>]*
      │  │       └ <Report>  Markdown（6.3）。書きかけはブロック単位で memo
      │  ├ <CharacterView>   <Portrait> + <BalloonTrack>
      │  │   ├ <Portrait>    立ち絵。**components/portrait.tsx**（キャラクター画面の並びも使う）。SVG は
      │  │   │               インラインで差し色、ラスタは <img>。動きの hooks はキャラビュー側に残る（6.5）
      │  │   └ <BalloonTrack> <Balloon>*。最新を一番下、下端の位置を固定（4.2 の決定どおり）。
      │  │                   出るのは `speak` で来たセリフだけ（4.2）
      │  ├ <Sidebar>         <Activity> + <TaskList> + <SessionInfo> + <TaskBoard>
      │  │   └ <TaskBoard>   タスク一覧の表。見出しの「一覧を見る」から <dialog> で開く（4.2）
      │  │   └ <SessionInfo> モデル / 許可モード の <select>、キャラクターの <select> と、その右の
      │  │                   「整える」（#character へのリンク。13.6）
      │  └ <Dispatch>        <PendingAnswer> + <Composer> + <TurnStatus>
      │      ├ <PendingAnswer> 許可（許可 / 拒否）・質問（**1問ずつ**。選択肢 + 自由入力。**複数選択はチェックボックス**）
      │      ├ <Composer>    <textarea>。Enter 改行 / ⌘Enter 送信。<CommandSuggestions> を内包
      │      └ <TurnStatus>  送信 ⇄ 中断、経過 / 所要
      ├ <CharacterScreen>    キャラクター画面（#character。13.6）。戻る口「← 会話へ戻る」（答え待ちの印つき）・
      │   │                  パックのラベルと名前・「新しく作る」（#character/new へ）
      │   ├ <CharacterEdit>  立ち絵の並び（表情ごと。<Portrait> を使う）と差し色（衣装ごと）の差し替え（7.1）
      │   └ 画面の色         ground / surface / ink の3つ（appearance-color.ts。localStorage）
      └ <CharacterCreate>    作る画面（#character/new。7.1）。戻る口「← キャラクターへ戻る」。
                             作れたら「このキャラクターに切り替える」
```

**部品は `SessionState` と `dispatch` だけを見る。** DOM を直接いじる配線（`MutationObserver`・
`data-` 属性で状態を渡す）は持たない。

**質問が出ている間、`<Composer>` と `<TurnStatus>` は CSS で畳む**（`.dispatch:has(.pending-question)`。
入力欄の領域を質問の箱に全部渡すため。`docs/requirements.md` 4.7）。**部品を外すのではなく隠す**ので、
入力欄の下書きは `<Composer>` のローカル状態に残ったままになる（6.2）。

**選んでいるターンは `<SessionProvider>` の内側の `<TurnSelectionProvider>`
（`ui/stores/turn-selection.tsx`）が配る**（6.2）。`<MainView>` のタブだけでなく **`<CharacterView>` の吹き出しと表情も同じ選択に
従う**（過去のターンを選んでいる間は、そのターンのセリフと**最後のセリフの表情**に戻す。
ターンごとのセリフは `protocol/turn-speech.ts` が記録から引く）。**立ち絵の「動き」は遡らない**
（時間相対のアニメーションなので、遡るには `docs/requirements.md` 4.3 の決定の見直しが要る）。

### 6.2 状態の持ち方

| 状態                                                             | 置き場所                                                                                                       |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `SessionState`                                                   | `<SessionProvider>` の `useReducer(applySessionEvent)`。`events` フレームを畳む。`hello` で置き換える          |
| 接続中 / 切断中、プロトコルの版違い                              | `<SessionProvider>` のローカル状態（`ui/stores/session.tsx`）                                                  |
| 選んでいるターン（`turnId`）、追従中か（いちばん下を見ていたか） | `ui/stores/turn-selection.tsx` の Context（メインビューとキャラビューの両方が読む。規則は同じ）                |
| 入力欄の下書き、候補の開閉と選択位置                             | `<Composer>` のローカル状態                                                                                    |
| 質問の選択（送る前）                                             | `<PendingAnswer>` のローカル状態                                                                               |
| 経過時間の秒数                                                   | `<TurnStatus>` の1秒タイマー（`turnStartedAt` から計算）                                                       |
| 領域の比率                                                       | `<Layout>`。`localStorage` に**比率だけ**保存（会話は保存しない）                                              |
| 出している画面（会話 / キャラクター / 作る）                     | `location.hash`（`stores/screen.tsx` の `useScreen()` が `hashchange` を読む）。保存しない（URL が持つ。13.6） |

zustand などの状態ライブラリは**入れない**。必要になるまで `useReducer` + Context で足りる。
**`ui/stores/` はその「画面全体で共有する状態」の置き場であって、状態ライブラリの置き場ではない**
（2章）。

### 6.3 Markdown（`features/main-view/markdown/markdown.tsx`）

```
react-markdown
  remarkPlugins: [remark-gfm]
  rehypePlugins: [rehype-raw, [rehype-sanitize, schema], rehype-highlight]
  components: { code: フェンスの言語で MermaidBlock / ChartBlock / 通常 に振り分け, a: 許可スキームだけ }
```

- Markdown 一式（unified の設定・`sanitize-schema.ts`・`MermaidBlock` / `ChartBlock`・
  `vendor-script.ts`）は**メインビューの機能の中**に置く（読み手が `<Report>` だけなので、
  共有の箱に上げない。2章）
- **`schema` はいまの `sanitizeReportHtml` の許可リストを写す**（54要素・42属性 + `class` の語彙
  `note` / `badge` / `cols` / `card` など）。`style` 属性は `url(` / `@import` を含むものを落とす
  規則も `schema` の `attributes` の正規表現で表す。**規約（`report-notation.ts`）・schema・部品
  （`notation.tsx`）・CSS の4つは同じコミットで揃える**（いまの決定のまま）
- **記法の class 名は部品に解決する**（`notation.tsx` を `components` の `div` / `span` に挿す）。
  モデルが書くのは骨格（`note` / `badge` / `cols` / `card` / `stats` / `stat`）で、**CSS が受ける
  class 名（`report-` 付き）は tsukumo が付ける**ので、モデルの書いた文字列とセレクタが直接
  つながらない。**知らない class 名と `style` 属性は素通し**（変換は足し算だけで、規約の表に無い
  見せ方を落とさない）。お願いのラベル（「お願い」の文字）もここが描く
- 引用 `> `・ネストしたリスト・水平線・列揃え（`:---:`）は GFM でそのまま描ける。
  `report-notation.ts` から「描けない記法」の迂回の記述を外す（T-063 はこの段で閉じる）
- **流れる本文**: 書きかけの Markdown を空行で塊に割り、塊ごとに `memo`（鍵は塊の文字列）。
  描き直すのは末尾の塊だけ。**コードフェンスと HTML ブロックの中の空行では割らない**
  （フェンスは表や見出しに化けないため、HTML は `<details>` の中身が外へこぼれないため。
  HTML は閉じタグが必須の要素だけを深さで数え、閉じタグを省ける `p` / `li` / `td` などは数えない
  ——省略された閉じタグを待つと以降ずっと割れなくなる）。**閉じていないものは末尾の塊の中に
  閉じる**ので、書きかけの間だけその塊の `memo` が効かない
- コードスパンの中の HTML は文字のまま（GFM の仕様どおり。自前の特別扱いは要らなくなる）

### 6.4 重いライブラリ

| もの                                                               | 読み方                                                                                                                      | 置き場所            |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| React・react-markdown 一式・`ws`（ブラウザ側は標準の `WebSocket`） | `bun build` が npm から束ねる                                                                                               | `node_modules`      |
| highlight.js                                                       | `rehype-highlight`（`lowlight` の common 言語）を束ねる。テーマ CSS だけ `/vendor/` で配る                                  | 束ねる / `/vendor/` |
| mermaid（3.3MB）・Chart.js                                         | **束ねず `/vendor/` で配り、その記法が出たときだけ `<script>` で読む**。`MermaidBlock` / `ChartBlock` が `useEffect` で描く | `/vendor/`          |
| Idiomorph                                                          | **消える**                                                                                                                  | —                   |

`/vendor/<name>` が返すのは `node_modules` の実ファイル（`src/adapter/vendor-asset.ts`）で、
**CDN からは読まない**。`bun build` の出力は1本（コード分割はしない。分割するとディスクに
置かないメモリ配信と噛み合わない）。

### 6.5 立ち絵の動き

**立ち絵は「1枚の矩形」として扱う**（2026-09-13 決定。`docs/requirements.md` 4.3）。`<Portrait>` が
動かすのは**位置・大きさ・傾き・上下・不透明度**だけで、**素材の中身には触らない**。
`docs/requirements.md` 2.2 が「素材は利用者が自分で用意する」と決めている以上、素材がどう
作られているかを当てにできないため（既定のパックの SVG も `id="body"` しか持たない）。
**この割り切りの見返りに、SVG でも PNG でも GIF でも同じだけ動く。**

- **まばたき・表情のクロスフェード・部分の動きは作らない**（素材の構造に依存するため）。
  Lottie / Live2D も同じ理由で採らない
- **動くのは利用者の注意が空いているときだけ。** `<Portrait>` は `SessionState` の
  `turnInProgress` / `runningTools` / `turnFinishedAt` から「いま読んでいるか、待っているか」を
  決め、**読んでいる間は呼吸だけに落とす**
- 作るのは4つ。**呼吸**（常時のごく小さい上下）/ **待っている間の移動**（ターン進行中に
  領域の中をゆっくり歩く）/ **完了の反応**（小さく跳ねる）/ **失敗でびくっ**（一瞬のけぞる）
- **領域の外へ出さない。** `.character-region` の中で閉じる（レポートの上に被らせない）
- `prefers-reduced-motion: reduce` を尊重する（`src/ui/styles/theme.css`）
- 動きは CSS の `@keyframes` と `transform` で足りる。**`<canvas>` もアニメーションの
  ライブラリも要らない**（矩形しか動かさないため）

**既にあるもの**: `portrait-fade-in`（登場。`components/portrait.module.css`）・`balloon-appear`・
`balloon-push-up`（`features/character-view/character-view.module.css`）。登場はここで作り直さない。

### 6.6 CSS

**CSS Modules（`*.module.css`）を機能と同居させる**（2026-09-20 の判断。2026-09-16 の
「`src/ui/styles/` に集め、機能と同居させない」を置き換えた）。置き場は**機能ごとに1枚**
（`features/<機能>/<機能>.module.css`）と、**自分の見た目を持つ共有部品の隣**
（`components/portrait.module.css`）。**グローバルなのは `styles/theme.css` だけ**で、
トークン（`:root`）・`body`・フォーカスの輪・`prefers-reduced-motion`・リンクを持つ。
**16進の色を書いてよいのもそこだけ**（13.2）。

class 名は用語集の語（`balloon` / `portrait` / `turn-tab` など）を**そのまま**保ち、部品からは
`styles["balloon-track"]` と引く（キャメルケースへ変換しない）。実際に DOM へ付く名前は
`balloon-track_uHH43w` のように**組み立てのたびにハッシュ化される**ので、外から要素を指す口が
要るところは `data-*` を持つ（4領域の `data-region`。`scripts/capture-view.ts` が使う）。

同居に移した理由は3つ。

1. **読み込み順に頼らなくなった。** 以前の反対理由（クラス名がグローバルで、読み込み順が
   正しさの一部）は `narrow-screen.css` が他のファイルの選択子を後から上書きしていたためだった。
   狭い画面の規則を**各機能の `@media` へ分解**したので、上書きは同じファイルの中で閉じる
2. **名前の衝突が起こらない。** 機能をまたいだ `.question-*`（質問の記録と答え待ち）のように、
   同じ語を別の意味で使っても混ざらない
3. **機能に1対1で対応しない CSS はほぼ消えた**（もう1つの反対理由）。残ったグローバルは
   `theme.css` 1枚で、これは「機能の中にあるのに機能に閉じていない」ファイルではなく
   **ページの下地**である

**機能をまたいで見た目が要るときは className を渡す**（CSS の選択子で他の機能の class を
指さない）。`<Portrait>` が例で、立ち絵そのものの中身と動きは `components/portrait.module.css`、
**どこにどれだけの大きさで置くか**は呼び出し側（キャラビュー／キャラクター画面）が
`className` で足す。打ち消しは**親の class から**書いて（`.character-layout .portrait`）、
読み込み順ではなく詳細度で勝たせる。

**テストの中では class 名が CSS に書いた綴りのまま届く**（`test/css-module-loader.ts` が
`bun test` の読み込みに差し込む）。`bun` のテストランナーは CSS を組み立てないので、これが無いと
対応表が空で届いて class 名が全部 `undefined` になる。CSS に無い名前は `undefined` のままなので、
**綴りを間違えるとテストで落ちる**。

## 7. キャラクターパック

```
characters/<name>/
  character.json     name / portraits（表情 → ファイル名）/ outfitAccents / expressions（名前 → 日本語ラベル）/ speechMarker
  persona.md         人格。tsukumo が systemPrompt.append で足す（口調・セリフと詳細の書き分け。セリフの間合いとレポートの記法は core 側）
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
- **切り替え**（`switch-character`）は**別のパックでセッションを起こし直す**。`speak` の enum も
  人格も、起こし直せば確実に入れ替わる（`startSession` が `mcpServers` を毎回組み直しているので
  `setMcpServers` は要らない。2026-09-14 実測）。切り替え時に画面から消すのは吹き出し・立ち絵・
  メインビューの3つ
- **キャラクターごとに別のセッションを持つ**（2026-09-14 決定。「キャラクターごとに別の部屋が
  ある」）。セッションの印を **`tsukumo:<パック名>`** にし、**起動時も切り替え時も、これから
  起こすパックの印を持つ最新のセッションを探して `resume` する**（無ければ新規）。印の組み立ては
  `core/config.ts` の `sessionTag` 1箇所で、`cli.ts` はそれを `findSessionToResume` と
  `startSession` の `tag` の両方に渡す。**戻ってくれば、そのパックの会話も口調も戻る**
  - 画面の履歴は `readRestoredEvents` の再生をそのまま使う（8章）
  - **前は「切り替えると会話は続かない」としていた。** 変えたのは2つ揃ったから: (1) 段9で
    transcript から画面の履歴を組み直せるようになり、復元の材料が増えた (2) **`resume` した
    セッションは最初に起こしたときの人格を保つ**と分かった（2026-09-14 スパイク。`systemPrompt`
    の append を別の人格に差し替えても、前の人格の口調が残る）。人格が差し替わらないのは、
    パックごとにセッションを分けるなら欠点ではなく利点になる
  - **印はターンが終わって3秒後に付く**（`SESSION_TAG_DELAY_MS`）。ターンを1つも終えずに離れた
    パックのセッションは、次に来たときに見つからず新規から始まる
    （`docs/requirements.md` 4.8「復元できなかったときどうするか」の範囲）
- 素材が1体しか無いときも `<select>` は出す（選択肢1つ。無いように見えるほうが分かりにくい）
- パックの探し先は**同梱の `characters/`・`~/.tsukumo/characters/`・起動先の
  `characters/local/`** の3箇所。同名は後ろが勝つ（7.1）

### 7.1 画面から作るときの置き場と受け取り方

2026-09-15 決定。**立ち絵と差し色の差し替えも、パックの新規作成も実装済み**（この節のとおり）。

**書き込み先は `~/.tsukumo/characters/<name>/` の1箇所だけ。** `state.json` と同じ
`~/.tsukumo/` の下に置く。

- キャラクターの好みはプロジェクトごとではない（13.6 で `remembered-character` を cwd に
  依存させないと決めたのと同じ理由）
- **リポジトリの作業ツリーが汚れない。** `bun link` でグローバルに入っているので、別プロジェクトから
  作ったパックが同梱側に現れると git の差分になる
- 権利のある素材が公開リポジトリに入る経路がそもそも生まれない（`README.md` と
  `characters/README.md` の約束）

却下した案は2つ。`<cwd>/characters/<name>/` は `.gitignore` を `characters/local/` から広げる
必要があり、tsukumo リポジトリ自身で起動したときに同梱パックと取り違えやすい。同梱側は上のとおり
リポジトリが汚れる。

**探索先は3箇所で、同名は後ろが勝つ**（`listCharacterPacks`）:

| 順  | 置き場                            | 中身                                            |
| --- | --------------------------------- | ----------------------------------------------- |
| 1   | 同梱の `characters/*`             | `tsukumo` / `tsukumo-spirit`（自作の既定）      |
| 2   | `~/.tsukumo/characters/*`         | **画面から作ったパック**（全プロジェクト共通）  |
| 3   | 起動先の `<cwd>/characters/local` | そのプロジェクトで用意した素材（1つ固定のまま） |

- **`local` の特別扱いは残す。** 起動先側は今までどおり `characters/local` の1つだけを見るので、
  `.gitignore` も `characters/README.md` の説明も変えなくてよい
- **「同名は起動先が勝つ」という既存の規則は変えない。** ホームはその手前に挟まる

**画像は data URL を JSON に載せ、いまの WebSocket のコマンドで受け取る。**
`src/protocol/command.ts` に `ClientCommand` を1つ足すだけで、`src/adapter/server.ts` に新しい
書き込み経路を作らない。起動トークンと `Origin` の照合・zod の検証・定型文の `error` が
そのまま効く。`multipart/form-data` の POST は node:http にパーサーが無く外部依存が要るので採らない。
生バイトの POST は照合と上限をもう一組書くことになるので採らない。

| 何                        | 上限                                  |
| ------------------------- | ------------------------------------- |
| 画像1枚（デコード後）     | 2 MiB                                 |
| 1つのパックが持てる画像   | 8 枚                                  |
| WebSocket の `maxPayload` | 4 MiB（base64 の 33% 増と JSON の分） |

- `MAX_MESSAGE_BYTES` はいま `MAX_PROMPT_TEXT_LENGTH * 4`。**依頼の文面の上限（zod の
  20,000 文字）は別に効いている**ので、`maxPayload` を上げても文面の上限は緩まない
- **書いてよいのは `~/.tsukumo/characters/<name>/` の下だけ。** `<name>` とファイル名は受け取った
  文字列からパスを組み立てる前に protocol のスキーマで検証する（`[A-Za-z0-9._-]` だけ・`.` で
  始まらない・区切り文字を含まない）。`..` が名前として通らないので、パストラバーサルの経路が
  生まれない
- 受け付けるのは `.svg` / `.png` / `.gif`（`classifyPortraitFile` が既に知っている種類）。
  差し色が効くのはインラインで埋め込んだ SVG だけ（`docs/requirements.md` 4.4）
- **会話の記録とは混ざらない。** `~/.tsukumo/` に入るのは `state.json` とこのパックのディレクトリ
  だけで、transcript は Claude Code 側（`~/.claude/`）にある。素材は利用者のファイルであって
  会話ではないが、この経路で会話を書かないことは変わらない（9章）

**差し替えるときの細部**（2026-09-16、実装で決めた）:

- **ファイル名は受け取らず、表情と形式から組み立てる**（`<表情>.<svg|png|gif>`）。届いた文字列が
  パスの一部になる経路がそもそも無くなり、同じ表情の差し替えは同じ名前の上書きになる
- **初めて変えるときに、いま出しているパックをホームへ丸ごと写す**（定義・`persona.md`・
  `portraits` の素材）。**人格ごと写さないと、次の起動でそのパックの人格が消える。** ホームに
  同じ名前のパックが既にあれば写さない（画面から重ねた変更を上書きしないため）
- **参照が外れた素材は消す**（形式を変えて差し替えたときの古いファイル）。消すのはホームの
  そのパックのディレクトリの中の、どの表情からも参照されていない画像だけ
- **`/character/<file>` の URL に素材の版を混ぜる**（`?v=<パック名>@<更新時刻>`）。ファイル名が
  同じまま中身だけ変わるので、パックの名前だけではブラウザが取り直さない
- **起動先の `characters/local` と同じ名前のパックは画面から変えられない**（`editable: false`。
  ホームに書いても探索の順で負け、次の起動で消えたように見えるため）。画面はその口を無効にする
- 反映は**セッションを起こし直さずに `character-changed` を流し直すだけ**（会話も履歴も消えない）。
  **立ち絵を足した表情を `speak` の側で選べるようになるのは次の起動から**（`speak` の enum は
  起こしたときの定義から作る）

**新しく作るときの細部**（2026-09-17、実装で決めた）:

- **既にある名前は弾く。** 探索の順で後ろが勝つので、作れてしまうと**既存のパックが黙って隠れる**。
  既にあるものを変えたいなら、切り替えてから上の編集の口で変える。画面は一覧にある名前を
  そのまま押せない理由として出す（`error` フレームはまだ画面に出していないので、**判断を画面と
  サーバの両方に置く** — 画面は押させない、サーバは書かない）
- **名前に使えるのは半角の英数字と `.` `_` `-` だけで、`.` では始められない**
  （`src/protocol/character.ts` の `isCharacterPackName`）。ディレクトリ名になるのはこの1つだけ
  なので、パスの区切り・`..`・隠しディレクトリを名前として通さない。表示名（`character.json` の
  `name`）は作った時点ではディレクトリ名と同じで、日本語にしたければ定義ファイルを手で直す
- **最低限そろえさせるのは `default` の1枚。** 必須にするのは境界のスキーマ（`portraits` の
  `default` を required）で、書き込む側まで欠けた形が届かない。**`working`（自動で切り替える先）を
  必須に据えていた根拠は 2026-09-17 に失効し**、同日 `thinking` へ改名したうえで必須から外した
- **作った直後に自動では切り替えない。** 増えるのはサイドバーの `<select>` の選択肢で、
  切り替えは選んだときに起きる（切り替えは駆動の起こし直し＝会話の画面の初期化なので、作る操作の
  副作用にしない）。**作る画面には「このキャラクターに切り替える」が出て**（2026-09-17）、押した
  ときだけ切り替わってキャラクター画面へ戻る（ターン進行中は押せない。13.6）
- 差し色は `default` の1色だけを受け取る。衣装ごとの出し分けと `proud` / `flustered` の立ち絵は、
  作ったあと切り替えて、キャラクター画面の編集の口で足す（**作る口は最低限にする**）。
  **作る口と変える口がどの画面にどう並ぶかは 13.6**
- 書く順は**素材 → `character.json`**。途中で失敗したディレクトリは定義を持たないので一覧に
  出ず、そのうえで書きかけのディレクトリは消す

## 8. セッションの復元と複数化

**復元の決定は `docs/requirements.md` 4.8 のまま**（`cwd` + tsukumo の印（パックごと。7章）、
常に自動で続きから、tsukumo 側に会話を保存しない、失敗したら新規で起こす）。新しい形では次が楽になる。

- 画面の履歴の組み直しは「`getSessionMessages` → `SessionEvent[]`（時刻付き）→ `session-manager` の
  `state` に畳む」だけ。接続したブラウザは `hello` の snapshot でそのまま同じ姿になる
  （**ブラウザ側に復元の特別な経路は要らない**）
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
| SDK の型との一致               | `PERMISSION_MODES` / `MODEL_ALIASES` が SDK の型と同じ値であること（型レベルの検査）                                       | `test/adapter/sdk-driver.test.ts`     |
| `session-manager`              | 偽の駆動を差し込み、`hello` → `events` の順序・バッチ・`dispatch` の分岐                                                   | `test/core/session-manager.test.ts`   |
| `server`（ws）                 | 接続 → `hello` が返る、トークン無しは 403、Origin 違いは 403、コマンド → 駆動が呼ばれる                                    | `test/adapter/server.test.ts`         |
| ui の部品                      | `bun test` + `happy-dom` + `@testing-library/react`。**役割と文言で当てる**（HTML の文字列一致はしない）                   | `test/ui/**`                          |
| 層の検査                       | `protocol ← core` / `protocol ← ui` / `core ⟂ ui` の3辺。外部ツールは増やさない                                            | `test/architecture.test.ts`           |
| 画面全体                       | **偽の駆動で起こした tsukumo に Playwright**（`webapp-testing` スキル）。数値で読めるものは CDP で読む。色・間合いは人の目 | `scripts/`（本体から呼ばれない）      |
| 状態のカタログ                 | 台本の場面を名指しして起こし直し、広い窓と狭い窓で撮って索引 HTML に並べる（`TSUKUMO_FAKE_SCENE`）                         | `scripts/capture-catalog.ts`          |

**ブラウザに出た絵は自動テストで守らない**、という方針は変えない。変わるのは「claude を起こさずに
絵を出せる」こと（偽の駆動）で、目視の手順が `docs/architecture.md`「手で確かめること」から
API を使わない形になる。

## 11. ビルドと依存

- `bundle.ts` は `bun build src/ui/main.tsx --target=browser --outdir <一時ディレクトリ>` を
  起動時に1回起こし、**出てきた `.js` と `.css` を読んでから消す**（JSX は tsconfig の
  `"jsx": "react-jsx"` で自動。CSS は `main.tsx` から import で辿れるものが1本にまとまる）。
  **成果物をディスクに残さない**という 2026-09-12 の決定は変わらない（`--outdir` が要るのは
  CSS Modules で出力が2本になるため。`docs/architecture.md`「CSS Modules の成果物は一時
  ディレクトリへ出して読み、すぐ消す」）
- tsconfig に `"jsx": "react-jsx"` を足す。ブラウザの型は `@types/bun` が持っているのでそのまま
- **HMR（差分を当てる）は持たない。** 代わりに、**`src/ui/` を見張って組み立て直し、開いている
  タブに「取り直せ」を押す**（2026-09-16 決定。下の「作り直しを押す仕組み」）。**Vite は足していない**し、
  `Bun.serve` の HMR も `Bun.build()` も使わない（「Bun固有APIに寄せない」規約のまま）

**作り直しを押す仕組み。** `src/adapter/ui-rebuild.ts` が `node:fs` の `watch` で `src/ui/` を**再帰に**見張り、保存が静まって
から（120ms）`bundle.ts` の `buildUiScript` / `buildStyleSheet` を呼び直す。組み上がったものは
`src/cli.ts` が持ち替え、`protocol` の `refresh` フレーム（4.4）で開いているタブへ押す。
**差分は当てない**（当てた時点で HMR そのものになり、規模が跳ねる）。成果物は前と同じくメモリに
だけ持つ。

**救えるのはブラウザに配る側だけ**で、`src/` を直すたびに上げ直さずに済むわけではない:

| 直した場所                  | どうなるか                                                                   |
| --------------------------- | ---------------------------------------------------------------------------- |
| `src/ui/**/*.css`           | ページを読み込み直す（下の注記）。状態は繋ぎ直しの `hello` で戻る            |
| `src/ui/` の `.ts` / `.tsx` | ページを読み込み直す（`refresh` の `page`）。状態は繋ぎ直しの `hello` で戻る |
| `src/protocol/`             | **プロセスの上げ直しが要る**（下）                                           |
| `src/core/` `src/cli.ts`    | **プロセスの上げ直しが要る**。サーバ側のコードは動いているプロセスの中にある |

**CSS だけを取り直す道（`refresh` の `style`）は使わない**（2026-09-20）。CSS Modules の class 名は
ハッシュ化されて JS 側の対応表にも焼かれるので、片方だけ新しくすると綴りが食い違って崩れた画面が
残る。`protocol` には `style` が残っているが、押すのは常に `page`。

`src/protocol/` を見張らないのは、**畳み込み（`session-state.ts`）がサーバ側でも回っている**から。
ブラウザ側だけ新しくすると、新旧が食い違ったまま動く状態ができる。片方だけ救うより
「`src/ui/` だけが救える」という1本の線のほうが信用できる。

割り切ってよいと判断した根拠は、直近30コミットで `src/` の各層が触られた回数（2026-09-16 の実測）:
`src/ui/**` が 112回で**全体の52%**、`src/protocol/**` が 49回、`src/core/**` が 43回、
`src/cli.ts` が 11回。手を入れる場所の半分が上げ直し無しで済む。

**見張るのは `TSUKUMO_WATCH_UI=1` のときだけ**（既定は見張らない）。`tsukumo` は `bun link` で
リポジトリを指していて**普段使いと開発が同じ経路**なので、常に入れると仕事中の保存でページが
読み込み直されうる（入力欄の書きかけが消える）。tsukumo 自身を直しながら動かすときだけ
**`bun run dev`**（= `TSUKUMO_WATCH_UI=1 bun run src/cli.ts`）で入れる。
`bun run start` は見張らないままにしてある（普段使いと開発を打ち分けで分ける）。

**組み立て直しが失敗したときは、前の版を配り続ける。** `onRebuilt` を呼ばず `refresh` も押さない
ので、ブラウザは何も起きていないように見える。理由の1行だけがペインに出る（常駐プロセスは
描画1回の失敗で落ちない、の側）。なお `bun build` はトランスパイルだけで**型を見ない**ので、
型エラーだけのコードは組み上がってそのまま配られる。組み立てが失敗するのは構文が壊れているとき・
import 先が解けないとき（＝書きかけを保存したとき）。

**足す依存**（`CLAUDE.md`「外部依存を増やすときは承認を得る」。**2026-09-13 に「移行しようか」の
決定で一括して承認済み**。ここに無いものを足すときは改めて承認を得る）:

| 種別    | パッケージ                                                                         | 用途                                                                                  |
| ------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| runtime | `react` `react-dom`                                                                | ui                                                                                    |
| runtime | `ws`                                                                               | core の WebSocket サーバ                                                              |
| runtime | `react-markdown` `remark-gfm` `rehype-raw` `rehype-sanitize` `rehype-highlight`    | Markdown                                                                              |
| runtime | `remark-cjk-friendly`                                                              | CJK の強調（`**「…」**`）。2026-09-13 にユーザーの承認を得て追加                      |
| runtime | `mermaid` `chart.js` `highlight.js`                                                | ブラウザへそのまま配る外部ライブラリ（6.4）。2026-09-20 に `vendor/` の同梱から移した |
| dev     | `@types/react` `@types/react-dom` `@types/ws` `@testing-library/react` `happy-dom` | 型とテスト                                                                            |
| dev     | `playwright-core`                                                                  | 画面全体の確認（10章）                                                                |

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
| 9   | **セッションの復元**を新しい形に載せる（T-078 の本文どおり。`new-session`）                                                                                                                                                                      | T-078 の完了条件                                                                                                                                                                                                                  | —                                                                                                                               |

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

## 13. 画面のデザイン

見た目の正典。**ここに書いてあるのは計画であって、CSS はこれを写したもの**（写す先は
各機能の `*.module.css`。トークンは `src/ui/styles/theme.css` に置く。6.6）。

いまの見た目は積み上げで決まったもので、**17色が 114 箇所**に直接書かれ、色と書体の
カスタムプロパティは無く、`font-size` は7種類ばらばら、という状態から起こした。

### 13.1 Principles

**色はキャラクターの持ち物、静けさは画面の持ち物。** これが他の4つの根拠になる。

1. **読む面はキャラクターの色を受け取らない。** レポートの本文・サイドバーの文字・入力欄の
   文字は、誰が来ても同じ濃さで読める。色が現れるのは**キャラクターが居る場所**（立ち絵・
   吹き出し）と、**機械が指し示す場所**（フォーカスの輪・`:hover` の縁・選ばれたタブ・
   選んだ選択肢・送信・依頼の見出しの縦罫）だけ。
   **見出しやツール名も「文字」の側**なので `ink` で、色を持つのは隣の縦罫・枠のほう
   （2026-09-13、当ててみたうえで確定）。
   **リンクだけは例外の扱いが要る**: 色を取り上げるかわりに**下線**で区別する。色だけに
   頼らないので、どのパックの `accent` が来てもリンクだと分かる
2. **枠を持たないのはキャラクターだけ。** 付喪神は器物に宿るのであって、ウィジェットの中に
   座っているのではない。**大胆さはこの1箇所に使い**、他の3領域は静かな枠のまま保つ
3. **機械が付けた名前は等幅、人が書いた言葉は本文書体。** タスクのID・ツール名・キー・モデル名・
   経過時間は等幅。レポートとセリフは本文書体。**装飾ではなく区別**で、等幅は「これは機械の側の
   名前だ」という情報を運ぶ
4. **読む面の幅は領域に任せる**（2026-09-14 に「読む面は行長を測る」を**撤回**した）。
   もとは「主な仕事が長時間の読書である以上、行長は設計の対象であって成り行きに任せない」
   として、本文の行長に上限（42 全角 = `.detail-block { max-width: 36.36rem }`）を置いていた。
   **撤回の理由**: 上限はレポートの子孫すべてに効くので、横に広がりたいもの（表・コード・
   図・段組み）まで同じ幅に閉じ込められ、列の多い表は1セルあたり数十pxしか取れず文字が
   1〜2字ずつ折り返してつぶれた。**「表・コード・図だけを上限から外し、本文は 42 全角のまま
   保つ」案も示したうえで、ユーザーは上限そのものをやめる方を選んだ** —
   **1400px の窓で本文の行長が約 67 全角に戻ることを承知のうえでの選択**（2026-09-14）
5. **状態の3色は誰が来ても変わらない。** ok / warn / ng の意味がキャラクターごとに動くと、
   色が情報を運べなくなる

### 13.2 Color

**差せるつまみは4つだけ**にする。残りは導出するか固定する。つまみが少ないほど、
どのパック・どの設定でも壊れない。

| トークン     | 既定値（つくもの精霊） | 役割                 | 誰が差すか                     |
| ------------ | ---------------------- | -------------------- | ------------------------------ |
| `ground`     | `#191720`              | 画面の地             | **使う人**                     |
| `surface`    | `#221f2b`              | 領域の地             | **使う人**                     |
| `ink`        | `#e8e3ea`              | 本文の字             | **使う人**                     |
| `accent`     | `#f2b0a0`              | キャラクターの色     | **パック**（`character.json`） |
| `ink-quiet`  | —                      | 補助の字・弱い見出し | 固定（`ink` から導出）         |
| `rule`       | —                      | 罫線・領域の境目     | 固定（`surface` から導出）     |
| `state-ok`   | `#7ee081`              | 成功・完了           | **固定**                       |
| `state-warn` | `#e3c766`              | 注意・答え待ち       | **固定**                       |
| `state-ng`   | `#e88b8b`              | 失敗・エラー         | **固定**                       |

**既定値の選び方。** `accent` の `#f2b0a0` は**立ち絵の頬と耳から採った色**で、原則1を文字どおりに
した結果。移行前まで使っていた `#8ab4ff` は、VS Code や GitHub Dark をはじめ開発者向けの
ダークテーマがどれも持っている青で、この題材から出てきた色ではないので捨てた。地も中性の黒を
やめ、紫に寄せた暖色の黒にして、淡いピンクの立ち絵と喧嘩しないようにしてある。

**パックが差すのは `accent` 1つだけ**で、地と字は差さない。キャラクターごとに世界の色が変わる
案も検討したが、**読めるかどうかがパック次第になる**ので採らなかった（衣装ごとの差し色
`outfitAccents` は既にあり、そちらは立ち絵の中だけに効く）。

**コントラストの下限を守る。** `ground` と `ink` の組は、使う人が何を入れても本文が読める比を
下回らないところで止める。下回る値が来たら、受け取らずに既定へ落とす。

### 13.3 Type

**書体は `system-ui` と等幅の2本のまま**にする。外部フォントは足さない。ネットワークへ出るのは
`127.0.0.1` に閉じる方針に触れるうえ、この画面が抱える問題は書体の選択ではなく**寸法と行長**の
ほうにあるため。仕事はそちらにさせる。

| 役割                     | 寸法              | 書体     |
| ------------------------ | ----------------- | -------- |
| 印・小さなラベル         | 0.6875rem（11px） | 本文書体 |
| 補助・サイドバーの本文   | 0.8125rem（13px） | 本文書体 |
| 本文（レポート・セリフ） | 0.9375rem（15px） | 本文書体 |
| 依頼の見出し             | 1.125rem（18px）  | 本文書体 |
| ID・ツール名・キー       | 0.8125rem（13px） | 等幅     |

- 段は**この4つだけ**。いまの7種類（0.75 / 0.8 / 0.85 / 0.9 / 0.95 / 1.05rem など）をここへ畳む
- **本文の行間は 1.75**（日本語で長時間読むため、欧文の既定より広く取る）
- **本文の行長に上限は置かない**（2026-09-14。「42 全角で切る」という決定は撤回した。
  理由と経緯は 13.1 原則4）。レポートは段落も表も `.main-step` の内幅をそのまま使い、
  1400px の窓では約 67 全角になる
- **領域の内幅に入りきらない表は、その表だけ横スクロールさせる**（`.table-scroll`。
  ページ全体は横スクロールさせない）。**表のセルは最低4全角を1行で出す**（`min-width: 4em`）。
  この下限が無いと `width: 100%` の表は列の数だけ詰まってセルが1〜2字ずつの折り返しになり、
  表が器に収まってしまうので横スクロールも働かない

### 13.4 Layout

構想を1文で。**上の2枠は読む場所、下は居る場所。キャラクターだけが枠を持たない。**

```
┌─────────────────────────────────┬──────────────────┐
│ メインビュー                      │ サイドバー         │
│ レポート（幅は領域に任せる）        │ いま何をしているか  │
│ 左揃え・本文書体・行間 1.75        │ タスク一覧         │
│                                 │ セッション情報      │
│                                 │ （名前は等幅）      │
└─────────────────────────────────┴──────────────────┘

   ◯  ╭───────────────────╮         ┌──────────────────┐
  立ち絵 │ 吹き出し（最新が下）│         │ 入力欄            │
       ╰───────────────────╯         │                  │
   ↑ 枠も地も持たない。ground の上に直接立つ  │ [送信]  経過: –   │
                                     └──────────────────┘
```

- **揃えは全面左揃え。** 日本語の読み物なので、中央揃えも両端揃えも使わない
- **キャラビューだけが枠と地を持たない**（原則2）。他の3領域は `surface` の地に `rule` の枠
- 領域の比率は使う人が動かせる（既存の仕組みを変えない）

### 13.5 差せるものの受け渡し

- **パック**: `character.json` に `accent` を1つ足す（`outfitAccents` と同じ階層）。無ければ既定値に落ちる
- **使う人**: `ground` / `surface` / `ink` の3つ。**キャラクター画面から変え、
  `localStorage` に持つ**（2026-09-13 決定。置き場所は 2026-09-17 に引き出しから移した。13.6）
- どちらも、届いた値は**境界で検証してから CSS 変数に流す**（外部由来の値の扱いは
  `docs/coding-standards.md`）

### 13.6 設定の置き場所

**今回のことはサイドバーに、それ以外はキャラクター画面に**（2026-09-17 決定。2026-09-13 の
「ずっとのことは普段しまっておく（「見た目」の引き出し）」を置き換えた）。画面から変えられるものを
**セッション限りかどうか**で割り、セッション限りのものは読んでいる間も見えるサイドバーに、
それ以外（利用者の設定もパックの持ち物も）は会話の画面から出た**キャラクター画面**に置く。
**キャラクターの切り替えだけは第3の扱い**（2026-09-14 決定。下の注記）。

| 変えられるもの                                   | 寿命                                                         | 置き場所                             |
| ------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------ |
| モデル                                           | セッション限り                                               | サイドバー「セッション情報」         |
| 許可モード                                       | セッション限り                                               | サイドバー「セッション情報」         |
| キャラクターの切り替え                           | **選択はセッション限り（起こし直す）、次回の初期値は覚える** | サイドバー「セッション情報」         |
| 地・領域・字の色（`ground` / `surface` / `ink`） | 利用者の設定（`localStorage`）                               | キャラクター画面                     |
| 領域の比率を既定に戻す                           | 利用者の設定（`localStorage`）                               | 会話の画面の右下（常設のボタン）     |
| キャラクターの立ち絵・差し色                     | **ずっと**（`~/.tsukumo/characters/<name>/`。7.1）           | キャラクター画面                     |
| 新しいパックを作る                               | **ずっと**（同上）                                           | 作る画面（キャラクター画面から入る） |

**キャラクターの切り替えは「セッション限り」から「ずっと」へ移したわけではない。** 選ぶ操作自体は
今回どおりセッション限り（起こし直すと戻る）だが、**次に起こしたときの初期値としては覚える**
（2026-09-14 決定。ユーザーの指摘「終了直前のキャラクターで起動時にもそうであってほしい」）。
持ち先は `localStorage` ではなく `~/.tsukumo/state.json`（`adapter/remembered-character.ts`、5章）。
**cwd には依存させない**（キャラクターの好みはプロジェクトごとではないため）。置き場所（サイドバー
「セッション情報」）は変えない。

**保存先ではなく「セッション限りかどうか」で割る理由**（2026-09-17）。2026-09-13 の決定は
利用者の設定とパックの持ち物を寿命で分け、置き場所そのものでその違いを表すつもりだった。実際には
両方が同じ引き出しに入り（色3つ・立ち絵4つ・差し色4つ・比率・作る口で 13 個の操作子）、
置き場所は違いを表さなくなっていた。ユーザーは「キャラクター作成とテーマカラーはセット」
「オプションみたいなイメージ」と見ていて、**使う人にとっては「キャラクターを整える手順」が1つの
まとまり**で、値がどこに保存されるかは手順の区切りにならない。だから保存先ではなく、
**読んでいる最中に触るか（セッション限り）／腰を据えて整えるか（それ以外）**で割る。保存先の違いは
画面の中の並びで表す: パックの持ち物（立ち絵・差し色）が上、利用者の設定（画面の色）が下。
添え書き（「この端末だけ」のような）は出さない。

**キャラクター画面は会話の画面と入れ替わる**（重ねない。2026-09-17 決定。ユーザー「SPA のような
ものを想定していたよ」）:

- **切り替えは `location.hash`**（`#character` / `#character/new`。無ければ会話の画面）。
  `stores/screen.tsx` の `useScreen()` が `hashchange` を読む（`useSyncExternalStore`）。
  リロードしても同じ画面に戻り、ブラウザの「戻る」が効き、`bun run dev` の再読み込み
  （`lib/refresh.ts`）でもキャラクター画面に留まれる。サーバの経路は増えない（`?token` はそのまま）。
  **ルーターのライブラリは入れない**（画面は3つで、分岐は hook 1つで足りる）。
  採らなかった案: state 1つで入れ替える（リロードと dev の再読み込みのたびに会話へ戻る）、
  `history.pushState` の別パス（サーバに経路を足し、`?token` を引き継ぐ手間が要る）
- **会話の画面は外さず `hidden` で隠す**（6.1「部品を外すのではなく隠す」と同じ）。
  `<SessionProvider>` はその上に居るので会話は進み続け、入力欄の下書き・選んでいるターン・
  スクロール位置も残る。戻ったときにセリフとレポートが追いついているかは目視で確かめる
  （吹き出しの追従は領域の高さに依存するため）
- **答え待ちが来たら戻る口に印を出す**（`state.pending` が空でないとき「答え待ち」を
  `state-warn` で。色だけにしない）。タブのタイトルの印は隠れていても効いている
- **入る口はサイドバーのキャラクターの行**（`<select>` の右に字だけのリンク「整える」。色は `ink`、
  下線で区別。13.1 原則1）。キャラクターのことはキャラクターの行に集まる。採らなかった案:
  ページ最上部のナビ（読む面の上に常設の帯を1本足し、滅多に使わないリンクのために縦の幅を毎回払う。
  **画面が3枚以上になったら検討し直す**）、右下に比率リセットと並べる（常設の要素が1つ超える）、
  立ち絵をクリック（口があることが見えない）
- **戻る口は画面の左上**「← 会話へ戻る」。作る画面は「← キャラクターへ戻る」
- **右下は「領域の比率を既定に戻す」だけに戻る**（引き出しを作る前の形）。常設の要素は引き出しの
  前と同じ数で、サイドバーのリンクが1つ増える
- **読んでいる間に見えている必要がないものは会話の画面に置かない。** 主な仕事は長く読み続ける
  ことなので（13章のブリーフ）、整える口は別の画面に出す

**キャラクター画面の中身**（2026-09-17 決定。`frontend-design` で案を2つ出し、ユーザーが
「立ち絵の並びが主役」を選んだ）。**立ち絵そのものが差し替えの口になる。** 色は 13.2 の4つから
増やさず、書体も 13.3 のまま。大胆さは立ち絵の並びの1箇所に使い、残りは静かな行に保つ:

```
← 会話へ戻る                                            答え待ち ●

つくもの精霊  tsukumo-spirit                            新しく作る

   ◯            ◯            ◯            ◯         ← 表情の順（EXPRESSIONS）。ground の上に直接
  にっと         ふむ          えへん        あわわ        無い表情は点線の枠の空き
 [差し替える]   [差し替える]   [差し替える]  [選ぶ]
                [消す]         [消す]

差し色    ■ 既定  ■ 軽装（haiku）  ■ 通常装備（sonnet）  ■ 戦闘配置（opus）
画面の色  ■ 画面の地  ■ 領域の地  ■ 字の色
```

- **並びは上から** 戻る口 → パックのラベルと名前（名前は等幅。13.1 原則3）と「新しく作る」 →
  立ち絵の並び → 差し色 → 画面の色。パックの持ち物が上、利用者の設定が下（上の「並びで表す」）
- **立ち絵の並びは `EXPRESSIONS` の順に横に並べ、入りきらなければ折り返す**
  （`grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr))`）。760px 以下でも同じ規則で
  1〜2列になるだけで、狭い画面用の別の規則は書かない
- 1枚のカードは 立ち絵（`<Portrait>`。衣装は `default`、動きは無し） → 表情のラベル
  （パックの `expressions` から。原則4） → 「差し替える」 → 「消す」（`default` には出さない）。
  **立ち絵は枠も地も持たない**（13.1 原則2 をこの画面でも守る）。無い表情は点線の枠の空きに
  ラベルと「選ぶ」だけ
- **`<Portrait>` は `components/portrait.tsx` へ上げる**（2つ目の読み手が出た。2章）。中身は
  変えず、キャラビューの動きの hooks はキャラビューに残る。並びでの大きさは
  `character-screen.module.css` が決め、`<Portrait>` に `className` で渡す（キャラビュー側の
  割合指定は `.character-region` の変数が無いので効かない。6.6）
- 変えられないパック（`editable: false`）は、並びの上に一言を出して口を無効にする（7.1）
- 差し色は衣装4つを1行に（色見本＋ラベル）、画面の色は3つを1行に。どちらも
  `<input type="color">` のまま
- 採らなかった案: いまの引き出しの「ラベル＋入力の行」を1列に積む（立ち絵が見えないまま
  差し替えることになる）

**作る画面は別**（`#character/new`。2026-09-17 決定。ユーザーの選択）。キャラクター画面の
パック名の行の「新しく作る」から入る:

```
← キャラクターへ戻る

新しいキャラクター
 名前 [__________]
 にっとの立ち絵 [選ぶ]
 差し色 ■
 [作る]

 作った。 [このキャラクターに切り替える]
```

- 中身は 7.1 の「作る口は最低限」のまま（名前・`default` の立ち絵・差し色1色）
- **作れたら「このキャラクターに切り替える」が出る。** 押すと `switch-character` を送り、
  `#character` へ戻る。切り替えは起こし直しなのでターン進行中は押せない（サイドバーの
  `<select>` と同じ理由・同じ文言）。作った直後に自動で切り替えないのは 7.1 のまま
- 表情や衣装を足すのは、切り替えたあとのキャラクター画面（作る口には持ち込まない）
- 採らなかった案: キャラクター画面の末尾に作る区画を置く（「いまのパック」の立ち絵・差し色と
  「別のパック」の立ち絵・差し色が1枚に並び、どちらの色を触っているか見間違えやすい。hash で
  切り替える以上、画面を1枚足す値段はほぼ無い）、上にパックの一覧 → 選んで編集の2段
  （切り替えの口がサイドバーと2箇所になる）

- 色は**境界で検証してから** CSS 変数に流す（13.5）。読めない組み合わせが来たら受け取らずに既定へ落とす
- サイドバーは**3区画のまま**（`docs/requirements.md` 4.2 の決定を変えない）
