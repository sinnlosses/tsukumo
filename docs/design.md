# 設計書（描く層をブラウザ側へ移す）

最終更新: 2026-09-13（起こした日。**移行の決定は同日**。経緯と採らなかった案は
`docs/research/architecture-rethink.md`）
ステータス: **正典**。構造は `shared` / `server`（`core` と `adapter`）/ `browser` の3層 +
`src/` 直下の配線（`docs/architecture.md`「現在の実装状況」）。**残っているのは
キャラクターパック（7章）の段だけ**で、`develop/tasks.json` 側の別タスクとして進める。
移行の段階そのものの記録は `docs/history/decision.md`「design.md 12. 移行の段階」にあり、
**章番号は詰めていない**ので、この設計書に12章は無い（11章の次が13章）。

## このドキュメントの読み方

### このファイルは通読しない

節を1つ特定して、その節だけを次の形で読む:

```bash
sed -n '/^## 4\. shared/,/^## /p' docs/design.md
```

**このファイルには「いまどうなっているか」だけを書く**（2026-09-21 決定）。却下した案の理由・
値の根拠の実測・覆した決定の記録は `docs/history/` に置き、ここからは1行で参照する。何を残して
何を移すかの表は `docs/requirements.md`「正典に残すもの・`docs/history/` へ移すもの」。

### 節の索引

**索引の行は本文の `## <番号>.` の章と1対1**（`###` の節は載せない。章を足したり消したりしたら、
ここも同じ数だけ動かす）。

| 節                             | 中身                                                                                             |
| ------------------------------ | ------------------------------------------------------------------------------------------------ |
| ## 1. 何を変え、何を残すか     | 決定の要約。**最初にここ**                                                                       |
| ## 2. 全体構成                 | 層（shared / server / browser）の図、依存の向き、ディレクトリ                                    |
| ## 3. 動きの流れ               | 起動・接続・依頼・答え待ち・再接続の順序                                                         |
| ## 4. shared                   | **両側が共有する契約**。イベント・状態・reducer・コマンド・フレーム・版                          |
| ## 5. core と adapter          | サーバ側のモジュールと責務。判断（core）と外の世界に触る境界（adapter）                          |
| ## 6. browser                  | ブラウザ側の部品の木、状態の持ち方、Markdown、重いライブラリ、立ち絵の動き                       |
| ## 7. キャラクターパック       | `character.json` + `persona.md` + 素材。人格の注入と切り替え、書き戻し、雑談の要約とアーカイブ   |
| ## 8. セッションの復元と複数化 | 復元（4.8）を新しい形に載せる。複数セッションへ広げる余地                                        |
| ## 9. 会話内容と安全           | `127.0.0.1`・Origin・起動トークン・ディスクに書く2つの例外と直近を読み戻す口・ブラウザ側のメモリ |
| ## 10. テスト                  | reducer・スキーマ・部品・fake driver + Playwright・層の検査                                      |
| ## 11. ビルドと依存            | `bun build` の入口、tsconfig、**足す依存の一覧（承認済み）**                                     |
| ## 13. 画面のデザイン          | 色・書体・レイアウトの計画とトークン。**誰が差せるか**。雑談モードの画面                         |

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
| ホストのポート（`showView` 1つ）と Orca のアダプタ                           | HTML の文字列一致のテスト → 部品のテストと fake driver               |

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
│ browser（ブラウザ。React）                                  │
│   <App> ─ <Layout> ─ Main / Character / Sidebar / Dispatch  │
│   状態 = shared の SessionState（reducer は core と同じ物）   │
└──────────────▲───────────────────────────┬─────────────────┘
               │ ServerFrame                │ ClientCommand
               │  hello（snapshot）/ events  │  prompt / answer / …
               │        WebSocket 1本（127.0.0.1、起動トークン付き）
┌──────────────┴───────────────────────────▼─────────────────┐
│ server/core（サーバ側の純粋な判断。外の世界に触らない）       │
│   session-manager ／ session-driver（駆動の契約）／ config    │
│   sdk-message ／ session-restore ／ pending-answer ／ host    │
└──────────────▲───────────────────────────┬─────────────────┘
               │ 呼ばれる                   │ core を import する
┌──────────────┴───────────────────────────▼─────────────────┐
│ server/adapter（外の世界に触る場所。1ファイル = 1つの境界）   │
│   sdk-driver（SDK）／ fake-driver（疑似セッション）           │
│   server（http: ページ・束ねた JS/CSS・vendor・立ち絵 / ws）  │
│   character-pack ／ task-summary ／ bundle ／ orca-host       │
└──────────────▲───────────────────────────┬─────────────────┘
               │ SDKMessage                 │ query / interrupt / canUseTool
┌──────────────┴───────────────────────────▼─────────────────┐
│ Claude Code（SDK が起こす子プロセス）                         │
└────────────────────────────────────────────────────────────┘
      shared（語彙・イベント・状態・reducer・zod スキーマ。browser と core の両方が import する）
      辺は adapter ──▶ core ──▶ shared ◀── browser（**core → adapter は禁止**。結ぶのは src/ 直下だけ）
```

### 層と依存の向き

**この形は「共有コントラクト＋クライアント/サーバ分割」で、旧の4層（クリーンアーキテクチャの
写し）とは別物**。`shared` は TypeScript のモノレポでいう `packages/shared` / `contracts`
の位置（サーバとブラウザの両方が import する契約）、`browser` はクライアント、`core` と `adapter` は
サーバで、「受け取る／決める／描く」という役割の分割ではなく「どちらの実行環境で動くか」で
分けている。**サーバ側だけをもう一段、「純粋な判断（`server/core/`）」と「外の世界に触る境界
（`server/adapter/`）」に割ってある**（この形に至った比較は
`docs/research/architecture-proposal.md` / `docs/research/architecture-placement.md`）。

| 層               | 置くもの                                                                                   | import してよい先                 | 実行場所         |
| ---------------- | ------------------------------------------------------------------------------------------ | --------------------------------- | ---------------- |
| `shared`         | 概念の語彙・`SessionEvent`・`SessionState`・`applySessionEvent`・コマンドとフレームの zod  | `shared` のみ（`zod` は可）       | サーバとブラウザ |
| `server/core`    | サーバ側の純粋な判断。セッション管理・駆動の契約・イベントの検証・ポートの決定・設定の解釈 | `shared` / `core`                 | サーバ（Bun）    |
| `server/adapter` | 外の世界に触る場所。SDK・WebSocket・HTTP・ホスト・ファイル・子プロセス・fake driver        | `shared` / `core` / `adapter`     | サーバ（Bun）    |
| `browser`        | React の部品・hooks・CSS・Markdown の変換                                                  | `shared`（React などの npm は可） | ブラウザ         |
| `src/` 直下      | 配線（composition root。`cli.ts` / `main.ts` と起動の段取り）                              | すべて                            | サーバ           |

- **`core` と `browser` は互いを import しない。** 両者が知っているのは `shared` だけ
- **`core → adapter` は禁止。** 辺は `adapter ──▶ core ──▶ shared ◀── browser` の一方通行で、
  `core` と `adapter` を結ぶのは `src/` 直下の配線だけ。**`core` は `node:` / SDK（`@anthropic-ai/*`）/
  `ws` を import しない**ので、`core` から外の世界へ出る道は無い
- **`adapter` は1ファイル = 1つの境界。** インターフェースは切らない（実装が2つあるもの —
  駆動とホスト — だけ、契約の型を `core` に置く: `server/core/session-driver.ts` /
  `server/core/host.ts`）
- **`shared` は `node:` も `document` も触らない。** これは設計上の好みではなく**物理的な制約**
  である。`shared` はサーバ（Bun/Node）とブラウザの両方の実行環境で読み込まれるので、
  片方にしか無い API（`node:fs` や `document` など）に触れた時点でもう片方で動かなくなる。
  純粋関数と型と zod スキーマだけが両方で動く共通部分
- 許した辺以外は `test/architecture.test.ts` が落とす（辺は上の4本）

### ディレクトリ

```
src/
  cli.ts                      入口。引数の受け取り・環境変数の読み出し・終了コードの返し方だけ
  main.ts                     起動の段取り。即時終了する前提不足（ポート・組み立て・疑似セッション）もここ
  current-character.ts        いま出しているパックと選択肢の持ち主（切り替えと画面からの編集で入れ替わる）
  view-delivery.ts            ビューの配信。組み立てたブラウザ側と開いているタブを持ち、/ws と見張りを束ねる
  session-start.ts            セッションを1つ起こす（どの駆動で起こすか・続きをどう探すか）
  shared/
    session-event.ts          SessionEvent（zod と z.infer）
    session-state.ts          SessionState と applySessionEvent（いまの session-view.ts）
    main-view.ts              メインビューに出す形（MainViewEntry）と、ターンごとのまとめ
    command-suggestion.ts     入力欄の / 補完に出す候補（姿から導くだけ）
    command.ts                ClientCommand（zod）
    frame.ts                  ServerFrame（zod）・PROTOCOL_VERSION
    expression.ts / question.ts / pending-ask.ts / task-summary.ts / character.ts
                              語彙（いまの domain のうち、両側が使うもの）
    character-definition.ts   character.json そのものの形。解析と、1件を重ねた書き戻しの文字列
    character-asset.ts        /character/<file> の URL・取り直しの印・拡張子による仕分け
    expression-choice.ts      speak が選べる表情とラベル（ラベルの出どころは定義ファイル）
    repository-file.ts        ファイル一覧の経路名と読み取り（入力欄の @ 補完。両側が見る）
  server/                     サーバ（Bun）側。判断（core/）と境界（adapter/）の2段
    core/                     サーバ側の純粋な判断。node: / SDK / ws を import しない
      session-driver.ts       駆動の契約（SessionDriver / SessionDriverOptions と既定値）だけ
      session-manager.ts      sessionId → { driver, state, subscribers }。reducer をサーバ側でも回す
      session-launch.ts       起こす一続きの順序（外に触る部分は session-start.ts が渡す。起動も切り替えも同じ）
      character-selection.ts  どのパックを出すかの順位（一覧を作るのは adapter/character-pack.ts）
      pending-answer.ts       答え待ちの列（SDK の型は持たない。結び付けるのは adapter 側）
      sdk-message.ts          SDK のメッセージを検証して SessionEvent にする（SDK を import しない）
      session-restore.ts      続きから始めるセッションを選ぶ・transcript を履歴イベントにする
      port-resolution.ts      どのポートで試すかの決定（listen そのものは adapter/server.ts）
      config.ts               環境変数の解釈（読み取りは cli.ts。ここは渡された env を見るだけ）
      report-notation.ts / speech-cadence.ts   systemPrompt に足す規約の文面
      host.ts                 ホストのポート（showView）。実装は adapter/orca-host.ts
    adapter/                  外の世界に触る場所。1ファイル = 1つの境界
      sdk-driver.ts           SDK を import する唯一の場所。SessionDriver の本物の実装
      fake-driver.ts          疑似セッションどおりに SessionEvent を流す SessionDriver（疑似セッションは fs から読む）
      server.ts               http（ページ・/assets・/vendor・/character・/repository-file）
      session-socket.ts       ws（フレームとコマンド）。listen 済みのサーバに upgrade を足す
      character-pack.ts       パックの列挙・読み込み（character.json / persona.md / 素材）
      character-edit.ts       画面から変えた立ち絵・差し色を ~/.tsukumo/characters/ へ書く
      persona-memory.ts       雑談で覚えた1行を ~/.tsukumo/characters/<pack>/persona.md の末尾の節へ書く
      chat-summary.ts         雑談の要約の写しと印（~/.tsukumo/chat-summary/<pack>.md）
      chat-archive.ts         雑談の会話のアーカイブ（~/.tsukumo/chat-archive/<pack>/<日付>.jsonl）
      remembered-character.ts 覚えたキャラクター名（~/.tsukumo/state.json）
      task-summary.ts         develop/tasks.json の読み直し（変化を tasks-changed イベントにする）
      repository-file.ts      git 管理下のファイルの列挙（`git ls-files` を起こす唯一の場所）
      bundle.ts / ui-rebuild.ts bun build（browser の入口と CSS）と src/browser/ の見張り
      bundled-path.ts         同梱物の位置（import.meta.url）。tsukumo-home.ts は ~/.tsukumo/
      orca-host.ts            `orca` コマンドを起こす唯一の場所
  browser/
    main.tsx                  入口。部品の木を組み立てて mount する（副作用はここだけ）
    css-variable.d.ts         browser 全体に効く型拡張（import されない ambient 宣言）
    css-module.d.ts           `*.module.css` を import したときの型（同上）
    features/                 機能。**機能どうしは import しない**
      layout/                 Layout・領域の枠・リサイザ・比率の保存
      main-view/              TurnTabs・Turn・Report・QuestionRecord と markdown/（unified 一式）
      character-view/         Portrait・BalloonTrack・Balloon・動きの hooks
      sidebar/                Activity・SessionInfo・TaskSection（まん中の区画ひとまとまり）と、
                              3区画の枠（SidebarSection）
      dispatch/               Composer・CommandSuggestions・FileSuggestions・PendingAnswer・TurnStatus
      chat-view/              雑談モードでメインの領域に差し替わるビュー（13.7）
      token-usage/            トークン消費の画面（グラフと集計）
      character-screen/       キャラクター画面と作る画面（13.6）。立ち絵・差し色の差し替え、使う人が変える色
      task-board/             タスク一覧。TaskList（区画の中身）・TaskBoard（表のモーダルの入口）・
                              PresentationalTaskBoard（器）。**領域を持たず、サイドバーに
                              置いてもらう機能**（下の「領域の機能と、置かれる機能」）
        hooks/                その機能だけが読むフック（`use-task-board.ts`）
        components/           その機能だけが使う部品（TaskTable・TaskRow・TaskItem ほか）
        domain/               その機能の語彙の純関数（`task-status.ts`・`task-list-title.ts`）
                              （機能の見た目は、それぞれの中の `<機能>.module.css`。6.6）
    components/               機能の語彙を持たない React の部品（Select・Portrait と portrait.module.css）
    hooks/                    機能の語彙を持たない React のフック（`use-modal-dialog.ts`）
    lib/                      名指しできる技術を知っている道具（WebSocket・`FileReader`・React の hook）
    stores/                   画面全体で共有する状態（セッション・選んでいるターン・出している画面）
    styles/                   グローバルな CSS はこの1枚だけ（theme.css。トークン・body・リンク）
test/                         src/<相対パス>.ts → test/<相対パス>.test.ts（いまのまま）
characters/<name>/            character.json・persona.md・素材
```

**ファイル名は概念**（原則5）。`helpers/` と `common/` は作らない（`lib/` と `utils/` を
置く基準は下の「`lib/` と `utils/` に置く基準」）。**単数形の規約は
`src/browser/` の置き場所のディレクトリ（`features/` `components/` `hooks/` `lib/` `stores/`
`styles/` と、機能の中の `hooks/` `components/` `domain/`）だけ外れる**（bullet-proof-react の名前をそのまま採る。`shared` / `server` / `core` /
`adapter` と、
機能の中のファイル名は単数形のまま。`main-view/` のように機能の名前は用語集の語に合わせる）。

**`src/browser/` の箱と、置く基準**（bullet-proof-react の語をそのまま使う。判断に迷ったら
「その機能しか読まないなら機能の中」が既定）:

| 箱            | 置くもの                                                            | import してよい先                                              |
| ------------- | ------------------------------------------------------------------- | -------------------------------------------------------------- |
| `main.tsx`    | 入口。Provider と `<Layout>` に機能を差し込む（composition root）   | すべて                                                         |
| `features/`   | 1つの機能に閉じた部品・状態・保存                                   | `components` / `hooks` / `lib` / `utils` / `stores` / `shared` |
| `components/` | **機能の語彙を持たない** React の部品（値と呼び先を全部受け取る）   | `hooks` / `lib` / `utils` / `shared`                           |
| `hooks/`      | **機能の語彙を持たない** React のフック（`use-modal-dialog.ts`）    | `lib` / `utils` / `shared`                                     |
| `lib/`        | **名指しできる技術**を知っている道具（React の部品ではないもの）    | `utils` / `shared`                                             |
| `utils/`      | **どの技術も知らない**小物（下の「`lib/` と `utils/` に置く基準」） | —（何も import しない）                                        |
| `stores/`     | **画面全体で共有する状態**の store・Context と、それを読む hook     | `lib` / `utils` / `shared`                                     |
| `styles/`     | **グローバルな CSS だけ**（`theme.css`。機能の見た目は機能の中）    | —                                                              |

- **`stores/` は「状態ライブラリの置き場」ではなく「画面全体で共有する状態の置き場」**
  （zustand を入れない決定は 6.2 のまま）。実体は4つあり、
  `stores/session.tsx` は `SessionState` を畳んで全機能に配り（`useSyncExternalStore` + セレクタ。
  Context で配るのは store そのもの）、`stores/main-view-turn.ts` はそこから**ターンの畳み**を
  姿ごとに1回だけ導き、`stores/turn-selection.tsx` は
  メインビューとキャラビューに同じターンの選択を配り、`stores/screen.tsx` は `location.hash` から
  **出している画面**を読む（書く口 `navigateTo` も同じ
  ファイル。13.6）。**どれも複数の機能が読む**ので機能の中に置けず、`main.tsx` に残すと機能が
  入口を import することになる（だから箱が要る）
- **接続（`lib/socket.ts`）と再読み込み（`lib/refresh.ts`）は状態ではなく道具**なので `lib/`。
  入口の `main.tsx` は直下のまま（`app/` を作らない理由は下の表）
- **機能どうしは import しない**（唯一の例外が「領域 → 置かれる機能」の1方向。次の節）。
  機能をまたいで要るものは、**部品なら `components/`、
  部品でないなら `lib/`、状態なら `stores/` へ上げる**。上げる引き金は「2つ目の読み手が出たとき」で、
  1つの機能しか読まないものは機能の中に残す（`features/layout/split.ts`・
  `features/character-screen/appearance-color.ts` がその例）
- **機能は `main.tsx` と `stores/` の中身を「組み立てる側」として import しない。** 機能が触れるのは
  `stores/` が公開する hook（`useSessionSelector` / `useSessionDispatch` / `useMainViewTurns` /
  `useTurnSelection`）まで
- **親が子を組む形も機能どうしの import に数える。** `<Layout>` は領域の中身を props で
  受け取るだけで他の機能を知らず、**どの画面を出すかは `main.tsx` の中の `<Root>` が選ぶ**
  （6.1・13.6）
- 検査は `test/architecture.test.ts`（`BROWSER_REGIONS` と `BROWSER_PLACED_FEATURES` が
  機能どうしの横の辺を、`BROWSER_BOXES` が箱をまたぐ縦の辺を落とす）

**採らなかった bullet-proof-react の要素**（`app/` `api/` `types/` `config/`
`assets/` `testing/`・barrel file・`@/` の絶対 import・ESLint の
`import/no-restricted-paths`）は、**実体が無い箱を先に作らない**ため。要るようになったら足す
（1つずつの理由は `docs/history/decision.md`「design.md 2. 全体構成 / ディレクトリ（採らなかった
bullet-proof-react の要素）」）。**`utils/` は 2026-09-21 に、`hooks/` は 2026-09-22 に
採ることにした**（`browser/hooks/` の箱と、機能の中の `features/<機能>/hooks/` の両方。
下の2つの節）。

### 領域の機能と、置かれる機能

`features/` の中には2種類ある（2026-09-22 決定）。**機能どうしの辺は「領域 → 置かれる機能」の
1方向だけ**を許し、それ以外は落とす。

| 種類                       | どういうものか                                                                      | 辺                                                                 | いまの中身                                                                                                            |
| -------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| **領域の機能**（region）   | 画面の領域を持つか、領域に差し替わる画面を持つ。**置き場所を決めるのは `main.tsx`** | 機能からは import されない。互いにも import しない                 | `layout` / `main-view` / `character-view` / `chat-view` / `character-screen` / `token-usage` / `sidebar` / `dispatch` |
| **置かれる機能**（placed） | 自分の置き場所を持たず、領域の中に置いてもらう                                      | 領域から import してよい。**自分はどの機能も import しない（葉）** | `task-board`                                                                                                          |

- **「置かれる機能」にするのは、中身が領域の持ち物でなくなったとき。** `task-board` は
  サイドバーの区画に置く一覧（`task-list.tsx`）と、サイドバーの領域には収まらない画面いっぱいの
  `<dialog>`（`task-board.tsx`）の対で、どちらもサイドバーの語彙ではなく**タスクの語彙**で
  書かれている。CSS も同じ語彙を共有する1枚（`task-board.module.css`）にまとまる
- **区画ひとまとまりは領域の側に置く。** 「そこに何を置くか」は領域が知るべきことなので、
  枠・見出しの文言・押せる口・購読・state を1ファイルにまとめて領域の中に置き
  （`features/sidebar/task-section.tsx`）、**置かれる機能からは「何を描くか」だけを import する**
  （`TaskList` と `TaskBoard`）。辺の向きが「領域 → 置かれる機能」なので、`main.tsx` で
  組み合わせる必要はない（`<Sidebar />` のまま）
- **購読と state は、置いた側の区画が持つ**（`task-section.tsx` の `tasks` と `boardOpen`）。
  `main.tsx` の `<Root>` へ上げると購読が木の頂点に移り、タスクが変わるたびに全領域が描き直される。
  区画の中に置けば、描き直しはその区画で止まる
- **置かれる機能の側は、置き場所を知らないまま書く。** `task-board/` は「サイドバー」も
  「区画」も名乗らず、タスクの語彙だけで書く（別の領域から同じものを置けるのはこのため）
- **`components/` とは別物。** `components/` は**機能の語彙を持たない**部品（値と呼び先を全部
  受け取る）で、「置かれる機能」は機能の語彙を名乗ったまま置き場所だけを借りる
- 検査は `test/architecture.test.ts` の `BROWSER_REGIONS` / `BROWSER_PLACED_FEATURES`。
  **どちらにも無いディレクトリが `features/` の直下にあれば落ちる**（`chat-view` と
  `token-usage` は 2026-09-22 まで `BROWSER_REGIONS` に無く、機能どうしの import が
  黙って検査されていなかった。両方を領域として載せ、載せ忘れは `throw` にした）

### 機能の中を分ける（container / presenter と `hooks/`）

部品が「ロジック」と「見た目」の両方を抱えたら、**3つに割る**（2026-09-22 決定。それまでは
`hooks/` を「採らない」と書いていた）。後続の分割（`chat-view` / `composer` / キャラクター画面の
フォームなど）もこの形に揃える。

| ファイル                    | 持つもの                                                              | 持たないもの                       |
| --------------------------- | --------------------------------------------------------------------- | ---------------------------------- |
| `<機能>.tsx`（container）   | フックを呼び、受け取った値と呼び先を presenter へ渡すだけ             | JSX の中身・算出・条件分岐         |
| `hooks/use-<機能>.ts`       | state・副作用・イベントの読み替え。**画面に出す形の値と呼び先を返す** | JSX                                |
| `presentational-<機能>.tsx` | 器だけ。受け取ったものを `components/` に渡す                         | **フックを1つも持たない**・算出    |
| `components/*.tsx`          | 部品ひとつずつ。class を付けて値を置く                                | 算出・判定（**畳んだ値で受ける**） |
| `domain/*.ts`               | **フックに入れられない**機能固有の語彙（対応表・文言）                | JSX・フック・React                 |

`task-board` がその1件目（2026-09-22 決定）:

```
features/task-board/
  task-board.tsx                  container。useTaskBoard を呼んで PresentationalTaskBoard へ渡す
  task-list.tsx                   区画の中身（フック0なので割らない）
  presentational-task-board.tsx   <dialog> の器（フック無し）
  hooks/use-task-board.ts         <dialog> の ref・backdrop のクリックと、行への畳み方（BoardRow）
  components/task-table.tsx       表（memo）
  components/task-row.tsx         1行
  components/readiness-cell.tsx   着手の列
  components/task-id-list.tsx     IDの並び
  components/task-item.tsx        区画の一覧1件
  components/task-status-badge.tsx  status のバッジ
  domain/task-status.ts           status → 色の class（表の行とバッジの両方が読む）
  domain/task-list-title.ts       区画の見出しの文言（サイドバーが読む）
```

- **部品に算出を残さない。** 「値が無いときどうするか」「どれを出すか」はフックが
  `BoardRow` へ畳んでから渡す。部品に残ってよいのは **class を選ぶ分岐だけ**
  （`domain/task-status.ts` の呼び出しのように、CSS の名前が絡むもの）
- **純関数でも、まず `hooks/use-<機能>.ts` に入らないかを見る**（2026-09-22 ユーザーの選択）。
  呼ぶのがそのフック1つなら、機能直下に `*.ts` を増やさずフックの下に関数として置く
  （`use-task-board.ts` の `boardRows`）。**`components/` は型だけを `import type` で引く**
- **`domain/` を切るのは、フックに入れないほうが良いもののうち、その機能固有の語彙で
  名乗れるものだけ。** 「純関数だから `domain/`」ではない。入れないほうが良いのは、**フックを
  呼ばない相手が読む**とき——`domain/task-status.ts` は表の行とバッジ（どちらもフックを呼ばない
  部品）が読み、`domain/task-list-title.ts` はサイドバーの区画が読む。フックに置くと、
  フックを使わない側が `use-*.ts` を import することになる
- **`components/` は機能の中の部品**で、`browser/components/`（機能の語彙を持たない部品）とは
  別物。**読み手が2つの機能にまたがったら `browser/components/` へ上げる**

- **`presentational-` の接頭辞は、この形のときだけ付けてよい**（`CLAUDE.md` 原則5 の
  「置き場所を名前にしたファイルは作らない」の例外）。**container と1対1で対になっている**
  ことがファイル名で分かるほうが、`task-table.tsx` のような概念の名前より追いやすいため。
  逆に、対になっていない部品に `presentational-` を付けない
- **フックの名前は機能名（`use-<機能>.ts`）でよい。** container が呼ぶ1本なので、対応する
  container を探せることのほうが大事。**1ファイル1フック**
- **機能の中の `hooks/` に置くのは、その機能だけが読むフック。** 読み手が2つになったら
  **`browser/hooks/` へ上げる**（機能の語彙を持たないものだけが上がる。`use-modal-dialog.ts` は
  `<dialog>` の開閉を DOM へ写すだけでタスクを知らないので、最初から `browser/hooks/`）
- **フックでない純関数は `hooks/` に置かない。** 機能の直下に概念の名前で置く
  （`features/layout/split.ts`・`features/character-screen/appearance-color.ts` がその形）
- **描き直しを止める `memo` は presenter 側に残す**（`PresentationalTaskBoard` の `TaskTable`）。
  container はフックのぶん毎回描き直されるので、そこに `memo` を置いても効かない

**割らないでよいのは、フックが0本のとき**（`task-list.tsx` は `taskListTitle` と
`taskStatusCounts` の純関数だけなので、1ファイルのまま）。

### `lib/` と `utils/` に置く基準

**どの層の中にも `lib/` と `utils/` を作ってよい**（2026-09-21 決定。それまでは「作らない」と
明記していた）。層（`shared` / `server/core` / `server/adapter` / `browser`）が表すのは
**どの実行環境の話か**で、`lib/` と `utils/` はその**層の中**で「tsukumo の語彙を名乗らない道具」を
2つに分ける箱。**層をまたぐ import の可否は変わらない**（上の「層と依存の向き」の表がそのまま
効く。`lib/` に入れても `core → adapter` は禁止のまま）。

**判定は、ファイル名が指している概念1つで決める**（原則5「ファイル名が概念になっているか」の
続き）。手順は2つで、手順1で箱に入ると決まったものだけが手順2に進む。

**手順1 — そもそも箱に入れるか**

- ファイル名が指すのが **tsukumo の語彙**（`docs/glossary.md` に載る語。セッション・ターン・
  立ち絵・表情・キャラクターパック・フレーム・覆い…）なら、`lib/` にも `utils/` にも置かない。
  層の直下に平置きする
- `src/browser/features/` の中のものは、**その機能しか読まないなら機能の中に残す**
  （上げる引き金は「2つ目の読み手が出たとき」。`features/layout/split.ts` と
  `features/main-view/markdown/split-blocks.ts` がその例で、名前が形式（Markdown）を指していても
  読み手が1つなので機能の中）

**手順2 — `lib/` か `utils/` か**

| ファイル名が指しているもの                                                                                                             | 箱       | 例                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------- |
| **名指しできる技術・外部システム・ファイル形式**（React・DOM・WebSocket・`node:fs`・`git`・Agent SDK・Claude Code のツール・data URL） | `lib/`   | `browser/lib/socket.ts`（WebSocket）・`browser/lib/data-url.ts`（`FileReader`） |
| **どの技術にも属さない一般的な手法・演算**（説明に固有名詞が1つも要らないもの）                                                        | `utils/` | `retry.ts` / `partition.ts` / `clamp.ts`                                        |

**「複数箇所から呼ばれる」は `lib/` にも `utils/` にも置く理由にならない**（helm-yadokari の原則2と
同じ）。読み手が2つになったら箱へ**上げる**が、上げた先がどちらかは上の表だけで決める。
`browser/lib/debounce.ts` は**手法の名前**だが React の hook（`useEffect` / `useRef`）なので
`lib/` 側、というのが境目の例。

**`utils/` を「どこにも属さない小物」の受け皿にしないための歯止め**（3つとも満たすものだけ置ける）:

1. **import が同じ `utils/` の中だけ**であること。外部パッケージ・`node:` プレフィックス・
   `shared/` の型のどれか1つでも引いたら、その時点で `utils/` ではない
   （技術を引いたなら `lib/`、`shared/` の型を引いたなら層の直下）
2. **ファイル名が動詞か、名前の付いた手法**であること。`string.ts` `object.ts` `format.ts` の
   ような**型・種類の名前**と、`misc.ts` は置けない
3. **別のプロジェクトへ1文字も変えずにコピーして意味が通る**こと

**`helpers/` と `common/` は引き続き作らない。**「助ける」「共通」は上のような判定の問いを1つも
持たず、何を置いてよいかが決まらないため（`lib/` と `utils/` は表の1行で判定できるから許した）。
**ファイル名としての `utils.ts` / `helpers.ts` / `common.ts` も引き続き作らない** — 許したのは
**ディレクトリの名前**だけで、ファイル名は概念のまま（原則5）。

**層ごとの読み方**:

- `server/adapter/` の直下は**1ファイル = 1つの境界**（`orca-host.ts` / `sdk-driver.ts`）。
  `adapter/lib/` はその下の段で、**境界を名乗らず、技術の扱い方だけを知っている道具**
  （「JSONL を1行ずつ読む」「`~` を展開する」）が入る。`adapter` にあるから `lib/` になるのではなく、
  **ファイル名が tsukumo の境界を名乗るかどうか**で分かれる
- `server/core/` は外の世界に触れないので、`core/lib/` に入れてよいのは **`node:` を要求しない
  技術**（zod の扱いなど）だけ。`core` の小物はたいてい `core/utils/` 側になる
- `shared/` の `lib/` は**両方の実行環境で動く技術**だけ（`node:` も `document` も触らない）
- **`src/browser/utils/` を実際に作るときは、`test/architecture.test.ts` の `BROWSER_BOXES` と
  `ALLOWED_BROWSER_BOX_IMPORTS` に上の表と同じ辺を足す**（足さないと `browserBoxOf` が throw する）

**いまのファイルの行き先**（2026-09-21 時点の分類。移動そのものは別タスク）:

- `browser/lib/` の6つは**すべて `lib/` のまま**。`socket.ts`=WebSocket、`refresh.ts`=`<link>` と
  `location`、`data-url.ts`=`FileReader`、`debounce.ts`=React、`prompt-image.ts`=`canvas`、
  `tool-summary.ts`=Claude Code のツール名。いずれも技術を名乗っている
- `shared/image-data-url.ts` は **`shared/lib/` へ**。名前が指すのは data URL という**形式**で、
  tsukumo の語彙を名乗らず、import も持たない（読み手は `portrait-image.ts` /
  `character-background.ts` / `prompt-image.ts` の3つ）
- **どの技術も知らない小物は、`utils/` を作る前に remeda（11章）にあるかを見る**（2026-09-22 決定）。
  8ファイルに書き写していた `isRecord` は、`core/utils/` を作らずに remeda の `isPlainObject` へ
  寄せた。**remeda に無いものだけが `utils/` の1件目になる**
- **`utils/` に入るものは、いまは1つも無い。** `shared/` `server/core/` `server/adapter/` の平置きは
  すべて tsukumo の語彙を名乗っている（手順1）ので動かさない。**実体が無い箱は先に作らない**ので、
  `utils/` は最初の1件が出たときに作る

## 3. 動きの流れ

### 起動

1. `cli.ts` が `config.ts` で環境変数を読み、`main.ts` の `run(config)` を呼ぶ
   （ポート・キャラクター・自動オープン・駆動の種類・新規起動）
2. `main.ts` が**即時終了する前提**を3つ確かめる — ポート番号として読めるか（`port-resolution.ts`）、
   `bundle.ts` が `browser/main.tsx` を `bun build` で束ねられるか（**スクリプトと CSS の1組**を
   メモリに持つ）、fake driver なら疑似セッションを読めるか
3. `current-character.ts` が `character-pack.ts` で一覧を引き、既定のパック（または指定されたもの・
   覚えていたもの）を初期パックに決める。**以降このパックの持ち回りはここに閉じる**
4. `view-delivery.ts` が**起動トークン**を1つ作り、`server.ts` を `127.0.0.1` で listen させる
   （`TSUKUMO_WATCH_UI` のときは `src/browser/` の見張りもここで始める）
5. `session-start.ts` が `session-manager.ts` にセッションを1つ作る。駆動は `TSUKUMO_DRIVER` が
   `fake` なら fake driver、それ以外は SDK。復元（8章）はここで判定する。起こしたセッションは
   `view-delivery.ts` の `connect` で `/ws` に繋ぐ
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

## 4. shared

**zod を使うのは境界の書き込み側と封筒だけ**（2026-09-13 決定）。
`ClientCommand` は**全部 zod が正典**で型は `z.infer`（ブラウザから届く書き込みの経路なので厳密に見る。
`text` の上限もここ）。`ServerFrame` は**封筒（`type` / `protocolVersion`）だけ** zod で、中身
（`state` / `events`）は検証しない。**`SessionEvent` と `SessionState` は zod にしない**（TS の型のまま。
状態にフィールドを1つ足すたびにスキーマを二重に直す手間のほうが効いてくるため）。
境界（WebSocket の両端）で1回だけ検証し、中では検証済みの型を使う。`shared` の中に `node:` も
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
（2026-09-17）。`src/server/adapter/sdk-driver.ts` の `setModel` が `session.setModel()` の確定を
待ってから出す（駆動を経ているので、これは「ブラウザ側のローカル echo」の禁止（3章「依頼」）
には当たらない）。

**`local_command_run` は SDK 0.3.274 で入った**（0.3.268 には無い。2026-09-17 に両方で実測）。
古い SDK では `assistant` に `local_command_source`（英語の文面だけ）と `result` の
`local_command`（コマンド名だけで引数を持たない）しか来ず、**どちらからもモデル名を構造的に
取り出せない**。`package.json` の下限をこれより下げると、この経路は黙って効かなくなる
（`init` を待つ元の1ターン遅れに戻るだけで、テストは通ってしまう）。

**`request` は文面だけでなく、添えた画像の控え（`images: string[]`）も運ぶ**（2026-09-21。
`docs/requirements.md` 4.10）。**原寸は載らない** — 原寸は `prompt` コマンドからモデルへ渡って
終わりで、記録（`SessionState`）に残るのは縮めた控えだけになる。控えを作るのはブラウザ側で、
**サーバは画像を加工しない**。

イベントは**時刻を持って**送る: `StampedEvent = { at: number; event: SessionEvent }`。`at` は
サーバの `Date.now()`。reducer は `applySessionEvent(state, event, at)`（いまの第3引数 `now` と同じ）。
**ブラウザ側で `Date.now()` を reducer に渡さない**（両側の状態が同じになるように、時刻はイベントの
発生側が決める）。

### 4.2 SessionState

`SessionState`（`src/shared/session-state.ts`）が持つのは次のもの。

| 追加                                                               | 出どころ                                   | 理由                                                                |
| ------------------------------------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------- |
| `turnStartedAt` / `turnFinishedAt`                                 | `request` / `turn-finished` の `at`        | `at` がイベントに乗るので、畳み込みの中で持てる                     |
| `tasks`                                                            | `tasks-changed`                            | サイドバー                                                          |
| `character`（`name`・`portraits`・`outfitAccents`・`expressions`） | `character-changed`                        | 立ち絵の取り先。**素材そのものは入れない**（URL だけ）              |
| `connection`                                                       | **ブラウザだけ**が持つ（`browser` の状態） | 接続中／切断中。`SessionState` には入れない（サーバ側に意味が無い） |

`speeches.slice(-1)`（`request` で前のターンの最後の1件だけ残す）・`speechCalledInTurn`・
`MAX_SESSION_VIEW_TURNS` の窓、といった**畳み込みの規則も `shared` の側が持つ**。

**経過時間の表示**は `turnStartedAt` / `turnFinishedAt` から browser が計算する（1秒ごとの刻みは browser の
ローカルな時計。`SessionState` に秒数は入れない）。

### 4.3 ClientCommand

```ts
type ClientCommand =
  | { type: "prompt"; commandId: string; text: string; images: PromptImage[] }
  | { type: "interrupt"; commandId: string }
  | { type: "answer"; commandId: string; id: string; answer: Answer }
  | { type: "set-model"; commandId: string; model: ModelAlias }
  | { type: "set-permission-mode"; commandId: string; mode: PermissionMode }
  | { type: "switch-character"; commandId: string; name: string } // 7章
  | { type: "new-session"; commandId: string } // 8章。まだ足していない
```

- `commandId` はブラウザが作る（`crypto.randomUUID()`）。`error` フレームの突き合わせにだけ使う
- `text` の上限はいまの `MAX_DISPATCH_TEXT_LENGTH`（20,000 文字）を zod の `max` に移す
- `images` は**原寸と控えの対**（`PromptImage = { full: string; thumbnail: string }`。どちらも
  data URL）。上限・形式・枚数は `shared/prompt-image.ts` が持ち、値そのものは
  `docs/requirements.md` 4.10 が正典。**1枚も無いのが普通**なので、field ごと省いた形も受け取って
  空に畳む。`maxPayload`（session-socket.ts）は原寸が上限まで全部通る大きさにしてある（値は同じく 4.10）
- `PermissionMode` と `ModelAlias` の値の一覧は **`shared` に1つだけ置く**（いまは
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
- `protocolVersion` が browser の `PROTOCOL_VERSION` と違えば、browser は「ページを読み込み直してください」を
  出して以降のフレームを無視する（起こし直したプロセスと古いタブの組み合わせで起きる）
- `error` の `reason` は定型文（`"依頼の形式が正しくない"` など）。会話の内容を含めない
- `refresh` は**セッションとは無関係**で、`src/browser/` を見張っている開発中だけ届く（11章）。
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
「`shared` の語彙で書けるか / SDK の語彙を名乗るか」で、`SessionDriver` の契約
（`prompt` / `interrupt` / `answer` / `pending` / `setModel` / `setPermissionMode` / `close`）と
`onEvent`・`SessionDriverOptions`・`DEFAULT_PERMISSION_MODE` / `DEFAULT_MODEL` は `core` 側、
`query()` を回す `startSession` と `buildQuerySeedOptions`・`findSessionToResume` /
`readRestoredEvents`・SDK の型を持つ `DEFAULT_EFFORT` は `adapter` 側。

- `persona: string | undefined` を受け取り、`systemPrompt.append` に tsukumo 側の規約
  （`SPEECH_CADENCE_PROMPT` / `REPORT_NOTATION_PROMPT`）と一緒に足す（7章）
- `resume: string | undefined`（8章）

### fake-driver.ts（adapter）

`SessionDriver` と同じ契約で、**疑似セッション（`StampedEvent[]` の JSON）を時間どおりに流す**。`prompt()` を
受けたら疑似セッションの次の場面を再生し、`canUseTool` 相当の答え待ちも積む（`answer()` で解決）。疑似セッションは
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
  (3) バッチに積む**。50〜100ms ごとに `events` フレームを購読者へ配る（`throttle` で間引く）
- `dispatch(sessionId, command)`: `switch (command.type)` で駆動へ渡す。**ここが唯一の分岐**
- `subscribe(sessionId, send)`: 接続ごとに `hello` を送ってから購読に加える
- **いまは要素1つ。** 鍵（`sessionId`）を持たせておくのは 8章のため

### character-pack.ts（adapter）

7章。`listCharacterPacks(dirs)` と `readCharacterPack(dir)`。読めないものは `undefined`（立ち絵なしの
フォールバック）。

**`remembered-character.ts`** はその隣に置く別モジュールで、直前に出していたパックの名前だけを
`~/.tsukumo/state.json` に読み書きする（`readRememberedCharacter` / `writeRememberedCharacter`。
書き込みの失敗で例外を投げない）。外の世界（ホームのファイル）に触るのはここだけで、覚えた名前が
`listCharacterPacks` の一覧に無いときに既定へ落とす判断は呼び出し側（`current-character.ts`）が持つ。選択そのものは
セッション限りだが、次の起動の初期値としては覚える（13.6「第3の扱い」）。

**`character-edit.ts`** は書き込む側（7.1）。画面から届いた立ち絵・差し色を
`~/.tsukumo/characters/<name>/` に書き、書けたパックを読み直して返す（受け付けなければ `undefined`）。
**ホームの場所を組み立てるのは `tsukumo-home.ts` の1関数だけ**で、`state.json` もパックの置き場も
その下に並ぶ。

### task-summary.ts（adapter）

いまの読み直し係を、**mtime が変わったときだけ `tasks-changed` を起こす**形にする（1〜2秒の
ポーリング。`fs.watch` は macOS でも取りこぼすことがあるので使わない）。

### server.ts と session-socket.ts（adapter）

**HTTP と WebSocket は別の境界**なので、ファイルも2つに分かれている。静的配信と
`/repository-file` は `server.ts`（listen するのもここ）、`/ws` の upgrade とコマンドの受け口は
`session-socket.ts`（listen 済みのサーバに受け口を足すだけ）。**起動トークンは1つ**で、
`server.ts` の `createStartupToken` が作ったものを両方が見る。

| 経路                              | 中身                                                                                                                  | トークン |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------- |
| `GET /`                           | ページ（`<div id="app">` と `<script src="/assets/ui.js">` と `<link href="/assets/style.css">`。**本文は入れない**） | 不要     |
| `GET /assets/ui.js` / `style.css` | 束ねたもの（メモリ。11章の見張りで差し替わる）                                                                        | 不要     |
| `GET /vendor/<name>`              | allowlist の対応表にある外部ライブラリだけ（実ファイルは `node_modules`。`vendor-asset.ts`）                          | 不要     |
| `GET /character/<file>`           | いまのパックの素材。**`character.json` に書かれたファイル名だけ**を配る（パスから組み立てない）                       | 不要     |
| `GET /repository-file?t=<token>`  | git 管理下のファイルのパス（入力欄の `@` 補完。実体は `repository-file.ts` の `git ls-files`）                        | **必要** |
| `GET /ws?t=<token>`               | WebSocket。Origin とトークンを確かめてから upgrade                                                                    | **必要** |

会話の内容が乗るのは `/ws` だけ（`session-socket.ts`）。ページ・同梱物・素材は静的な物なので
トークン無しでよい。
**`/repository-file` は会話を含まないがトークンが要る** — 配るのは利用者の作業ディレクトリの
中身（パスだけ。ファイルは開かない）で、誰にでも配ってよい静的な物ではない。

### config.ts（core）

| 環境変数              | 意味                                                 | 既定             |
| --------------------- | ---------------------------------------------------- | ---------------- |
| `TSUKUMO_VIEW_PORT`   | いまのまま（既定 7327、塞がっていれば +1 で20個）    | 7327             |
| `TSUKUMO_CHARACTER`   | パック定義ディレクトリのパス（相対は cwd 相対）      | `tsukumo-spirit` |
| `TSUKUMO_OPEN_VIEW`   | いまのまま                                           | 開く             |
| `TSUKUMO_DRIVER`      | `sdk` / `fake`                                       | `sdk`            |
| `TSUKUMO_FAKE_SCENE`  | `fake` のとき起こした直後に流す場面の名前            | 流さない         |
| `TSUKUMO_NEW_SESSION` | `1` で復元せず新規に起こす（8章の逃げ道）            | 復元する         |
| `TSUKUMO_WATCH_UI`    | `1` で `src/browser/` を見張って組み立て直す（11章） | 見張らない       |

`TSUKUMO_CHARACTER` は**パスとしてだけ解く**（`src/server/adapter/bundled-path.ts` の
`resolveBundledDir`。相対は cwd 相対、絶対はそのまま）。**パックの名前では指せない** —
`TSUKUMO_CHARACTER=local` は `<cwd>/local` に解かれる。一覧（`listCharacterPacks`）は同梱の
`characters/` ・ `~/.tsukumo/characters/` ・起動先の `characters/local` を常に返すので、
**この口が要るのはその3つの外にパックを置いたときだけ**。`TSUKUMO_CHARACTER_DIR` は
`TSUKUMO_CHARACTER` に統合済みで、いまは無い。

## 6. browser

### 6.1 部品の木

```
<SessionProvider>            lib/socket.ts で接続。SessionState を持つ store を Context で配る（6.2）
└ <TurnSelectionProvider>    選んでいるターンを配る（6.2）
   └ <Root>                  main.tsx の中（export しない）。useScreen() で出す画面を選ぶ（6.2・13.6）。
      │                      **会話の画面は外さず hidden で隠す**（下書き・選んでいるターン・スクロール位置を保つ）
      ├ <Layout>             会話の画面。grid。リサイザ。接続切れの印。答え待ちの印（タブのタイトル・枠色）。
      │  │                   右下に「領域の比率を既定に戻す」を常設（13.6）。**狭い画面では画面の高さに
      │  │                   固定し、上段（メインビュー / サイドバー）をタブで切り替える**（4.7）
      │  ├ <MainView>        <PendingQuestion> + <TurnTabs> + <Turn>（直近5件、`MAX_MAIN_VIEW_TURNS`）
      │  │   └ <PendingQuestion> 答え待ちの質問の**比べる面**。選択肢の `preview`（Markdown）を札に並べる。
      │  │                    `preview` を持つ選択肢が1つも無ければ何も描かない（2026-09-21）
      │  │   └ <Turn>        <RequestHeading>（依頼の見出し + <PromptImageThumbnails>）
      │  │                    + [<Report> | <QuestionRecord>]*
      │  │       └ <Report>  Markdown（6.3）。書きかけはブロック単位で memo
      │  ├ <CharacterView>   <Portrait> + <BalloonTrack>
      │  │   ├ <Portrait>    立ち絵。**components/portrait.tsx**（キャラクター画面の並びも使う）。SVG は
      │  │   │               インラインで差し色、ラスタは <img>。動きの hooks はキャラビュー側に残る（6.5）
      │  │   └ <BalloonTrack> <Balloon>*。最新を一番下、下端の位置を固定（4.2 の決定どおり）。
      │  │                   出るのは `speak` で来たセリフだけ（4.2）
      │  ├ <Sidebar>         <Activity> + {taskSection} + <SessionInfo>
      │  │   └ <TaskSection> **features/task-board/**（置かれる機能。2章）。枠は props で受け取り、
      │  │                   <TaskList>（区画の中身）と <TaskBoard> を描く。差し込むのは main.tsx
      │  │   └ <TaskBoard>   タスク一覧の表。見出しの「一覧を見る」から <dialog> で開く（4.2）
      │  │   └ <SessionInfo> モデル / 許可モード の <select>、キャラクターの <select> と、その右の
      │  │                   「整える」（#character へのリンク。13.6）
      │  └ <Dispatch>        <PendingAnswer> + <Composer> + <TurnStatus>
      │      ├ <PendingAnswer> 許可（許可 / 拒否）・質問（**1問ずつ**。選択肢 + 自由入力。**複数選択はチェックボックス**）。
      │      │                何問目・どの選択肢に目を置いているかは `stores/question-focus.tsx`
      │      │                （触れた選択肢が <PendingQuestion> の札で光る）
      │      ├ <Composer>    <textarea>。Enter 改行 / ⌘Enter 送信。貼り付け / ドロップで画像を添える
      │      │                （**ボタンは置かない**。4.10）。<CommandSuggestions>（`/`）と
      │      │                <FileSuggestions>（`@`。同時には出さない）・<PromptImageChips>（札）を内包
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

**依頼に添えた画像は `components/prompt-image.tsx` の2つが出す**（`docs/requirements.md` 4.10）:
送る前の札（`<PromptImageChips>`。縮めた絵と外す `×`）と、送ったあとの控え
（`<PromptImageThumbnails>`。依頼の見出しの下と、雑談の利用者の吹き出しの中）。**どちらも1枚も
無ければ何も描かない**ので常設の枠にならず、**控えは押せない**（拡大の面を作らない）。
原寸を持つのは `<Composer>` のローカル状態だけで、送った時点で手放す。

**質問が出ている間、`<Composer>` と `<TurnStatus>` は CSS で畳む**（`.dispatch:has(.pending-question)`。
入力欄の領域を質問の箱に全部渡すため。`docs/requirements.md` 4.7）。**部品を外すのではなく隠す**ので、
入力欄の下書きは `<Composer>` のローカル状態に残ったままになる（6.2）。

**選んでいるターンは `<SessionProvider>` の内側の `<TurnSelectionProvider>`
（`browser/stores/turn-selection.tsx`）が配る**（6.2）。`<MainView>` のタブだけでなく **`<CharacterView>` の吹き出しと表情も同じ選択に
従う**（過去のターンを選んでいる間は、そのターンのセリフと**最後のセリフの表情**に戻す。
ターンごとのセリフは `shared/turn-speech.ts` が記録から引く）。**立ち絵の「動き」は遡らない**
（時間相対のアニメーションなので、遡るには `docs/requirements.md` 4.3 の決定の見直しが要る）。

### 6.2 状態の持ち方

| 状態                                                             | 置き場所                                                                                                                                                                       |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SessionState`                                                   | `<SessionProvider>` が持つ**React の外の store**（`applySessionEvent` で `events` を畳み、`hello` で置き換える）。部品は `useSessionSelector` で**自分が読む値だけ**を購読する |
| 接続中 / 切断中、プロトコルの版違い                              | 同じ store の snapshot に相乗りさせる（`browser/stores/session.tsx`。`SessionState` には入れない）                                                                             |
| 選んでいるターン（`turnId`）、追従中か（いちばん下を見ていたか） | `browser/stores/turn-selection.tsx` の Context（メインビューとキャラビューの両方が読む。規則は同じ）                                                                           |
| 入力欄の下書き、候補の開閉と選択位置                             | `<Composer>` のローカル状態                                                                                                                                                    |
| 質問の選択（送る前）                                             | `<PendingAnswer>` のローカル状態                                                                                                                                               |
| 経過時間の秒数                                                   | `<TurnStatus>` の1秒タイマー（`turnStartedAt` から計算）                                                                                                                       |
| 領域の比率                                                       | `<Layout>`。`localStorage` に**比率だけ**保存（会話は保存しない）                                                                                                              |
| 出している画面（会話 / キャラクター / 作る）                     | `location.hash`（`stores/screen.tsx` の `useScreen()` が `hashchange` を読む）。保存しない（URL が持つ。13.6）                                                                 |

zustand などの状態ライブラリは**入れない**。`useSyncExternalStore` + セレクタで足りる
（畳み込みは `shared` の `applySessionEvent` のまま。**姿そのものを Context で配らない** —
読んでいる値が変わっていない部品まで毎フレーム描き直しになるため）。
**答え待ち（`pending`）が動くフレームだけ緊急**にし、レポートやツールの進行は
`startTransition` に載せる。
**`browser/stores/` はその「画面全体で共有する状態」の置き場であって、状態ライブラリの置き場ではない**
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
  `report-notation.ts` は「描けない記法」の迂回を持たない
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
| mermaid（5.3MB）・Chart.js                                         | **束ねず `/vendor/` で配り、その記法が出たときだけ `<script>` で読む**。`MermaidBlock` / `ChartBlock` が `useEffect` で描く | `/vendor/`          |
| Idiomorph                                                          | **消える**                                                                                                                  | —                   |

`/vendor/<name>` が返すのは `node_modules` の実ファイル（`src/server/adapter/vendor-asset.ts`）で、
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
- **`<Portrait>` の4つの動きは領域の外へ出さない。** `.character-region` の中で閉じる。
  **レポートの上に出てよいのはミニ立ち絵だけ**（`docs/requirements.md` 4.3。2026-09-20 に
  「レポートの上に被らせない」をこの1件だけ見直した）。ミニ立ち絵は `features/main-view/` 側の
  別の部品にし、矩形を描く `components/portrait.tsx` を共有する——**`<Portrait>` の中に閉じる
  形は崩れるが、「1枚の矩形しか動かさない」原則は崩れない**（動かすのは位置と大きさだけ）
- `prefers-reduced-motion: reduce` を尊重する（`src/browser/styles/theme.css`）
- 動きは CSS の `@keyframes` と `transform` で足りる。**`<canvas>` もアニメーションの
  ライブラリも要らない**（矩形しか動かさないため）

**既にあるもの**: `portrait-fade-in`（登場。`components/portrait.module.css`）・`balloon-appear`・
`balloon-push-up`（`features/character-view/character-view.module.css`）。登場はここで作り直さない。

### 6.6 CSS

**CSS Modules（`*.module.css`）を機能と同居させる。** 置き場は**機能ごとに1枚**
（`features/<機能>/<機能>.module.css`）と、**自分の見た目を持つ共有部品の隣**
（`components/portrait.module.css`）。**グローバルなのは `styles/theme.css` だけ**で、
トークン（`:root`）・`body`・フォーカスの輪・`prefers-reduced-motion`・リンクを持つ。
**16進の色を書いてよいのもそこだけ**（13.2）。

class 名は用語集の語（`balloon` / `portrait` / `turn-tab` など）を**そのまま**保ち、部品からは
`styles["balloon-track"]` と引く（キャメルケースへ変換しない）。実際に DOM へ付く名前は
`balloon-track_uHH43w` のように**組み立てのたびにハッシュ化される**ので、外から要素を指す口が
要るところは `data-*` を持つ（4領域の `data-region`。`scripts/capture-view.ts` が使う）。

同居に移した理由は `docs/history/decision.md`「design.md 6.6 CSS（機能と同居させる形に
移した理由）」。

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
  character.json     name / portraits（表情 → ファイル名）/ outfitAccents / expressions（名前 → 日本語ラベル）
  persona.md         人格。tsukumo が systemPrompt.append で足す（口調・セリフと詳細の書き分け。セリフの間合いとレポートの記法は core 側）
  *.svg / *.png      素材
```

- **`expressions` のラベルを定義に移す**（いまは `expression.ts` の `expressionLabel` にコードで
  持っている。原則4）。`speak` の enum と説明はここから作る
- `persona.md` は**tsukumo 向けの人格**。グローバルの `~/.claude/output-styles/asuna.md` は
  TUI 向けの正典のまま触らない
- **二重適用を避ける**: tsukumo のセッションではグローバルの出力スタイルも効くので、`persona.md` と
  重なる。`applyFlagSettings({ outputStyle: "default" })`（セッション限り。設定ファイルは
  書き換わらない）で中立に戻してから `persona.md` を足す。**実測と、`settingSources` から
  ユーザー設定を外す案を採らない理由は `docs/requirements.md` 4.4**
- **切り替え**（`switch-character`）は**別のパックでセッションを起こし直す**。`speak` の enum も
  人格も、起こし直せば確実に入れ替わる（`startSession` が `mcpServers` を毎回組み直しているので
  `setMcpServers` は要らない。2026-09-14 実測）。切り替え時に画面から消すのは吹き出し・立ち絵・
  メインビューの3つ
- **キャラクターごとに別のセッションを持つ**（2026-09-14 決定。「キャラクターごとに別の部屋が
  ある」）。セッションの印を **`tsukumo:<パック名>@<目印>`**（雑談は
  **`tsukumo:<パック名>:chat@<目印>`**。13.7。**末尾の目印は起動の並び順**で、ビューのポートから
  決まる。`docs/requirements.md` 4.8「鍵」）にし、**起動時も切り替え時も、これから起こす側の印を
  持つ最新のセッションを探して `resume` する**（無ければ新規）。印の組み立ても読み取りも
  `core/config.ts` の `sessionTag` / `readSessionMark` 1箇所で、
  `session-start.ts` はそれを `findSessionToResume` と `startSession` の `tag` の両方に渡す。
  **戻ってくれば、そのパックの会話も口調も戻る**
  - 画面の履歴は `readRestoredEvents` の再生をそのまま使う（8章）
  - **印はターンが終わって3秒後に付く**（`SESSION_TAG_DELAY_MS`）。ターンを1つも終えずに離れた
    パックのセッションは、次に来たときに見つからず新規から始まる
    （`docs/requirements.md` 4.8「復元できなかったときどうするか」の範囲）
- 素材が1体しか無いときも `<select>` は出す（選択肢1つ。無いように見えるほうが分かりにくい）
- パックの探し先は**同梱の `characters/`・`~/.tsukumo/characters/`・起動先の
  `characters/local/`** の3箇所。同名は後ろが勝つ（7.1）

### 7.1 画面から作るときの置き場と受け取り方

**書き込み先は `~/.tsukumo/characters/<name>/` の1箇所だけ。** `state.json` と同じ
`~/.tsukumo/` の下に置く。

- キャラクターの好みはプロジェクトごとではない（13.6 で `remembered-character` を cwd に
  依存させないと決めたのと同じ理由）
- **リポジトリの作業ツリーが汚れない。** `bun link` でグローバルに入っているので、別プロジェクトから
  作ったパックが同梱側に現れると git の差分になる
- 権利のある素材が公開リポジトリに入る経路がそもそも生まれない（`README.md` と
  `characters/README.md` の約束）

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
`src/shared/command.ts` に `ClientCommand` を1つ足すだけで、`src/server/adapter/server.ts` に新しい
書き込み経路を作らない。起動トークンと `Origin` の照合・zod の検証・定型文の `error` が
そのまま効く。`multipart/form-data` の POST は node:http にパーサーが無く外部依存が要るので採らない。
生バイトの POST は照合と上限をもう一組書くことになるので採らない。

| 何                        | 上限                                                         |
| ------------------------- | ------------------------------------------------------------ |
| 画像1枚（デコード後）     | 2 MiB                                                        |
| 1つのパックが持てる画像   | 表情の数 + 2 枚（いまは 10 枚）                              |
| WebSocket の `maxPayload` | 16 MiB（依頼に添える画像の上限で決まる。4.10「上限」と同じ） |

- `MAX_MESSAGE_BYTES` はいま 16 MiB（依頼に添える画像2枚の base64 ＋ 控え ＋ 文面から置いた値。
  内訳は `docs/requirements.md` 4.10「上限」）。**依頼の文面の上限（zod の 20,000 文字）は
  別に効いている**ので、`maxPayload` を上げても文面の上限は緩まない
- **書いてよいのは `~/.tsukumo/characters/<name>/` の下だけ。** `<name>` とファイル名は受け取った
  文字列からパスを組み立てる前に shared のスキーマで検証する（`[A-Za-z0-9._-]` だけ・`.` で
  始まらない・区切り文字を含まない）。`..` が名前として通らないので、パストラバーサルの経路が
  生まれない
- 受け付けるのは `.svg` / `.png` / `.gif`（`classifyPortraitFile` が既に知っている種類）。
  差し色が効くのはインラインで埋め込んだ SVG だけ（`docs/requirements.md` 4.4）
- **会話の記録とは混ざらない。** transcript は Claude Code 側（`~/.claude/`）にあり、雑談の要約の
  写しは `~/.tsukumo/chat-summary/` に**パックの外**で置く（下の「雑談の記憶の要約はどこに置くか」）。
  素材は利用者のファイルであって会話ではないが、この経路で会話を書かないことは変わらない（9章）
- **背景（13.8）もこの経路に乗り、1枚あたりの上限は据え置く**（2026-09-21 決定）。**枚数は
  表情の数から数える**（立ち絵は表情ごとに1枚 + ミニ立ち絵1 + 背景1）。**固定の数にしない**のは、
  表情が6つから8つに増えたときに 8 枚のままだったせいで、立ち絵を全部そろえたパックでは背景の
  差し替えだけが黙って弾かれていたため（2026-09-21 に修正）。受け付けるのは `.png` / `.jpg` / `.webp` の3つ
  （`rasterMimeType` が既に知っている形式。背景は写真が主な素材で、透過も差し色のインライン
  埋め込みも要らない。**`.gif` は入れない** — 動く背景は読む面の隣で気が散る）。ファイル名は
  立ち絵と同じ考え方で `background.<形式>` と組み立てる（受け取った名前をパスにしない）

**差し替えるときの細部**:

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

**新しく作るときの細部**:

- **既にある名前は弾く。** 探索の順で後ろが勝つので、作れてしまうと**既存のパックが黙って隠れる**。
  既にあるものを変えたいなら、切り替えてから上の編集の口で変える。画面は一覧にある名前を
  そのまま押せない理由として出す（`error` フレームはまだ画面に出していないので、**判断を画面と
  サーバの両方に置く** — 画面は押させない、サーバは書かない）
- **名前に使えるのは半角の英数字と `.` `_` `-` だけで、`.` では始められない**
  （`src/shared/character.ts` の `isCharacterPackName`）。ディレクトリ名になるのはこの1つだけ
  なので、パスの区切り・`..`・隠しディレクトリを名前として通さない。表示名（`character.json` の
  `name`）は作った時点ではディレクトリ名と同じで、日本語にしたければ定義ファイルを手で直す
- **最低限そろえさせるのは `default` の1枚。** 必須にするのは境界のスキーマ（`portraits` の
  `default` を required）で、書き込む側まで欠けた形が届かない
- **作った直後に自動では切り替えない。** 増えるのはサイドバーの `<select>` の選択肢で、
  切り替えは選んだときに起きる（切り替えは駆動の起こし直し＝会話の画面の初期化なので、作る操作の
  副作用にしない）。**作る画面には「このキャラクターに切り替える」が出て**（2026-09-17）、押した
  ときだけ切り替わってキャラクター画面へ戻る（ターン進行中は押せない。13.6）
- 差し色は `default` の1色だけを受け取る。衣装ごとの出し分けと `proud` / `flustered` の立ち絵は、
  作ったあと切り替えて、キャラクター画面の編集の口で足す（**作る口は最低限にする**）。
  **作る口と変える口がどの画面にどう並ぶかは 13.6**
- 書く順は**素材 → `character.json`**。途中で失敗したディレクトリは定義を持たないので一覧に
  出ず、そのうえで書きかけのディレクトリは消す

#### 覚えたことを人格に書き足す・1行だけ忘れる

2026-09-21 決定。**何を書いてよいかの正典は `docs/requirements.md` 4.9**（利用者については
書かない、という線引きを含む）。ここが決めるのは**どこに・誰が・どう書くか**と、上限・
元に戻す手。

**書き込み先は他の編集と同じ `~/.tsukumo/characters/<pack>/persona.md` の1箇所だけ。**
初めて書くときに**いま出しているパックをホームへ丸ごと写す**既存の道（`character-edit.ts` の
`copyPackOnce`）にそのまま乗る。同梱の `characters/*` と起動先の `characters/local` は書かない
（リポジトリの作業ツリーが汚れる。`docs/requirements.md` 2.2）。**起動先の `characters/local`
と同じ名前のパックにも書かない**（`isEditableCharacterPack`。書いても探索の順で負け、次の起動で
消えたように見える）。

**書くのはキャラクター自身。** `speak` と同じプロセス内の MCP サーバにツールをもう1つ出し、
モデルが呼んだときだけ書く。引数は**1行の文字列1つ**だけ、戻り値は `"ok"` だけ（tsukumo から
モデルへ情報が戻る経路を作らない。`speak` と同じ）。

- **ツールは雑談モードのときだけ載せる**（`core/session-rule.ts` が `CHAT_MANNER_PROMPT` を
  選ぶのと同じ単位）。仕事のときに出すと、作業の文脈（プロジェクトの事情・利用者の都合）が
  人格に入り込む経路になる
- **何を書くかの判断は `core/chat-manner.ts` の条が持つ**（4.9 の3条件と書かないものの一覧を
  写す）。tsukumo 側は「受け取った1行をどこにどう書くか」だけを持ち、**会話を読んで判定しない**

**tsukumo がターンの終わりに会話を見て判定する案は採らない。** 本文とセリフを溜めて解析する
経路が要り、`docs/coding-standards.md`「会話内容の扱い」と正面からぶつかる。**別のモデル
呼び出しに抜き出させる案も採らない**（`docs/requirements.md` 2.2「分離や整形のために会話を
外部のモデルへ送ることも含めて対象外」）。

**書き方は末尾の追記専用の節。** `persona.md` の**いちばん最後**に `## 覚えたこと` を置き、
`- ` の箇条書きを1行ずつ足す。節が無ければ見出しごと作る。

- **節より前は1バイトも触らない。** 人が書いた見出しと表、機械が書いた領域の境目が、ファイルの
  中で1本に決まる
  **上限**（承認も通知も無いので、積み上がって人格が崩れる経路はここで塞ぐ）:

| 何                | 上限                                                        |
| ----------------- | ----------------------------------------------------------- |
| 1ターンに書ける数 | 1行（2回目以降は書かずに `"ok"` を返す）                    |
| 1ターンに消せる数 | 1行（**`remember` とは別に数える**。下の「1行だけ忘れる」） |
| 1行の長さ         | 120 文字（超えたら書かない。改行を含む行も弾く）            |
| 節が持てる行数    | 20 行（超えたら**いちばん古い行を落とす**）                 |
| 触るファイル      | そのパックの `persona.md` 1つだけ                           |

**1行だけ忘れる口も、同じ節の中だけを触る**（2026-09-21 決定。ユーザーの指示「雑談モードで、
キャラが覚えたことを自身で削除できるようにしたい。ただし、もともとのファイルに記載してあった
ことは編集できず、自身で書いたことのみ対象とする」）。**消すのもキャラクター自身**で、
`remember` と同じプロセス内の MCP サーバに `forget` ツールをもう1つ出す。引数は**消したい1行の
文字列1つ**だけ、戻り値は `"ok"` だけ、**雑談モードのときだけ載る** — どれも `remember` と同じ。
**何を消してよいかの正典は `docs/requirements.md` 4.9**で、判断は `core/chat-manner.ts` の条が
持つ（tsukumo 側は**会話を読んで判定しない**）。

- **指し方は完全一致**（`- ` の印と前後の空白だけ吸収する）。**番号では指さない** —
  `systemPrompt` に載った時点の並びは、同じセッションで `remember` が走れば末尾に積まれ、
  20 行の上限で古い行が落ちる。番号はその2つの経路でズレ、**ズレたまま別の行を消す**
  （消すのは戻せない操作なので、ズレる指し方を採らない）。前方一致も採らない
  （書き出しの似た行を巻き込む）
- **一致する行が無いときは何もしない。** 見つからなかったことも**モデルへ戻さない**
  （戻り値は `"ok"` だけ。7.1 の「tsukumo からモデルへ情報が戻る経路を作らない」）。
  節の中身は次に起こしたときの `systemPrompt` に載るので、**消えたかどうかはそこで分かる**
- **同じ文面の行が2つあるときは、いちばん古い1つだけを消す**（行数の上限で落ちるのと同じ向き）。
  残った重複は、次のターンでもう一度呼べば消える
- **`remember` と `forget` は同じターンに1回ずつ呼べる**（別々に数える）。覚え違いをその場で
  言い直す（古い1行を消して新しい1行を書く）のが雑談では普通で、片方しか呼べないと誤った1行が
  1往復ぶん残る
- **節が空になったら見出しごと消す。** 空の節が `systemPrompt` に載っても意味が無く、全部
  忘れた状態は「書き足す前の人格」と同じであるべき。**節より前は1バイトも触らない**のは書き
  足すときと同じなので、節を作るときに入れた見出しの前の改行だけが残る
- **消せるのは `## 覚えたこと` の節の行だけ。** もともと人が書いた節（「好きなもの」など）は
  消せない——**節の境目がそのまま「自分で書いたものだけ」の線**になるので、線を引く仕掛けを
  別に持たずに済む

**元に戻す手は3つあり、あとの2つは新しい仕掛けが要らない:**

- **キャラクター自身に `forget` で1行ずつ消させる**（上の「1行だけ忘れる」。雑談の中で言えば
  済むので、ファイルを開かない唯一の手）
- **`## 覚えたこと` の節を消せば、書き足す前の人格に戻る**（節より前を触らないので、ホームへ
  写した時点の文面がそのまま残っている）
- **ホームの `<pack>` ディレクトリごと消せば、次の起動で同梱（または起動先）のパックが読まれる**

**世代バックアップは採らない**（会話をきっかけに書いたものの残る場所を増やさない。9章）。
**画面から消す口もいまは作らない**（対象利用者は作者本人だけで、
ファイルを直接開ける。消す口を足したのは**キャラクター自身**の側だけで、画面の側は据え置き）。

#### 雑談の記憶の要約はどこに置くか

2026-09-21 決定。**`~/.tsukumo/chat-summary/<パック名>.md` に1つだけ置く**（認められた例外の
範囲は `docs/requirements.md` 4.9「記憶の圧縮と忘却」が正典）。ここが決めるのは
**どこに・誰が・どう書き、どう渡すか**と上限。

**置き場は `~/.tsukumo/chat-summary/<パック名>.md`。**

- `~/.tsukumo/` の下（`state.json`・`characters/` と同じ親）。**パックごとに1ファイル**で、
  雑談のセッションがパックごとに分かれているのと同じ単位（7章「キャラクターごとに別のセッション」）
- **`cwd` には依存させない**（覚えたキャラクターと同じ。13.6）。雑談はプロジェクトの話ではなく、
  プロジェクトの事情を**そもそも書かないと決めている**ので、どこから起こしても同じものを読んでよい。
  別の起動先から上書きされることはあるが、**上書き＝忘却**なので害にならない
- **キャラクターパックのディレクトリの中には置かない。** パックは素材のまとまりで、ホームへ丸ごと
  写す道（`copyPackOnce`）と画面から作る道がある。会話に由来する文章をその中へ混ぜると、
  **パックを渡すことが要約を渡すことになる**
- パスに使う文字列はパックの名前1つだけで、`isCharacterPackName` を通してから組み立てる
  （`..` も区切り文字も名前として通らない。7.1 と同じ規則）
- 中身は**1行目が印、2行目から要約の本文**（見出しも日時も付けない）。印は「次に起こすセッションへ
  渡す必要があるか」の1ビットで、下の「渡し方」が使う。**同じファイルに持つ**のは、写しと印が
  1回の書き込みで揃うから（別ファイルにすると片方だけ残った状態が生まれる）。写しを消せば印も
  一緒に消える（元に戻す手が1つのまま）。`systemPrompt` へ載せるときの前置きは core 側で、
  **印の行は載せない**

**捕まえ方は `PostCompact` フック**（`query` の options。**フックは `adapter` に閉じる**。原則3）。
`compact_summary` に要約の本文がそのまま届くので、transcript を読み直さずに済む。

- フックは `trigger: "manual" | "auto"` のどちらでも呼ばれるので、**claude 側の自動の圧縮
  （最後の受け皿。`docs/requirements.md` 4.9）でも写しが新しくなる**
- 受け取った文字列は**ログにも画面にも出さない**（出してよいのは長さまで）
- **`/clear` も同じ口で受ける。** `conversation-cleared`（`src/server/core/sdk-message.ts`）が
  流れたら、写しの印を「未渡し」に戻す。見る場所は `relayMessages` の中で、`turn-finished` で
  `personaMemory.finishTurn()` を呼んでいるのと同じ1行の形

**渡し方は `systemPrompt` の append**（`persona.md` と同じ道。`buildSystemPromptAppend`）。
**2026-09-21 に、同じ口で直近の逐語も渡すことにした**（`docs/requirements.md` 4.9「直近の会話は
逐語のまま読み戻す」）。載せるかどうかの条件は下の2つで**要約の写しと逐語に共通**なので、
**判断は1箇所にまとめる**。

- **載せる条件は2つで、どちらかに当たれば載せる**: (1) 続きから始めない（`SessionLaunchSeed.resume`
  が `undefined`） (2) 続きから始めるが、**写しの印が「未渡し」**。どちらでもなければ載せない
  （`resume` した文脈に claude 側の要約が既にある）。**判断そのものは core の中で閉じる**
- **`/clear` を「続きから始めない」では拾えない。** 印はターンが終わるたびにそのときの
  セッションIDへ付け直され、`/clear` の直後は新しい `session_id` になる（`sdk-driver.ts` の
  `relayMessages` と `scheduleMarkSession`）。だから**`/clear` のあと1ターン回せば空のほうが印を
  持ち**、次の起動は `seed.resume !== undefined` で始まる。条件(2)が無いと、そのパックの記憶は
  `TSUKUMO_NEW_SESSION=1` を使うまで戻らない
- **印が無い・読めないときは「未渡し」として扱う。** 倒れる方向を「同じ要約が2度載る」側にして、
  **黙って記憶が消えるほうへ倒さない**
- **載せたら印を「渡し済み」に戻す**（同じ写しを起こし直しのたびに重ねない）
- **雑談のときだけ**渡す（`personaMemory` と同じ単位。`session-rule.ts` が規約を選ぶのと同じ境目）
- 前置きの文面は core（`chat-manner.ts` の隣）。**要約であって会話ではないこと**と、
  **引用しないこと**を短く添える
- **判断と印の書き換えを1回で済ませ、要約の写しと直近の逐語を同じ機会に組み立てて返す**
  （口を2つに分けない。**採らなかった案は `docs/history/decision.md`「design.md 7. 雑談の記憶の
  要約はどこに置くか（覆した記録と採らない案）」**）
- **逐語だけが載る場合がある。** 条件を決めるのは `resume` と印だけなので、**写しがまだ無い
  （要約が一度も作られていない）ときも逐語は載る**。いまの実装は写しが無いと早々に `undefined`
  を返すので、そこを分ける
- **ファイル名は `chat-summary-prompt.ts` から `chat-memory-prompt.ts` へ改める。** 概念が
  「要約を載せるか」から**「雑談の記憶を `systemPrompt` に載せる」**へ広がり、名前が概念を
  指さなくなるため（原則5）

**上限と積み重ね方**

| 何              | 決め                                                                  |
| --------------- | --------------------------------------------------------------------- |
| 積み重ね方      | **上書き**（継ぎ足さない）                                            |
| 1ファイルの上限 | **8 KiB**。溢れたら**古いほうの行から落とす**（行の途中では切らない） |
| 持つ世代        | 1つだけ（バックアップを取らない）                                     |
| 触るファイル    | そのパックの1つだけ                                                   |

- **継ぎ足さない理由**: 次の圧縮は前の要約が入った文脈から作られるので、継ぎ足すと同じ内容が
  二重になる。「要約＋新たな会話から要約を作る」は claude 側で既に起きている
- **8 KiB は逐語で読み戻す量（64 KiB）の 1/8。** 要約がそこへ近づいたときは、畳まれたものでは
  なく**要約の形をした会話の写し**になっている。そこで切る。**逐語の窓を広げてもここは動かさない**
  （目的が「要約が会話の写しに育つ経路を塞ぐ」ことで、どれだけ戻すかとは別。
  `docs/requirements.md` 4.9）
- 世代バックアップを採らないのは 7.1 と同じ理由（会話をきっかけに書いたものの残る場所を増やさない）

**層の切り方は `persona.md` の書き戻しと同じ**: 口（型）は `core/session-driver.ts`、ファイルに
触るのは `adapter`、結ぶのは配線層（`src/session-start.ts`）。

**`~/.tsukumo/` の中身は `state.json`・キャラクターパックのディレクトリ・雑談の要約の写し・
雑談の会話のアーカイブ（下）の4つ**（9章）。

#### 雑談の会話のアーカイブはどこに置くか

2026-09-21 決定。**残すかどうかと何を残すかの正典は `docs/requirements.md` 4.9
「雑談の会話のアーカイブ」**（雑談だけ・依頼とセリフと表情だけ・遡っては取り込まない）。
ここが決めるのは**どこに・どんな形で・誰がいつ書くか**と上限、そして**誰がどう読み戻すか**
（読み戻す理由と量の正典は 4.9「直近の会話は逐語のまま読み戻す」）。

**置き場は `~/.tsukumo/chat-archive/<パック名>/<YYYY-MM-DD>.jsonl`。**

- `~/.tsukumo/` の下（`state.json`・`characters/`・`chat-summary/` と同じ親）。**`cwd` には
  依存させない**（雑談はプロジェクトの話ではない。要約の写しと同じ理由）
- **パックごとに割る。** 雑談のセッションがパックごとに分かれているのと同じ単位（7章）
- **日ごとに割る。** 追記で伸びるものなので、**太り方が目で分かり、消す単位も人に分かる**
  区切りが要る。日の境目は**そのマシンのローカル時刻**（利用者が「その日」と読む単位）
- **キャラクターパックのディレクトリの中には置かない**（パックを渡すことが会話を渡すことに
  なる。要約の写しと同じ理由）
- パスに使う文字列はパックの名前1つだけで、`isCharacterPackName` を通してから組み立てる
  （`..` も区切り文字も名前として通らない。7.1 と同じ規則）

**形式は JSONL（1行1件、追記）。**

```jsonl
{"v":1,"at":"2026-09-21T14:03:12+09:00","pack":"tsukumo","speaker":"user","text":"ただいま"}
{"v":1,"at":"2026-09-21T14:03:20+09:00","pack":"tsukumo","speaker":"character","text":"おかえり","expression":"smile"}
```

| 鍵           | 中身                                                               |
| ------------ | ------------------------------------------------------------------ |
| `v`          | 行の形の版（いまは `1`）。形を変えたら上げ、古い行と見分ける       |
| `at`         | ISO 8601（**オフセット付き**）。行だけで時刻が決まる               |
| `pack`       | キャラクターパックの名前                                           |
| `speaker`    | `"user"` か `"character"` の2つだけ                                |
| `text`       | 文面（依頼かセリフ）                                               |
| `expression` | 表情の名前。**`"character"` の行だけ**が持つ                       |
| `images`     | 添えた画像の**枚数**。**`"user"` の行が、1枚以上あるときだけ**持つ |

- **tsukumo の内部の型をそのまま書き出さない。** `SessionEvent` も `SessionRecord` も
  `ChatLogEntry` も JSON にせず、**上の7つの鍵に決め打った形へ変換して書く**（変換は
  `adapter` の1箇所）。内部の型が変わってもファイルの形は変わらない — これが
  「設計変更に耐える」の中身で、**`v` はその形が変わった日のための逃げ道**（4.5 と同じ考え方）
- **行だけで意味が決まるようにする。** 時刻もパックも各行が持つので、**別の場所へ移しても、
  何本かを結合しても読める**。パスとの重複は承知のうえで、倒れる方向を「読めなくなる」側に
  しない
- **JSON の配列1つにしない。** 追記で閉じ括弧を書き換えることになり、途中で止まったときに
  ファイル全体が読めなくなる。JSONL は**壊れても被害が1行**で、`grep` でも読める
- **Markdown にしない。** 人が読むのは要約の写しの役で、こちらは**機械で読むため**に置く
- セッションIDは持たない（**Claude Code の都合**で、起こし直すたびに変わる。ターンの境目は
  時刻の並びで足りる）

**誰がいつ書くか。** `src/server/core/session-manager.ts` の `receive`（イベントが1件ずつ通る
場所）で、**雑談のときだけ**、依頼とセリフが届いたその場で1行足す。

- **`state.records` からは書かない。** `trimToRecentTurns` に切り詰められたあとの記録から
  拾うと、窓から溢れたターンが永久に落ちる（`chatLogBytesSinceCompact` を走行合計で持つのと
  同じ理由。`docs/requirements.md` 4.9）。**書く材料は届いたイベントそのもの**
- **復元で流し直されたイベントは書かない。** いまは `createSessionLaunch`（`core/session-launch.ts`）
  が組み直した履歴を駆動と同じ `onEvent` へ流しているので、**そのままでは起こし直すたびに同じ
  会話がもう一度積まれる**。復元の再生を**別の口**（`onRestoredEvent`）に分け、`session-manager`
  は「駆動から新しく届いたぶんだけ書く」。畳み方と配り方はどちらも今までどおり
- ターンの終わりにまとめない（溜めている間にプロセスが終わるとそのターンが丸ごと落ちる）
- **書けなくても例外を投げない**（常駐プロセスは1回の失敗で落ちない。
  `docs/coding-standards.md`「エラーハンドリング」）。落ちるのはその1行だけ
- **層の切り方は要約の写し・人格への書き戻しと同じ**: 口（型）は `core/session-driver.ts`、
  ファイルに触るのは `adapter/chat-archive.ts`（**1ファイル = 1つの境界**。原則3）、結ぶのは
  配線層（`src/session-start.ts`）。置き場を差し替えられる `root` 引数も同じ手で持つ
  （テストがホームを汚さないため）

**誰がどう読み戻すか。** 口は `ChatArchive` に**もう1つ足す**（`readRecent(packName, limitBytes)`。
型は `core/session-driver.ts`、実装はこのファイル）。呼ぶのは**セッションを起こすとき1回だけ**で、
結ぶのは配線層（`src/session-start.ts`）——書き口が `session-manager` から呼ばれるのと持ち場が
違うが、**触るファイルは同じ1つ**なので境界は増やさない（原則3）。

- **新しい日のファイルから遡って読む。** ディレクトリの日付のファイル名を降順に並べ、各ファイルは
  末尾の行から遡り、**文面のバイト数の合計が `limitBytes` に届いたら止める**（全部は読まない。
  ファイルが何年ぶん増えても読む量は変わらない）
- **返すのは古い→新しいの順**（会話として読める並び）。`readRecent` が並べ替えまで済ませ、
  呼ぶ側に順序の都合を持たせない
- **読めない行は飛ばす。** JSON として壊れている行・`v` が知らない版の行・鍵が足りない行は
  1行ずつ落とす（JSONL は壊れても被害が1行、がここでも効く）。**例外は投げない**——
  読めなければ空を返し、そのセッションは逐語なしで始まる（常駐プロセスは1回の失敗で落ちない）
- **返す形は「話者の別・文面・その行の日付」だけ。** `expression` も `images` も返さない
  （`docs/requirements.md` 4.9。**読む側が落とすのではなく、口が最初から渡さない**）
- **文面を読んで判定しない**（要約の写しと同じ）。`readRecent` がするのは遡って集めることと
  並べ替えだけで、中身で載せる・載せないを決めない
- `packName` は書き口と同じく `isCharacterPackName` を通してから組み立てる
- **窓から溢れた1往復でも、旗が立っていれば同じ口が一緒に返す**（下の「「残す」旗はどこに
  置くか」）。**読む口を増やさない**のは、窓と重なった件をその場で落とせるのが、両方を1度に
  見ているときだけだから

**上限と消す手**

| 何         | 決め                                                     |
| ---------- | -------------------------------------------------------- |
| 積み重ね方 | **追記**（1行1件、上書きしない）                         |
| 保持期間   | **持たない**（tsukumo は自分で消さない）                 |
| 総量の上限 | **持たない**（歯止めは日ごとに割ること）                 |
| 1行の上限  | 依頼は zod の 20,000 文字が既に効く。別の上限は足さない  |
| 読み戻す量 | **64 KiB**（文面のバイト数。`docs/requirements.md` 4.9） |
| 消す手     | ファイル・ディレクトリを消す（日ごと・パックごと・全部） |

- **`8 KiB` のような上限を持たせない。** 要約の写しに上限があるのは**要約が会話の写しに育つ
  経路を塞ぐため**で、こちらは会話を残すことが目的なので、同じ理由が当たらない
- 画面から消す口は作らない（7.1 の「覚えたこと」と同じ理由）

#### 「残す」旗はどこに置くか

2026-09-21 決定。**立てるかどうか・何のためかの正典は `docs/requirements.md` 4.9
「残すと決めた1往復は窓から落とさない」**（旗を立てるのはキャラクター自身・1往復・窓の外に
8 KiB）。ここが決めるのは**どこに・どんな形で・誰がいつ書くか**と、**どう読み戻すか**。

**置き場は `~/.tsukumo/chat-archive/<パック名>/kept.jsonl`。**

- **アーカイブと同じディレクトリ**（旗はそのパックの会話に付くもので、別の親に分ける理由が無い）
- **日付のファイルとは名前で見分ける。** 窓の側は `YYYY-MM-DD.jsonl` にだけ当たる正規表現で
  ファイルを選ぶので、`kept.jsonl` は**窓の走査に混ざらない**
- **日ごとに割らない。** 旗はたまにしか立たず、太り方の歯止めは読み戻す側の 8 KiB が持つ

**形式は JSONL（1行1件、追記）。文面を持たない。**

```jsonl
{"v":1,"at":"2026-09-21T14:03:12+09:00","pack":"tsukumo"}
{"v":1,"at":"2026-09-21T14:03:20+09:00","pack":"tsukumo"}
```

| 鍵     | 中身                                                     |
| ------ | -------------------------------------------------------- |
| `v`    | 行の形の版（いまは `1`）。アーカイブの行と同じ番号を使う |
| `at`   | 指している行の `at`（**照合に使うのはこれだけ**）        |
| `pack` | キャラクターパックの名前（行だけで意味が決まるように）   |

- **文面を複製しない。** 積むのは**アーカイブの行を指す時刻**だけで、会話はディスクの上に1つの
  まま。`docs/coding-standards.md`「会話内容の扱い」の**書き出してよいものの表に数えずに済ませる**
  ための形で、ここを「文面ごと写す」に変えると例外を1つ増やすことになる（変えるにはユーザーの
  決定が要る）
- **日付のファイルは書き換えない。** 行に `keep` の鍵を足す案（＝追記しかしていない作りを、
  行を書き換える作りに変える）は採らなかった — 追記だけなら途中で止まっても被害が1行で済む性質が
  崩れ、**`v` を上げるかどうかの判断**も抱え込む。索引を別に持てば、**古い行はそのまま `v: 1` で
  読める**
- **同じ秒に書かれた行は区別しない。** 索引が指すのは「その秒に書いた行」で、隣の1件が一緒に
  載ることはありうる（**足りないより多いほうへ倒す**。秒より細かい印を足すほどの害ではない）

**誰がいつ書くか。** 旗を立てるのは `keep` ツール（`src/server/adapter/sdk-driver.ts`）、書くのは
**ターンの終わり**。

- **ツールは引数を取らない**（指せるのはそのターンだけ。`docs/requirements.md` 4.9）。戻り値は
  他のツールと同じ `"ok"` だけで、**旗が立ったかどうかもモデルへ戻さない**
- **口は `ChatKeep`**（`core/session-driver.ts`）。`ChatArchive` をそのまま駆動へ渡さないために
  分けてある — 駆動に要るのは旗を立てる1つの動きだけで、書き口も読み口も要らない。渡す実体は
  `session-start.ts` が作る**同じ1つのアーカイブ**
- **アーカイブは「このターンで書いた行の時刻」をメモリに持つ**（文面は持たない）。旗が立っていれば
  `finishTurn` で索引へ写し、立っていなければ捨てる。**覚えている量は1ターンぶんで頭打ち**
- **`finishTurn` を呼ぶのは `session-manager` の `receive`**（`turn-finished` が通る場所）。
  ターンの途中のどこで `keep` を呼んでも、**その1往復ぜんぶに付く**のはこのため
- **雑談のときだけ載る**（`chatKeep` が渡るのは `seed.chat` のときだけ。`remember` / `forget` と
  同じ単位）

**どう読み戻すか。** 口は**増やさない** — `readRecent` が窓と旗の両方を返す。

```
readRecent(packName, { recentBytes, keptBytes }) → { kept, recent }
```

- **窓を先に決め、旗のほうは窓に入らなかった件だけを足す。** 逆にすると同じ件が両方に出る
- **返すのが2つに分かれているのは、載せる場所が分かれているから**（旗のぶんは直近より前で、
  間に残っていない会話がある）。**節を分けて `systemPrompt` に載せる**のは
  `core/chat-memory-prompt.ts`（要約 → 旗 → 直近の順）
- **索引が指す日付のファイルだけを開く。** 旗の立った日を新しい順に並べ、`keptBytes` が埋まった
  ところで止めるので、**アーカイブが何年ぶん増えても開くファイルの数は頭打ち**になる
- **切り方は窓と同じ**（1件を単位にし、溢れる1件は載せない。そこで止める）。**溢れるのは古い旗**
- **読めない索引の行は飛ばす**（壊れた JSON・知らない版）。指す先の行が無くても例外は投げない
  （消されたファイルを指していても、窓はそのまま読める）

**上限と消す手**

| 何           | 決め                                                        |
| ------------ | ----------------------------------------------------------- |
| 積み重ね方   | **追記**（1行1件、上書きしない）                            |
| 索引の上限   | **持たない**（歯止めは読み戻す側の 8 KiB）                  |
| 読み戻す量   | **8 KiB**（文面のバイト数。窓の 64 KiB の**外側**に足す）   |
| 消す手       | `kept.jsonl` を消す（旗が全部落ち、**会話そのものは残る**） |
| 画面から消す | **口を作らない**（7.1 の「覚えたこと」・アーカイブと同じ）  |

#### 日ごとの索引はどこに置くか

2026-09-21 決定。**持つかどうか・何のためか・誰が書くかの正典は `docs/requirements.md` 4.9
「古い雑談は索引を引いて思い出す」**（見出しを書くのも引くのもキャラクター自身・1日1行・
1回 8 KiB）。ここが決めるのは**どこに・どんな形で書き、どう引くか**と上限。

**置き場は `~/.tsukumo/chat-archive/<パック名>/index.jsonl`。**

- **アーカイブと同じディレクトリ**（索引はそのパックの会話に付く目次で、別の親に分ける理由が無い）。
  **パックをまたがない** — 雑談のセッションがパックごとに分かれているのと同じ単位
- **日付のファイルとは名前で見分ける。** 窓の側は `YYYY-MM-DD.jsonl` にだけ当たる正規表現で
  ファイルを選ぶので、`index.jsonl` は**窓の走査に混ざらない**（`kept.jsonl` と同じ）
- **日ごとに割らない。** 1日1行なので、1年でも数百行にしかならない

**形式は JSONL（1行1件、追記）。** `kept.jsonl` と同じく、日付のファイルは1バイトも書き換えない。

```jsonl
{"v":1,"date":"2026-09-20","pack":"tsukumo","line":"（その日の見出し。モデルが自分の言葉で書く）"}
{"v":1,"date":"2026-09-21","pack":"tsukumo","line":"（その日の見出し）"}
```

| 鍵     | 中身                                                            |
| ------ | --------------------------------------------------------------- |
| `v`    | 行の形の版（いまは `1`）。アーカイブの行と同じ番号を使う        |
| `date` | 見出しが付く日（`YYYY-MM-DD`。**書いた日のローカル日付**）      |
| `pack` | キャラクターパックの名前（行だけで意味が決まるように）          |
| `line` | その日の見出し（**モデルが書く**。120文字まで・改行を含まない） |

- **`index.md` にしない。** 機械で読む口が同じディレクトリに既に2つ（`YYYY-MM-DD.jsonl` と
  `kept.jsonl`）あり、**3つ目の形式と検査を増やさない**ほうが、読む人の覚えることが少ない。
  1日1行なので JSONL のままでも目で読める
- **1日1行は「あとの行が勝つ」で保つ。** 同じ日に2度書いても**行は書き換えず追記**し、読む側が
  最後の行を採る（追記だけなら途中で止まっても被害が1行で済む性質が崩れない）
- **`v` を上げない。** 日付のファイルも `kept.jsonl` も1バイトも変わらない

**誰がいつ書くか。** 書くのは `index` ツール（`src/server/adapter/sdk-driver.ts`）で、
**受け取った1行をそのまま**その日の行として積む。

- **口は `ChatRecall`**（`core/session-driver.ts`。`index` と `recall` の2つ）。`ChatArchive` を
  そのまま駆動へ渡さないのは `ChatKeep` と同じで、**パックの名前と読む量は配線層
  （`src/session-start.ts`）が縛ってから渡す**
- **1ターンに1行**（`remember` と同じ縛り。空・改行つき・120文字超は黙って捨て、その1行も使わない）。
  **ターンの終わりに戻すのは `finishTurn`** で、旗の索引と同じ合図に相乗りする
- **戻り値は `"ok"` だけ**（書けたかどうかをモデルへ戻さない）
- **雑談のときだけ載る**（`chatRecall` が渡るのは `seed.chat` のときだけ。`keep` と同じ単位）

**どう引くか。** 口は `recall(packName, keyword, limitBytes)` の1つ（実装は
`adapter/chat-archive.ts`。**ファイルに触るのは同じ1ファイルのまま**で、境界は増やさない）。

```
recall(packName, keyword, limitBytes) → { kind: "found", entries } | { kind: "not-found" } | { kind: "already-recalled" }
```

- **索引を先に読み、当たった日のファイルだけを開く。** 当たる日が無ければ**日のファイルは
  1つも開かない**（`not-found`）。開く順は**新しい日から**で、`limitBytes` が埋まったところで
  止めるので、**アーカイブが何年ぶん増えても開くファイルの数は頭打ち**になる
- **照合は小文字にしての部分一致**で、空白で分けた語は**どれか1つでも当たれば**その日を拾う
  （言葉のずれを吸収するのが索引の役。足りないより多いほうへ倒す）。**`date` も照合の対象**
  なので、`2026-09-21` のような鍵でも引ける
- **`grep` を起こさない。** 外部コマンドを増やすにはユーザーの承認が要るうえ、索引は1日1行なので
  `node:fs` で読んで絞るだけで足りる（`docs/requirements.md` 4.9）
- **切り方は窓と同じ**（1件を単位にし、溢れる1件は載せない）。**走査そのものも窓と同じ1つ**
  （`readEntriesBackward`）で、違うのは渡すファイルの並びだけ
- **引けるのは1ターンに1回**（2回目以降は索引も日のファイルも開かず `already-recalled`）。
  **1ターンで増える文脈がこの上限（8 KiB）で頭打ちになる**
- **返す形は `readRecent` と同じ**（話者の別・文面・その行の日付だけ。`expression` も `images` も
  返さない）。**モデルへ返す文面に組み立てるのは core**（`core/chat-memory-prompt.ts` の
  `chatRecallText`）で、**逐語の並べ方は `systemPrompt` の節と同じ1つ**
- **読めない索引の行は飛ばす**（壊れた JSON・知らない版）。指す先のファイルが無くても例外は
  投げない（**索引が無い・壊れていても `readRecent` はそのまま動く**）

**上限と消す手**

| 何           | 決め                                                                    |
| ------------ | ----------------------------------------------------------------------- |
| 積み重ね方   | **追記**（1行1件、上書きしない。同じ日はあとの行が勝つ）                |
| 1行の上限    | **120文字**（`remember` の1行と同じ値。超えた行は書かない）             |
| 書ける数     | **1ターンに1行**                                                        |
| 索引の上限   | **持たない**（1日1行なので、太り方が日数で読める）                      |
| 読み戻す量   | **8 KiB**（文面のバイト数。窓の 64 KiB・旗の 8 KiB とは**別に**数える） |
| 引ける数     | **1ターンに1回**                                                        |
| 消す手       | `index.jsonl` を消す（索引が全部落ち、**会話そのものは残る**）          |
| 画面から消す | **口を作らない**（7.1 の「覚えたこと」・アーカイブ・旗と同じ）          |

## 8. セッションの復元と複数化

**復元の決定は `docs/requirements.md` 4.8 のまま**（`cwd` + tsukumo の印（パックごと。7章）、
常に自動で続きから、**復元のためには**会話を保存しない、失敗したら新規で起こす）。**雑談の会話の
アーカイブ（7章）は復元の材料ではない** — 画面を組み直すのは今までどおり transcript からで、
アーカイブは読み戻さない。新しい形では次が楽になる。

- 画面の履歴の組み直しは「`getSessionMessages` → `SessionEvent[]`（時刻付き）→ `session-manager` の
  `state` に畳む」だけ。接続したブラウザは `hello` の snapshot でそのまま同じ姿になる
  （**ブラウザ側に復元の特別な経路は要らない**）
- 逃げ道は `TSUKUMO_NEW_SESSION=1`（起動時）と `new-session` コマンド（画面から。まだ足していない）
- **どのセッションの続きから始めるかは画面から選べる**（2026-09-22。サイドバーの「セッション」の
  `<select>` → `switch-session` → `session-launch` の起こし直し）。並ぶのは**同じパック・同じモードの、
  目印（`@A` / `@B`）違い**で、新しいほうから `MAX_SESSION_CHOICES` 件まで。**起動時は今までどおり
  自動で続きから始まる**（選ばせる画面は出さない）

**複数化は当面やらない**（2026-09-21 決定。`docs/requirements.md` 2.2。それ以前は未決事項
だった）。`SessionManager` は `sessionId` を鍵に持つが、**これは「将来のため」ではなく、
セッションを起こし直すときに古い側と新しい側が同時に存在する一瞬を表す形**である。広げたく
なったら (1) 複数プロジェクトを1つの画面で切り替える、(2) `tsukumo` コマンドを常駐へ接続する
クライアントにする（client–daemon）へ進める余地はあり、そのときの `hello` は
`sessions: SessionSummary[]` を持ち、`ClientCommand` に `select-session` が加わる。

## 9. 会話内容と安全

`docs/coding-standards.md`「会話内容の扱い」は最優先のまま。新しい形で変わる点と変わらない点:

| 項目                                               | 扱い                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| バインド先                                         | `127.0.0.1` だけ。変えない                                                                                                                                                                                                                                                                                                                                                                                       |
| Origin                                             | WebSocket の upgrade で確かめる（いまの POST と同じ規則。`Origin` が無ければ通す、あれば自分と一致）                                                                                                                                                                                                                                                                                                             |
| 起動トークン                                       | 起動ごとに乱数を1つ作り、`/ws?t=` で要求する。ページの URL に付けて配る（`showView` に渡す URL に含む）。同じマシンの別プロセスが `127.0.0.1:7327` を読める、という既知の割り切りを塞ぐ                                                                                                                                                                                                                          |
| ディスク                                           | 会話を**書く**のは**2つの例外だけ**（下の「雑談の要約の写し」と「雑談の会話のアーカイブ」。その次の行は書かずに**読む**ほう）。`bun build` の出力もメモリ。`localStorage` に置くのは領域の比率だけ（キャラクターパックへ書くのは**会話ではなくキャラクターの属性1行**だけ。下の行）                                                                                                                              |
| ブラウザ側のメモリ                                 | `SessionState` として会話の一部を持つ。**同じオリジンの `127.0.0.1` のタブの中に閉じる**（いまも DOM として持っている。持ち方が変わるだけ）                                                                                                                                                                                                                                                                      |
| ログ                                               | `error` フレームの `reason` は定型文。サーバの stderr に会話を出さない（いまのまま）                                                                                                                                                                                                                                                                                                                             |
| 雑談の記憶の要約                                   | 作るのは claude 自身の圧縮（`/compact`）で、tsukumo がするのは容量を数えて圧縮を頼むことと、区切りを画面に出すことだけ。**要約の文面は画面にも `error` フレームにも stderr にも出さない**                                                                                                                                                                                                                        |
| 雑談の要約の写し                                   | `~/.tsukumo/chat-summary/<pack>.md` に**最新の1つだけ**を上書きで持つ（8 KiB まで）。**ユーザーが 2026-09-21 に認めた「別の場所に複製しない」の例外の1つ目**（範囲と理由は `docs/requirements.md` 4.9、形と上限は7章）。載せ直すのは**雑談のセッションの `systemPrompt`** で、条件は「新規に起こした」か「`/clear` を見たあと」の2つ（写しの1行目の印が持つ）                                                    |
| 雑談の会話のアーカイブ                             | `~/.tsukumo/chat-archive/<pack>/<日付>.jsonl` に、雑談の依頼とセリフを表情つきで1行ずつ追記する。**ユーザーが 2026-09-21 に認めた「別の場所に複製しない」の例外の2つ目**（範囲と理由は `docs/requirements.md` 4.9、形と上限は7章）。**画面の 100 ターンには影響されない。** 画面にも `error` フレームにも stderr にも出さない                                                                                    |
| 直近の雑談を逐語で読み戻す                         | アーカイブの**新しいほうから 64 KiB まで**を読み、**雑談のセッションの `systemPrompt`** へ逐語のまま載せる。載せる条件は要約の写しと同じ2つ。**渡す先はそこだけ**で、画面にも `error` フレームにも stderr にも出さず、**仕事の側の文脈にも載せない**。逐語が新しいセッションの transcript に書かれることは承認に含まれる（範囲と量は `docs/requirements.md` 4.9「直近の会話は逐語のまま読み戻す」、読み口は7章） |
| 人格への書き戻し（覚えたこと）                     | 雑談で覚えたことを `~/.tsukumo/characters/<pack>/persona.md` の末尾の節へ1行ずつ足す。**利用者については書かない**（範囲は `docs/requirements.md` 4.9、形と上限は 7.1）。会話の文面はディスクに届かない                                                                                                                                                                                                          |
| テストのフィクスチャ・fake driver の疑似セッション | 手で書いた架空の会話だけ                                                                                                                                                                                                                                                                                                                                                                                         |

## 10. テスト

| 対象                           | 方法                                                                                                                           | 置き場所                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| reducer（`applySessionEvent`） | いまの `session-view.test.ts` をそのまま持ち越す（純粋関数）                                                                   | `test/shared/session-state.test.ts`        |
| zod スキーマ                   | 受け付ける形・落とす形を1件ずつ                                                                                                | `test/shared/command.test.ts` など         |
| SDK の型との一致               | `PERMISSION_MODES` / `MODEL_ALIASES` が SDK の型と同じ値であること（型レベルの検査）                                           | `test/server/adapter/sdk-driver.test.ts`   |
| `session-manager`              | fake driver を差し込み、`hello` → `events` の順序・バッチ・`dispatch` の分岐                                                   | `test/server/core/session-manager.test.ts` |
| `server`（ws）                 | 接続 → `hello` が返る、トークン無しは 403、Origin 違いは 403、コマンド → 駆動が呼ばれる                                        | `test/server/adapter/server.test.ts`       |
| browser の部品                 | `bun test` + `happy-dom` + `@testing-library/react`。**役割と文言で当てる**（HTML の文字列一致はしない）                       | `test/browser/**`                          |
| 層の検査                       | `shared ← core` / `shared ← browser` / `core ⟂ browser` の3辺。外部ツールは増やさない                                          | `test/architecture.test.ts`                |
| 画面全体                       | **fake driver で起こした tsukumo に Playwright**（`webapp-testing` スキル）。数値で読めるものは CDP で読む。色・間合いは人の目 | `scripts/`（本体から呼ばれない）           |
| 状態のカタログ                 | 疑似セッションの場面を名指しして起こし直し、広い窓と狭い窓で撮って索引 HTML に並べる（`TSUKUMO_FAKE_SCENE`）                   | `scripts/capture-catalog.ts`               |

**ブラウザに出た絵は自動テストで守らない**、という方針は変えない。変わるのは「claude を起こさずに
絵を出せる」こと（fake driver）で、目視の手順が `docs/architecture.md`「手で確かめること」から
API を使わない形になる。

## 11. ビルドと依存

- **成果物は事前に組み立てて `dist/browser/` に置く**（2026-09-21 決定。それまでは起動のたびに
  組み立てていた）。作るのは `bun run build`（`scripts/build-ui.ts`）と `bun run dev` の見張りの
  2つで、**起動（`src/main.ts`）は置いてあるものを読む**。`bun build` の子プロセスは起動の
  経路から消えた（`docs/architecture.md`「ブラウザ側は事前に組み立てて置く」）。**同日のうちに
  追加で、`bun run dev` は起こす前に `bun run build` を1回打つようにした**（`package.json` の
  `dev` が `bun run build && TSUKUMO_WATCH_UI=1 bun run src/cli.ts` になる。見張りが直すのは
  保存のたび、この前置きは起動の1回だけで、上の「起動は置いてあるものを読む」は変わらない）
- `bun run build` が起こすのは `bun build src/browser/main.tsx --target=browser --outdir dist/browser`
  の1本で、`main.js` と `main.css` の対が置かれる（JSX は tsconfig の `"jsx": "react-jsx"` で自動。
  CSS は `main.tsx` から import で辿れるものが1本にまとまる。`--outdir` が要るのは CSS Modules で
  出力が2本になるため）
- **`dist/` は `.gitignore` する。** 2.6MB の生成物を `src/browser/` を直すたびに履歴へ入れない。
  代わりに、リポジトリを取り直したら `bun install` のあとに `bun run build` を1回打つ
  （`tsukumo` は `bun link` でこのリポジトリを指しているので、**「配布」の実体はこのリポジトリ
  そのもの**）
- **成果物が無ければ起動しない**（起動時の前提不足として終了コード1。理由に `bun run build` を
  添える）。**ソース（`src/browser/` と `src/shared/`）のほうが新しければ、1行知らせてそのまま
  配る** — 2026-09-12 の決定が挙げていた「古い成果物を配る事故」には**黙って配らない**ことで
  答える（古くても画面は動くので止めない）。**見張りが `src/browser/` しか見ないのと違い、
  ここは `src/shared/` も見る**（起動時はプロセスごと入れ替わるので、両側が食い違わない）
- tsconfig に `"jsx": "react-jsx"` を足す。ブラウザの型は `@types/bun` が持っているのでそのまま
- **HMR（差分を当てる）は持たない。** 代わりに、**`src/browser/` を見張って組み立て直し、開いている
  タブに「取り直せ」を押す**（2026-09-16 決定。下の「作り直しを押す仕組み」）。**Vite は足していない**し、
  `Bun.serve` の HMR も `Bun.build()` も使わない（「Bun固有APIに寄せない」規約のまま）

**作り直しを押す仕組み。** `src/server/adapter/ui-rebuild.ts` が `node:fs` の `watch` で `src/browser/` を**再帰に**見張り、保存が静まって
から（120ms）`bundle.ts` の `buildUiBundle()` を呼び直す。**出し先は起動が読むのと同じ
`dist/browser/`** なので、開発中に直したぶんはそのまま次の起動に乗る（`bun run dev` を閉じたあとに
`bun run build` を打ち直さなくてよい）。組み上がったものは `src/view-delivery.ts` が持ち替え、
`shared` の `refresh` フレーム（4.4）で開いているタブへ押す。**差分は当てない**（当てた時点で
HMR そのものになり、規模が跳ねる）。配るのは前と同じくメモリに持った文字列。

**救えるのはブラウザに配る側だけ**で、`src/` を直すたびに上げ直さずに済むわけではない:

| 直した場所                       | どうなるか                                                                   |
| -------------------------------- | ---------------------------------------------------------------------------- |
| `src/browser/**/*.css`           | ページを読み込み直す（下の注記）。状態は繋ぎ直しの `hello` で戻る            |
| `src/browser/` の `.ts` / `.tsx` | ページを読み込み直す（`refresh` の `page`）。状態は繋ぎ直しの `hello` で戻る |
| `src/shared/`                    | **プロセスの上げ直しが要る**（下）                                           |
| `src/server/core/` `src/` 直下   | **プロセスの上げ直しが要る**。サーバ側のコードは動いているプロセスの中にある |

**CSS だけを取り直す道（`refresh` の `style`）は使わない**（2026-09-20）。CSS Modules の class 名は
ハッシュ化されて JS 側の対応表にも焼かれるので、片方だけ新しくすると綴りが食い違って崩れた画面が
残る。`shared` には `style` が残っているが、押すのは常に `page`。

`src/shared/` を見張らないのは、**畳み込み（`session-state.ts`）がサーバ側でも回っている**から。
ブラウザ側だけ新しくすると、新旧が食い違ったまま動く状態ができる。片方だけ救うより
「`src/browser/` だけが救える」という1本の線のほうが信用できる。

**見張るのは `TSUKUMO_WATCH_UI=1` のときだけ**（既定は見張らない）。`tsukumo` は `bun link` で
リポジトリを指していて**普段使いと開発が同じ経路**なので、常に入れると仕事中の保存でページが
読み込み直されうる（入力欄の書きかけが消える）。tsukumo 自身を直しながら動かすときだけ
**`bun run dev`**（= `bun run build && TSUKUMO_WATCH_UI=1 bun run src/cli.ts`）で入れる。
`bun run start` は見張らないままにしてある（普段使いと開発を打ち分けで分ける）。

**組み立て直しが失敗したときは、前の版を配り続ける。** `onRebuilt` を呼ばず `refresh` も押さない
ので、ブラウザは何も起きていないように見える。理由の1行だけがペインに出る（常駐プロセスは
描画1回の失敗で落ちない、の側）。なお `bun build` はトランスパイルだけで**型を見ない**ので、
型エラーだけのコードは組み上がってそのまま配られる。組み立てが失敗するのは構文が壊れているとき・
import 先が解けないとき（＝書きかけを保存したとき）。

**足す依存**（`CLAUDE.md`「外部依存を増やすときは承認を得る」。**2026-09-13 に「移行しようか」の
決定で一括して承認済み**。ここに無いものを足すときは改めて承認を得る）:

| 種別    | パッケージ                                                                         | 用途                                                                                                |
| ------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| runtime | `react` `react-dom`                                                                | browser                                                                                             |
| runtime | `ws`                                                                               | core の WebSocket サーバ                                                                            |
| runtime | `react-markdown` `remark-gfm` `rehype-raw` `rehype-sanitize` `rehype-highlight`    | Markdown                                                                                            |
| runtime | `remark-cjk-friendly`                                                              | CJK の強調（`**「…」**`）。2026-09-13 にユーザーの承認を得て追加                                    |
| runtime | `remeda`                                                                           | 型ガードなど一般的な小物（`isPlainObject` / `isObjectType`）。2026-09-22 にユーザーの承認を得て追加 |
| runtime | `mermaid` `chart.js` `highlight.js`                                                | ブラウザへそのまま配る外部ライブラリ（6.4）。2026-09-20 に `vendor/` の同梱から移した               |
| dev     | `@types/react` `@types/react-dom` `@types/ws` `@testing-library/react` `happy-dom` | 型とテスト                                                                                          |
| dev     | `playwright-core`                                                                  | 画面全体の確認（10章）                                                                              |

`zod` はある。`@anthropic-ai/claude-agent-sdk` はある。**`Bun.*` の固有 API に寄せない**規約は続く
（`ws` を選ぶのはそのため）。

**`playwright-core` を選ぶ理由**（2026-09-13 にユーザーの承認を得て追加）: **ブラウザを落とさない**。`playwright` の側は postinstall で
約130MB のブラウザを `~/Library/Caches/ms-playwright` へ取りに行くが、`playwright-core` は driver
だけ（13MB）で、`chromium.launch({ channel: "chrome" })` として**手元の Google Chrome を動かす**。
リポジトリの外に何も置かないので、`node_modules` を消せば消える。**テストランナーは足さない**
（`@playwright/test` ではなくライブラリだけを使い、`bun test` と競合させない）。呼ぶのは
`scripts/capture-view.ts` で、**`bun run check` には入れない**（生きたサーバが要って遅いため)。

## 13. 画面のデザイン

見た目の正典。**ここに書いてあるのは計画であって、CSS はこれを写したもの**（写す先は
各機能の `*.module.css`。トークンは `src/browser/styles/theme.css` に置く。6.6）。

### 13.1 Principles

**色はキャラクターの持ち物、静けさは画面の持ち物。** これが他の4つの根拠になる。

1. **読む面はキャラクターの色を受け取らない。** レポートの本文・サイドバーの文字・入力欄の
   文字は、誰が来ても同じ濃さで読める。色が現れるのは**キャラクターが居る場所**（立ち絵・
   吹き出し）と、**機械が指し示す場所**（フォーカスの輪・`:hover` の縁・選ばれたタブ・
   選んだ選択肢・送信・依頼の見出しの縦罫）と、**読む面を仕切る罫線**（レポートの見出しの
   罫線・表の見出し行の下罫。2026-09-21 に広げた。13.2「レポートの見出しと表に」）だけ。
   **見出しやツール名も「文字」の側**なので `ink` で、色を持つのは隣の縦罫・枠のほう
   （2026-09-13、当ててみたうえで確定）。**仕切る罫線に出すのは弱めた色**で、素の `accent` は
   キャラクターが居る場所と機械が指し示す場所に残す。
   **リンクだけは例外の扱いが要る**: 色を取り上げるかわりに**下線**で区別する。色だけに
   頼らないので、どのパックの `accent` が来てもリンクだと分かる
2. **枠を持たないのはキャラクターだけ。** 付喪神は器物に宿るのであって、ウィジェットの中に
   座っているのではない。**大胆さはこの1箇所に使い**、他の3領域は静かな枠のまま保つ
3. **機械が付けた名前は等幅、人が書いた言葉は本文書体。** タスクのID・ツール名・キー・モデル名・
   経過時間は等幅。レポートとセリフは本文書体。**装飾ではなく区別**で、等幅は「これは機械の側の
   名前だ」という情報を運ぶ
4. **読む面の幅は領域に任せる。** 本文の行長に上限は置かず、**1400px の窓で約 67 全角になる
   ことを承知のうえで選んでいる**（一度は上限 42 全角を置いていた。撤回の理由は
   `docs/history/decision.md`「design.md 13.1 Principles（原則4。行長の上限を撤回した経緯）」）
5. **意味を固定した色は誰が来ても変わらず、文字と対でだけ増やす。** ok / warn / ng / ask の
   意味がキャラクターごとに動くと、色が情報を運べなくなる。**色を1つ足してよいのは、その色が
   指すものに tsukumo が文字のラベルを必ず添えるときだけ** — モデルの書き忘れで消えない文字が
   付いていれば、色は読みやすさのための重ねがけになり、色だけで意味を伝えることにならない
   （2026-09-22 にレポートの `note` を6種に割り、6種すべてにラベルを出したうえで `state-ask` を
   足した）。ラベルを添えられないところでは色を足さず、**既にある色・地の段・枠・文字の印**で
   区別する

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
| `state-ask`  | `#8ab4e8`              | 疑問・未確認         | **固定**                       |

**既定値の選び方。** `accent` の `#f2b0a0` は**立ち絵の頬と耳から採った色**で、原則1を文字どおりに
した結果。地も中性の黒ではなく紫に寄せた暖色の黒で、淡いピンクの立ち絵と喧嘩しないように
してある。

**パックが差すのは `accent` 1つだけ**で、地と字は差さない。キャラクターごとに世界の色が変わる
案も検討したが、**読めるかどうかがパック次第になる**ので採らなかった（衣装ごとの差し色
`outfitAccents` は既にあり、そちらは立ち絵の中だけに効く）。

**コントラストの下限を守る。** `ground` と `ink` の組は、使う人が何を入れても本文が読める比を
下回らないところで止める。下回る値が来たら、受け取らずに既定へ落とす。

**この検算は画像には効かない。** キャラビューに敷く背景画像は、**覆い（`ground` 一色）の
不透明度の下限**で同じ保証を作る（13.8）。

**色付けが薄いのは色相ではなく地の段差。** 「機械の名前に地を敷いて区別する」仕組みは既にあり、
`ground` と `surface` の差が段差として見えていないだけだった。だから足すのは色相ではなく
**地の段**にする（測り方と数字は `docs/history/decision.md`「design.md 13.2 Color（色付けが
薄い原因の実測）」）。

**足すのは導出を1つだけ。差せるつまみは4つのまま。** 上の表に1行だけ加える:

| トークン         | 役割                                                   | 誰が差すか                                   |
| ---------------- | ------------------------------------------------------ | -------------------------------------------- |
| `surface-raised` | 本文の地の上に**浮く**小さな塊（機械の名前・結論の塊） | 固定（敷いた地に `ink` を1割**重ねて**導出） |

`surface-accent` と同じく**計算するだけの値**で、新しいつまみではない。割合は1割
（`surface` の上では比 1.31:1、その上の `ink` は 9.77:1）。

**混ぜるのではなく重ねる**（`color-mix(in srgb, var(--ink) 10%, transparent)`）。`surface` と
混ぜた不透明な色にすると、**浮く塊が浮く塊の中に入ったとき**に親と同じ色になって消える
（実測済み。やり取りの最後の本文は必ず最終レポートなので、その中のインラインコード・
表の見出し行・カードが全部沈む）。重ねる形なら `surface` の上での色は不透明に混ぜたときと
変わらず、どの段の上でも必ず1段上がる。

読む面の地はこれで3段になり、段がそのまま意味を持つ:

- **沈む（`ground`）** = 途中のもの・畳んだもの（中間レポート・`details`・コードブロック）
- **基準（`surface`）** = 本文
- **浮く（`surface-raised`）** = 機械の名前（インラインコード・`kbd` / `samp`）、表の見出し行、
  カード

**「Slack のような1行への色付け」に印は足さない。** **行を塗る記法は既に1つある**
（` ```diff ` の地を塗る色付け）。`report-notation.ts` に行を塗る印を足すと `badge` と意味が二重になり、色だけで意味を伝える入口に
なる（13.1 原則5）。代わりに、**意味を持つ塊の地を、既にある色で1割だけ染める**
（`color-mix(in srgb, var(--surface), var(--state-warn) 10%)` の形）。染めてよいのは
`state-*`（ok / warn / ng / ask）と `accent` だけで、**塊に文字のラベルが出ないなら色は足さない**
（13.1 原則5。1割の染めは地との比 1.19〜1.26:1、その上の `ink` は 10:1 以上を保つ）。

**`note` は6種（情報・注意・異常・疑問・メモ・お願い）に割り、種別のラベルを tsukumo が文字で
描く**（`markdown/notation.tsx`。2026-09-22）。色は 情報＝`ink` / 注意＝`state-warn` /
異常＝`state-ng` / 疑問＝`state-ask` / メモ＝`ink-quiet` / お願い＝`accent` で、**足したのは
`state-ask` の1つだけ**。情報とメモは同じ灰でも地の段で割れる（情報は浮く地、メモは地なし）。

**素の `note`（結論）は引用と見分けが付いていない。** どちらも灰色の 3px の縦罫で、地の差も無い
（`note` の縦罫は `ink-quiet`、引用の縦罫は `rule`）。**いちばん読ませたい印がいちばん弱い**
ので、`note` は縦罫を `ink` に上げ、地を `surface-raised` にする。引用は今のまま
（目立たせないための印）。

**コードの色付けは同梱のテーマのまま残す**（`highlight.js` の `github-dark`）。実測でページの中で
いちばん情報量が多く、読めている。ただし **Chart.js の軸と格子の色だけは16進が `theme.css` の外に
書かれている**（`markdown/chart-block.tsx`）ので、`--ink-quiet` / `--rule` の実効値を読んで渡す形に
直す。**色を足す話ではなく、外から来た色を減らす話**。mermaid は `theme: "dark"` のままにする。

**最終レポートに印を付ける。** 最終レポートの地は中間レポートと同じ `ground` にする
（ユーザー指摘 2026-09-21。地の段差では「途中 / 結論」を表さない）。中間レポートとの差は
枠（中間だけ破線）とラベルの2つで、**枠は既に他の情報（中間かどうか）を運んでいる**ので、
最終レポートだと分かるのは実質ラベル1つが支えている。最終レポートには次の1つを当てる:

- **ラベル「最終レポート」**。中間レポートのラベルと同じ段・同じ色（`--font-label`・`ink-quiet`）に
  置く。**同じやり取りに中間レポートが1つ以上あるときだけ出す** — 本文が1つしか無いやり取りでは
  「最終」が何も区別せず、内容を持たない行になる

**レポートの見出しと表に、キャラクターの色の線を1本ずつ通す。** 色が付くのは**罫線の側だけ**で、
文字は `ink`・地は `surface` / `surface-raised` のまま（13.1 原則1 は変えない）:

- `##`（`h4`）の**下の1本**（領域の幅いっぱい）
- `###`（`h5`）の**文字の幅だけの1本**（`width: fit-content`）。**段の深さを運ぶのは罫線の長さ**で、
  色は段の違いを運ばない（色だけに頼らない。13.1 原則5 と同じ構え）
- 表の**見出し行の下の1本**（2px。`border-collapse` で下の行の 1px に勝たせる太さ。同じ太さだと
  どちらの色が残るかが文書順まかせになる）

**素の `accent` ではなく `rule` に6割混ぜる**（`color-mix(in srgb, var(--rule), var(--accent) 60%)`。
`surface-accent` / `surface-raised` と同じく**計算するだけの値**で、新しいつまみでもトークンでも
ない）。レポートの中で何度も出る線なので、素のまま出すと**差し色が地の色になって何も指さなく
なる** — 素の `accent` は縦罫の2つ（依頼の見出し・お願い）に残し、仕切りの線はその一段下に置く。
**入れるのはこの3本だけ**で、`hr`・`details` の枠・カードの枠・引用の縦罫・`report-stat` の枠は
`rule` のまま（全部に入れると上と同じことが起きる）。

**使うのは `accent`（パックの色）で、`outfitAccents`（衣装ごとの差し色）ではない。**
衣装の差し色は `<Portrait>` が立ち絵の要素に置く CSS 変数（`--outfit-accent`）で、**レポートの
側には届かない**。届かせる配線を足しても、衣装を変えるたびにレポートの線の色が動く。
**パックが差すのは `accent` 1つ、`outfitAccents` は立ち絵の中だけ**というこの節の決定をそのまま
使う。

**採らなかった案**（つまみを足す・行を塗る印を記法に足す・`highlight.js` のテーマを作り直す・
見出しの文字に色を当てる・最終レポートの枠を `accent` の縦罫にする）の理由は
`docs/history/decision.md`「design.md 13.2 Color（採らなかった案）」。

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

- 段は**この4つだけ**。これ以外の寸法を足さない
- **本文の行間は 1.75**（日本語で長時間読むため、欧文の既定より広く取る）
- **本文の行長に上限は置かない**（13.1 原則4）。レポートは段落も表も `.main-step` の内幅を
  そのまま使い、
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
- **パック（背景）**: `character.json` の `background`（素材のファイル名と覆いの不透明度）。
  **効くのはキャラビューだけ**で、無ければ背景画像は出ない（13.8）
- **使う人**: `ground` / `surface` / `ink` の3つ。**キャラクター画面から変え、
  `localStorage` に持つ**（13.6）
- どちらも、届いた値は**境界で検証してから CSS 変数に流す**（外部由来の値の扱いは
  `docs/coding-standards.md`）

### 13.6 設定の置き場所

**今回のことはサイドバーに、それ以外はキャラクター画面に**（2026-09-17 決定）。画面から変えられるものを
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
| キャラクターの背景                               | **ずっと**（同上）                                           | キャラクター画面                     |
| 新しいパックを作る                               | **ずっと**（同上）                                           | 作る画面（キャラクター画面から入る） |

**キャラクターの切り替えは「セッション限り」から「ずっと」へ移したわけではない。** 選ぶ操作自体は
今回どおりセッション限り（起こし直すと戻る）だが、**次に起こしたときの初期値としては覚える**
（2026-09-14 決定。ユーザーの指摘「終了直前のキャラクターで起動時にもそうであってほしい」）。
持ち先は `localStorage` ではなく `~/.tsukumo/state.json`（`adapter/remembered-character.ts`、5章）。
**cwd には依存させない**（キャラクターの好みはプロジェクトごとではないため）。置き場所（サイドバー
「セッション情報」）は変えない。

**覚えるのは「画面から名前が選ばれた」ときだけ**（2026-09-21 決定。2026-09-14 の決定は覆していない
— 覚える範囲を、当時からそのつもりだった「画面から選んだとき」に絞り直しただけ）。**起こし方は
3つあり、どれで来たかで覚えるかが決まる**:

| 起こし方           | これから起こすパック                 | 覚えるか   |
| ------------------ | ------------------------------------ | ---------- |
| 起動               | 初期パック（指定 > 覚えた値 > 既定） | 覚えない   |
| `switch-character` | 画面から選ばれた名前                 | **覚える** |
| `set-chat-mode`    | いま出しているパックのまま           | 覚えない   |

**`set-chat-mode` は覚えない**（2026-09-21 に直した）。それまでは「起こし直しに使うパック」を
「画面から選ばれた名前」と同じ欄で渡していたので、**モードを切り替えただけで
`~/.tsukumo/state.json` の覚えたキャラクターが書き換わっていた**（`TSUKUMO_CHARACTER` の使い捨ての
パックも、同梱の既定も、雑談へ入った瞬間に「前回のキャラクター」になっていた）。`core` の
コメントは当時から「覚えるのは画面から選んだときだけ」と書いてあり、**実装と食い違っていた。**
直し方は**2つの意味を型で分ける**こと（`CharacterSelection`。初期パック／画面から選ばれた名前／
いま出しているパックのまま の3つ。`src/server/core/character-selection.ts`）。「いま出しているまま」は
名前を運ばないので、画面から選ばれたのと取り違えようがない。

- **同じパックを画面から選び直したときは覚える**（変えない）。画面から選ぶのは明示の操作なので、
  値が同じかどうかで扱いを分けない
- **`TSUKUMO_CHARACTER` を指定していても、画面から選べば覚える**（変えない）。環境変数が
  勝つのは**起動時にどのパックで起こすかを読むとき**だけで（指定 > 覚えた値）、画面からの明示の
  選択に負ける理由にはしない。その回だけ試したいなら、切り替えずに起こしたまま使う

**割るのは保存先ではなく「読んでいる最中に触るか（セッション限り）／腰を据えて整えるか
（それ以外）」**（そうした理由は `docs/history/decision.md`「design.md 13.6 設定の置き場所
（保存先ではなく寿命で割る理由）」）。保存先の違いは画面の中の並びで表す: パックの持ち物
（立ち絵・差し色）が上、利用者の設定（画面の色）が下。添え書き（「この端末だけ」のような）は
出さない。

**キャラクター画面は会話の画面と入れ替わる**（重ねない。2026-09-17 決定。ユーザー「SPA のような
ものを想定していたよ」）:

- **切り替えは `location.hash`**（`#character` / `#character/new`。無ければ会話の画面）。
  `stores/screen.tsx` の `useScreen()` が `hashchange` を読む（`useSyncExternalStore`）。
  リロードしても同じ画面に戻り、ブラウザの「戻る」が効き、`bun run dev` の再読み込み
  （`lib/refresh.ts`）でもキャラクター画面に留まれる。サーバの経路は増えない（`?token` はそのまま）。
  **ルーターのライブラリは入れない**（画面は3つで、分岐は hook 1つで足りる）
- **会話の画面は外さず `hidden` で隠す**（6.1「部品を外すのではなく隠す」と同じ）。
  `<SessionProvider>` はその上に居るので会話は進み続け、入力欄の下書き・選んでいるターン・
  スクロール位置も残る。戻ったときにセリフとレポートが追いついているかは目視で確かめる
  （吹き出しの追従は領域の高さに依存するため）
- **答え待ちが来たら戻る口に印を出す**（`state.pending` が空でないとき「答え待ち」を
  `state-warn` で。色だけにしない）。タブのタイトルの印は隠れていても効いている
- **入る口はサイドバーのキャラクターの行**（`<select>` の右に字だけのリンク「整える」。色は `ink`、
  下線で区別。13.1 原則1）。キャラクターのことはキャラクターの行に集まる。
  **ページ最上部のナビは置かない**（画面が3枚以上になったら検討し直す）
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
背景      ▭ いまの背景  [差し替える]  [消す]
画面の色  ■ 画面の地  ■ 領域の地  ■ 字の色
```

- **並びは上から** 戻る口 → パックのラベルと名前（名前は等幅。13.1 原則3）と「新しく作る」 →
  立ち絵の並び → 差し色 → 背景 → 画面の色。パックの持ち物が上、利用者の設定が下（上の「並びで表す」）
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
- **背景の行は「差し替える」と「消す」の2つだけ**（いまの背景を行の左に小さく出す）。
  **覆いの濃さは画面から変えない**（定義ファイルを手で直す。13.8）

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
- **画面の分け方・入る口・並べ方で採らなかった案**は `docs/history/decision.md`
  「design.md 13.6 設定の置き場所（採らなかった案）」

- 色は**境界で検証してから** CSS 変数に流す（13.5）。読めない組み合わせが来たら受け取らずに既定へ落とす
- サイドバーは**3区画のまま**（`docs/requirements.md` 4.2 の決定を変えない）

### 13.7 雑談モードの画面

**雑談中はメインビューが「立ち絵と会話のログ」になる**（2026-09-20 決定）。モードそのものの
決定（入れる理由・何が変わるか・切り替えに起こし直しが要る理由）は `docs/requirements.md` 4.9 が
持ち、ここは**見え方と置き場所だけ**を書く。

```
┌──────────────────────────────────┬──────────────────┐
│ メインビュー（雑談）                 │ サイドバー         │
│                                  │ いま何をしているか  │
│    ◯     ╭──────────────╮        │ タスク一覧         │
│   立ち絵   │ セリフ        │        │ セッション情報     │
│   （大）   ╰──────────────╯        │  … ［仕事｜雑談］  │
│           ╭──────────────╮        │                  │
│           │ 利用者の発言   │        │                  │
│           ╰──────────────╯        │                  │
│           （古い→新しいが縦に積む）   │                  │
└──────────────────────────────────┴──────────────────┘

   キャラビューは畳む（立ち絵が上へ移る） ┌──────────────────┐
                                     │ 入力欄            │
                                     └──────────────────┘
```

- **立ち絵は左、会話のログは右**（2026-09-20、ユーザーの選択）。ログは LINE / Discord と同じく
  **古い→新しいの順に縦へ積み**、利用者の発言とキャラクターのセリフが交互に並ぶ。
  仕事のときのメインビュー（依頼の見出しでやり取りを区切り、タブで遡る）とは並びの規則が違う
- **キャラビューの領域は雑談中は畳む。** 立ち絵がメインへ移るので、残しても空の帯になる。
  吹き出しもメインのログが引き受ける。**4領域が3領域になるのは雑談の間だけ**で、
  仕事へ戻せば 13.4 の形に戻る
- **メインビューの領域は雑談中だけ枠と角丸を外し、背景（13.8）もそこへ移る**（2026-09-21 決定。
  ユーザーの指示「雑談モードで、メイン画面に背景を設定したい。設定する背景は仕事モードの背景と
  同じでかまわない」）。立ち絵と会話が移ってきたこの領域は**畳んだキャラビューと同じ立場**になり、
  ウィジェットの中ではなく `ground`（絵があればその絵）の上に直接立つ。**仕事へ戻せば枠も角丸も
  戻り**、背景はキャラビューへ帰る
- **立ち絵はメインでも枠と地を持たない**（13.1 原則2。居る場所が変わっても原則は変わらない）
- **会話のログは `speak` のセリフから作る。** `shared/main-view.ts` の `mainViewEntries` は
  セリフの記録を落とし続け、**雑談のログは `shared/chat-log.ts` の `chatLogEntries` が
  別に組む**（2026-09-20、プロトタイプで確かめて決めた）。`mainViewEntries` は依頼を境目に
  やり取りへまとめてタブで遡る形を作っており、**素直な時系列で積む雑談とは並びの規則が違う**
- **ログに並ぶのは雑談のセッションのぶんだけ**（2026-09-20 決定。`docs/requirements.md` 4.9）。
  雑談と仕事は**セッションの印から分かれていて**（`tsukumo:<パック名>:chat`）、雑談へ入る
  起こし直しが `resume` するのは前の雑談。**仕事の会話はログに混ざらず**、仕事へ戻した
  メインビューにも雑談は出ない。**ログの組み立てで仕切っているのではない** — 組む前の段階で
  別の履歴になっている。**そのパックで初めて雑談へ入るときはログが空から始まる**（印が付くのは
  ターンが終わって数秒あとなので、続きにするものが無い。理由と受け入れた判断は 4.9）
- **利用者の発言に添えた画像の控えは、吹き出しの中に並ぶ**（`docs/requirements.md` 4.10。
  LINE / Discord と同じ見え方になるのはここ）。控えは押せない
- **読む面の原則（13.1 原則1）はログにも効く。** 話者を分ける縁や印には `accent` を使ってよいが、
  **セリフの文字そのものは `ink`**。長い往復でも濃さが変わらない
- 寸法は 13.3 の段のまま（セリフは本文の 0.9375rem）。**立ち絵とログの比率はプロトタイプで
  目視して決めた**（2026-09-20、1400x900 で実測）: 立ち絵は領域の高さの 80%・幅の上限 32%、
  ログが残りで、**下端から積む**（件数が少ないうちに上へ貼り付くと立ち絵の高さと話が合わない）。
  狭い画面（760px 以下）は高さ 76%・幅の上限 28%
- **雑談中も上下の仕切りを出し、入力欄の高さを掴んで変えられるようにする**（2026-09-20 決定）。
  **既定は仕事のときの比率（`split.rowTop`）をそのまま使い**、雑談で動かした比率は
  `Split` の `collapsedRowTop` に別で覚える。どちらのモードで動かしても相手の比率は動かない。
  **`collapsedRowTop` は「まだ動かしていない」を `undefined` で表す** — 初期値として
  `rowTop` をコピーすると、あとから仕事の比率を変えたときに雑談側が追随しなくなる
- **キャラクターから話しかけてもらうボタンを、ログの末尾に1つ置く**（2026-09-21 決定。
  ユーザーの指示「雑談モードで、キャラ側が話題を決めて話しかけるトリガー(ボタン)を実装したい」）。
  押すと tsukumo が合図を1つ送り、**返ってきたセリフだけがログに並ぶ**。字は「話しかけてもらう」
  - **送った文面はログにも記録にも残さない**（2026-09-21、ユーザーの選択）。**落とすのは組み立ての
    側ではない** — 駆動が `request` の代わりに**文面を持たないイベント**（`turn-started`）を流すので、
    雑談のログ（`shared/chat-log.ts`）にも仕事のメインビュー（`shared/main-view.ts`）にも雑談の
    会話のアーカイブにも**初めから流れようが無い**。上の「ログの組み立てで仕切っているのでは
    ない」と同じ立場で、組む前の段階で決まっている。**アーカイブが書くのは `request` と `speech`
    の2種類だけ**なので、ここも別に除外を足す必要が無い
  - **話題は tsukumo が持たない**（原則4）。送る一言は「話題はあなたが選ぶ」という合図だけで、
    候補も例も傾向も並べない（`src/server/core/chat-nudge.ts`。雑談の作法を持つ
    `chat-manner.ts`・`/compact` の文面を持つ `chat-compact.ts` と同じ切り分けで、**core が持つ**）
  - **置き場所はログの末尾**（立ち絵の下でも、ログの外の帯でもない）。**枠は増えない** —
    区画も帯も作らず、増えるのは操作子1つだけで、13.1 原則2 が守っているのは枠のほう。
    セリフと同じ左側に、地を持たない字だけの操作子として出す。**ログが空のときは案内のすぐ下に
    出る**ので、最初の一言をこちらから促せる（雑談を始める場面がいちばん要る場面）
  - **`ground` 一色を1枚だけ地に敷く**（2026-09-21。空のときの案内も同じ）。背景がメインへ移った
    ので、地を持たないままだと**絵が字の背後へ回り込む**（13.8「読めることをどう守るか」の2）。
    敷く色が領域の地と同じなので、**背景の無いパックでは見え方が変わらない**（「地を持たない
    字だけの操作子」のまま）
  - **ターン進行中は押せない**（モードの `<select>` と同じ立場。理由の文面もサーバが断るときと
    同じ定型文を使う）。**雑談のときだけ**で、仕事のメインビューには出ない（`<ChatView>` 自体が
    雑談の間しか出ない）うえ、**サーバも雑談でなければ断る**（画面を経ない依頼の取りこぼし対策）

#### 会話を遡る

**ふつうのスクロールだけで遡る**（2026-09-20 決定）。持っているぶんは最初から全部ログに並べ、
上へスクロールすれば古い方が出る。**枠も操作子も増やさない**（13.1 原則2）。
「もっと見る」を置く案・上へ着いたら継ぎ足す案は、どちらも操作子か仕掛けが1つ増えるので
採らなかった。持つ幅（雑談は 100 ターン）は `docs/requirements.md` 4.9 が決める。

**セリフの行を押すと、そのときの表情へ立ち絵が遡る**（2026-09-21。キャラビューが過去のターンの
タブでやっていることの、雑談での対応物。遡る先が「ターン」ではなく「1件のセリフ」なのは、
雑談のログが依頼で区切られていないため）。**立ち絵の動きは遡らない**（キャラビューと同じ扱い）。

- **押せるのはキャラクターのセリフの行だけ。** 利用者の発言は遡る先の表情を持たないので、
  押せる要素にしない（押しても何も起きない）
- **セリフはドラッグで選んでコピーできる**（2026-09-21 ユーザーの指示）。そのため**押せる行は
  `<button>` ではなく `role="button"` の `<div>`** — ブラウザは `<button>` の中の文字を
  `user-select` を何にしても掴ませない（2026-09-21、実機の Chromium で確認）。
  **選び終えて手を離した瞬間にも click は飛ぶ**ので、押し始めからの距離で「押した」と
  「選んだ」を見分ける（いま選ばれている文字は見ない。選択が消えるのは手を離したあとなので、
  見ると押せない回ができる）。キーボード（Tab → Enter / Space）で遡る道は自前で開ける
- **選んだ行は、いまある地と縁を強めて示す**（地を差し色の側へ寄せ、内側の影で縁を1px 重ねる）。
  **印も操作子も増やさない**（13.1 原則2）し、縁を太らせない（行の高さが動いて並びがずれる）
- **利用者が解くなら、同じ行をもう一度押す**の1つだけ。最新へ戻る専用のボタンは置かない
- **新しいセリフが来たら選択は解け、立ち絵は新しいセリフの表情へ戻る**（2026-09-21 決定）。
  **下端付近に居るかどうかでは分けない** — 自動スクロールの規則とは揃えず、立ち絵は常に
  「いまのセリフ」を表す側へ倒す。解けないままにすると、印の付いた行はログが伸びるうちに画面の
  外へ流れるので、**なぜ表情が古いのかが画面から分からなくなる**（一度押すと以後の新着に
  追従しなくなっていた。2026-09-21 に直した）。窓から古い記録が落ちて並びが前へ詰まったときも
  同じく解ける（番号で持った選択が別の行を指さない）

**`justify-content: flex-end` で「下端から積む」を作らない。** column flex で
`justify-content: flex-end` にすると溢れた分が block-start（上）側へ出るが、**CSS の
scrollable overflow は end 方向にしか伸びない**ので、上へ出た分はクリップされて掴めなくなる。
`.chat-log > * { flex-shrink: 0 }` は
この手当てにならない（原因は縮みではなく overflow の向き）。**「下端から積む」は別の手段で
作る**（先頭の子に `margin-top: auto` を当てる、など）。

**自動スクロールは下端付近に居たときだけ寄せる。** 件数が変わるたび無条件に
`scrollTop = scrollHeight` を当てると、**読み返している最中に下へ攫う**（実測と、直す前の
`ChatLog` の姿は `docs/history/decision.md`「design.md 13.7 会話を遡る（下端から積む・
自動スクロールの実測）」）。

#### モードの操作子はどこに置くか

**サイドバーの「セッション情報」**（13.6 の表にそのまま当たる）。雑談モードは**セッション限り**で、
切り替えると駆動を起こし直すところまでキャラクターの切り替えと同じ性質を持つ。
**枠は増えない** — 既にある区画の中に1つ足すだけで、常設のボタンも新しい区画も作らない
（13.1 原則2、13.6「サイドバーは3区画のまま」）。切り替えは起こし直しなので、
**ターン進行中は押せない**（キャラクターの `<select>` と同じ理由・同じ文言）。

### 13.8 背景

**枠を持たない領域にだけ背景画像を敷ける**（2026-09-21 決定。ユーザーの問い「メイン画面、キャラ画面は
背景をカスタマイズできたほうが楽しいと思ったけどどうかな?」）。いまそれに当たるのは
**キャラビューと、雑談中のメインビュー**の2つ。**背景はキャラクターパックの
持ち物**で、キャラクターを切り替えると背景も入れ替わる。

**置き場所と効く範囲はユーザーが先に決めた**:

- **パックの持ち物にする**（`character.json`。`localStorage` の「利用者の設定」には持たない）。
  精霊なら森、というようにキャラクターと背景は一緒に決まるもので、置き場所を2つに割ると
  「森の精霊にサーバルームの写真」という組み合わせが作れてしまう。切り替えで丸ごと入れ替わる
  ほうが、パック＝1つの世界という7章の形にも合う
- **効かせるのは読む面以外だけ。** はじめは**キャラビューだけ**に絞った。主な仕事は長く
  読み続けることなので（13章）、**読む面の地は誰が来ても同じ**にする（13.1 原則1 の延長。
  元の問いは「メイン画面とキャラ画面」だったが、長く読み続ける面の可読性を優先して絞った）
- **雑談中のメインビューはあとから足した**（2026-09-21 決定。ユーザーの指示「雑談モードで、
  メイン画面に背景を設定したい。設定する背景は仕事モードの背景と同じでかまわない」）。
  **絞った理由と衝突しない** — 雑談の間そこは読む面ではなく**立ち絵の居る面**で、畳んだ
  キャラビューの行き先そのものだから。**サイドバー・入力欄・仕事モードのメインビューには
  敷かない**（読む面の地は変えない、は変えない）

#### 何を持つか

`character.json` に `background` を1つ足す（`outfitAccents` と同じ階層）:

```json
{
  "background": {
    "image": "background.png",
    "veil": 0.75
  }
}
```

| キー    | 中身                                                                 | 省略したとき         |
| ------- | -------------------------------------------------------------------- | -------------------- |
| `image` | 素材のファイル名（`portraits` と同じ書き方。`/character/<file>` へ） | **背景画像は出ない** |
| `veil`  | 覆い（`ground` 一色）の不透明度。0.7〜1                              | `0.75`               |

- **`background` ごと無ければ、いまと同じ見え方**（`ground` の上に立ち絵が直接立つ）。省略は
  「背景なし」であって既定の絵に落ちるのではない（**素材はリポジトリに同梱しない**。
  `docs/requirements.md` 2.2）
- **`veil` が下限を下回る値なら下限へ引き上げる**（受け取らずに既定へ落とす `accent` と違い、
  背景は「出さない」より「薄く出す」ほうが書いた人の意図に近い）。`veil: 1` は画像が見えない
  安全側の端で、実用の帯は 0.7〜0.9

#### 読めることをどう守るか（覆いの下限）

**画像の上に文字を乗せない**ようにし、そのうえで**地そのものの明るさに下限**を置く。どちらも
数で決める:

1. **覆いの不透明度 `veil` は 0.7 以上。** 画像は `ground` 一色の覆いの下に敷き、**見えるのは
   最大でも 30%**。加えて、**画像が真っ白（`#ffffff`）・真っ黒（`#000000`）だと仮定して合成した
   地**が `ink` との比 `MIN_CONTRAST`（4.5。`src/browser/features/character-screen/appearance-color.ts`）を
   下回らないところまで `veil` を引き上げる。**画像の中身を1ピクセルも読まずに検算できる**のは、
   合成した色が必ず `ground` と画像の色を結ぶ線分の上に来て、その線分の端がいちばん危ない色
   （真っ白・真っ黒）だからである。`ground` と `ink` の比は 13.2 の境界がすでに 4.5 以上に
   保っているので、`veil: 1` まで上げれば必ず満たせる（＝引き上げが行き止まらない）。
   **雑談中のメインビューでも同じ論法がそのまま成り立つ**（地と字の色は領域で変わらないので、
   下限も 1つで足りる。2026-09-21 に確かめた）
2. **文字が乗る要素の地は不透明を保つ。** キャラビューで文字が乗るのは吹き出しの中だけなので
   （空のときの案内も吹き出し1件。`src/browser/features/character-view/balloon-track.tsx`）、
   地が不透明であれば画像は文字の背後に回り込まない。**雑談のログでも吹き出しは同じ**
   （`.chat-entry` の地は `surface` / `surface-accent` / それに `ink` を混ぜた色で、どれも不透明）
   だが、**吹き出しの外に出る字が2つある** — 「話しかけてもらう」と空のときの案内。
   この2つには **`ground` 一色を1枚だけ敷いた**（2026-09-21。雑談用に `veil` の下限を別に持つ
   のではなく、字の側を守る。敷く色が領域の地と同じなので、背景の無いパックでは見え方が
   変わらない）

下限が 0.7 なのは、既定の3色で**境目が 0.66 だから**。既定を 0.75 にするのは、下限ちょうどに
置くと `ink` を少し変えただけで引き上げが起きて、書いた `veil` と見え方がずれるため。
**見直すのは既定の3色を変えたとき**で、そのときの測り方と数字は `docs/history/decision.md`
「design.md 13.8 読めることをどう守るか（覆いの下限の実測）」にある。

**過去の吹き出しは要素の `opacity` で薄めない。** 要素ごと半透明にすると**吹き出しの地ごと
透ける**ので、背景画像が文字の裏へ回って上の2が崩れる（`veil` をいくら上げても届かない）。
**地は不透明な `surface` のまま、文字の色だけを地へ混ぜて薄める**ことにし、**混ぜる量の
上限は 45%**（50% では下限を割る）。

#### どう敷くか

- **敷く先は枠を持たない領域そのもの**（`.layout-ground`。キャラビューと、雑談中のメインビュー。
  **2つの領域が同じ class を共有する**ので、覆いの式はここ1箇所にしか無い）。**枠も角丸も付けない**
  （13.1 原則2 の「枠を持たないのはキャラクターだけ」は変えない — 背景は**ウィジェットの地**では
  なく、`ground` がその領域だけ絵に替わったものとして扱う）
- CSS は**覆いを1枚重ねた形で書く**（`linear-gradient()` に `ground` を `veil` の不透明度で
  2回並べ、その下に `url(...)` を重ねる）。`background-size: cover`、
  `background-position: center bottom`。
  **下端を合わせる**のは、立ち絵が床に立つ見え方（`--portrait-drop`）と地面の位置をそろえるため
- 画像の URL は立ち絵と同じ `/character/<file>` で、**取り直しの印（`?v=`）も同じ**（7.1）。
  配る側に足す経路は無い
- **雑談モードでは背景がメインビューへ移る**（2026-09-21 決定。ユーザーの指示「雑談モードで、
  メイン画面に背景を設定したい」。**もとは持ち込まない決定だったのを撤回した**）。
  キャラビューの領域は畳む（13.7）が、立ち絵と会話がメインへ移るので背景も一緒に移り、
  その間だけメインの枠と角丸が外れる。**素材は仕事モードと同じ**（パックの `background` 1つ。
  雑談用の別のキーは持たず、時刻や天気で切り替えもしない）。**`background-size` /
  `background-position` も同じ値**（`cover` / `center bottom`。メインは横長なぶん cover が左右を
  削るだけで、立ち絵が床に立つ位置と地面は合ったまま）。どちらの領域を地にするかを決めるのは
  入口（`src/browser/main.tsx` が `<Layout>` に `mainAsGround` を渡す）で、**`<Layout>` は
  「なぜ地になるのか」を知らない**（13.7 の `collapseCharacter` と同じ立場）
- **キャラクター画面（`#character`）にも敷かない。** 立ち絵が最大6体並ぶ面で、どれも枠と地を
  持たない（13.6）ため、背後に絵があると輪郭が混ざる数がキャラビューの6倍になる。整える面は
  静かなままにする

#### 画面からの差し替え

**キャラクター画面のパックの持ち物の並びに「背景」の行を1つ足す**（13.6）。口は「差し替える」と
「消す」の2つだけで、**覆いの濃さは画面から変えない**（濃くしたい人は定義ファイルを手で直す。
表示名を日本語にしたいときと同じ扱い。7.1）。常設の操作子は増えない（13.1 原則2）。
受け取り方・上限・書き込み先は 7.1 のままで、`ClientCommand` に `set-background` /
`clear-background` を足す。

#### 採らなかった案

色の延長で済ませる・`localStorage` に持つ・4領域すべてに効かせる・画像の明るさを測って覆いを
自動で決める・別の経路（POST）で受け取る・枚数の上限を増やす、の6つは採らない。理由は
`docs/history/decision.md`「design.md 13.8 背景（採らなかった案）」。
