# 設計書（描く層をブラウザ側へ移す）

最終更新: 2026-09-13（起こした日。**移行の決定は同日**。経緯と採らなかった案は
`docs/research/architecture-rethink.md`）
ステータス: **正典**。構造は `shared` / `server`（`core` と `adapter`）/ `browser` の3層 +
`src/` 直下の配線（`docs/architecture.md`「現在の実装状況」）。**残っているのは
キャラクターパック（7章）の段だけ**で、`develop/tasks.json` 側の別タスクとして進める。
移行の段階そのものの記録は `docs/history/decision.md`「design.md 12. 移行の段階」にある。
**13章「画面のデザイン」は `docs/screen-design.md` へ移した**（2026-09-23。節の番号 `13.x` は
そのまま）。この設計書の中でファイル名を添えずに `13.6` のように書いた番号は、そちらの節を指す。

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

| 節                             | 中身                                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| ## 1. 何を変え、何を残すか     | 決定の要約。**最初にここ**                                                                                               |
| ## 2. 全体構成                 | 層（shared / server / browser）の図、依存の向き、ディレクトリ                                                            |
| ## 3. 動きの流れ               | 起動・接続・依頼・答え待ち・再接続の順序                                                                                 |
| ## 4. shared                   | **両側が共有する契約**。イベント・状態・reducer・コマンド・フレーム・版                                                  |
| ## 5. core と adapter          | サーバ側のモジュールと責務。判断（core）と外の世界に触る境界（adapter）                                                  |
| ## 6. browser                  | ブラウザ側の部品の木、状態の持ち方、Markdown、重いライブラリ、立ち絵の動き                                               |
| ## 7. キャラクターパック       | `character.json` + `persona.md` + 素材。人格の注入と切り替え、書き戻し、雑談の要約とアーカイブ、パックの一覧と素材の URL |
| ## 8. セッションの復元と複数化 | 復元（4.8）を新しい形に載せる。複数セッションへ広げる余地                                                                |
| ## 9. 会話内容と安全           | `127.0.0.1`・Origin・起動トークン・ディスクに書く2つの例外と直近を読み戻す口・ブラウザ側のメモリ                         |
| ## 10. テスト                  | reducer・スキーマ・部品・fake driver + Playwright・層の検査                                                              |
| ## 11. ビルドと依存            | `bun build` の入口、tsconfig、**足す依存の一覧（承認済み）**                                                             |

## 1. 何を変え、何を残すか

**変えるのは「描く」層の重心だけ。** サーバが HTML 文字列を組み立てて Server-Sent Events で押し、
ブラウザが Idiomorph で当てる形をやめ、**両側が共有する型付きプロトコルでイベントを押し、
ブラウザ側の React の部品が状態から描く**形にする。言語は TypeScript のまま、ランタイムは当面 Bun
（Node で動く形を保つ）。

| 残すもの                                                                                                                       | 変えるもの                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Agent SDK で Claude Code を動かす。SDK を import する場所を `adapter/` 直下の `sdk-` で始まるファイルに閉じる                  | サーバ側の HTML 組み立て（`presentation/view.ts`）→ ブラウザ側の部品           |
| `speak(text, expression)` の MCP ツール。戻り値は `"ok"` だけ                                                                  | SSE 5本 + POST 6本 → WebSocket 1本（フレームとコマンド）                       |
| `SessionEvent` の union と `applySessionEvent` の純粋な畳み込み                                                                | 自前の Markdown レンダラとサニタイザ → unified（remark / rehype）              |
| 答え待ちの列（`canUseTool` の Promise を保留する）                                                                             | 4層（domain / usecase / presentation / infrastructure）→ 3層                   |
| 会話をプロセスの外へ出さない。`127.0.0.1` だけ。ディスクに書かない                                                             | キャラクター定義 → 人格を含む**パック**                                        |
| 起動時は組み立て済みの成果物（`dist/browser/`）を読むだけ（束ねるのは `bun run build`。2026-09-21 に起動時の組み立てをやめた） | 1プロセス = 1セッション固定 → 起こし直せる `SessionManager`（セッションは1つ） |
| ホストのポート（`showView` 1つ）と Orca のアダプタ                                                                             | HTML の文字列一致のテスト → 部品のテストと fake driver                         |

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
│   sdk-*（SDK）／ fake-driver（疑似セッション）                │
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

| 層               | 置くもの                                                                                                                                                                                                                                                                          | import してよい先                 | 実行場所         |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ---------------- |
| `shared`         | 概念の語彙・`SessionEvent`・`SessionState`・`applySessionEvent`・コマンドとフレームの zod。**`SessionState` から純粋に導けるもの**も含む（ブラウザしか読まないものを含む。`main-view.ts` `turn-step.ts` `turn-speech.ts` `portrait-motion.ts` `room.ts` `command-suggestion.ts`） | `shared` のみ（`zod` は可）       | サーバとブラウザ |
| `server/core`    | サーバ側の純粋な判断。セッション管理・駆動の契約・イベントの検証・ポートの決定・設定の解釈                                                                                                                                                                                        | `shared` / `core`                 | サーバ（Bun）    |
| `server/adapter` | 外の世界に触る場所。SDK・WebSocket・HTTP・ホスト・ファイル・子プロセス・fake driver                                                                                                                                                                                               | `shared` / `core` / `adapter`     | サーバ（Bun）    |
| `browser`        | React の部品・hooks・CSS・Markdown の変換                                                                                                                                                                                                                                         | `shared`（React などの npm は可） | ブラウザ         |
| `src/` 直下      | 配線（composition root。`cli.ts` / `main.ts` と起動の段取り）                                                                                                                                                                                                                     | すべて                            | サーバ           |

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
    session-choice.ts         切り替え先として選べるセッション1件（サーバとブラウザの両方が読む契約）
    session-default.ts        新しいセッションの既定（モデル・許可モード。次に起こすときの初期値）
    session-socket.ts         WebSocket の経路名とトークンのクエリ名（サーバとブラウザの両方が同じ値を見る）
    main-view.ts              メインビューに出す形（MainViewEntry）と、ターンごとのまとめ
    turn.ts                   記録を依頼の区切りでターンに割る（割り方の唯一の持ち主。4.2）
    turn-step.ts              「依頼の手順」を確定した記録（SessionRecord）から導く純関数
    turn-speech.ts            ターンごとのセリフと表情を確定した記録（SessionRecord）から引き直す純関数
    portrait-motion.ts        立ち絵をいま動かしてよいか・どれで動かすかを決める純関数
    command-suggestion.ts     入力欄の / 補完に出す候補（姿から導くだけ）
    command.ts                ClientCommand（zod）
    frame.ts                  ServerFrame（zod）・PROTOCOL_VERSION
    vendor-asset.ts           外部ライブラリ（npm の依存）を配る経路の名前
    expression.ts / question.ts / pending-ask.ts / task-summary.ts / character.ts
                              語彙（いまの domain のうち、両側が使うもの）
    character-definition.ts   character.json そのものの形。解析と、1件を重ねた書き戻しの文字列
    character-asset.ts        /character/<pack>/<file> の URL の組み立てと読み分け・取り直しの印・拡張子による仕分け
    character-background.ts   キャラビューに敷く背景（character.json の background から導く）
    expression-choice.ts      speak が選べる表情とラベル（ラベルの出どころは定義ファイル）
    image-data-url.ts         画面から届いた画像1枚の data URL の受け渡しの形（立ち絵・背景・依頼の画像で共有）
    portrait-image.ts         画面から届いた立ち絵1枚（data URL）の受け渡しの形
    prompt-image.ts           依頼に添える画像（貼り付け・ドロップで届く data URL）
    persona-memory.ts         覚えたこと（persona.md の節）に関わる、両側が見る値（1行の長さの上限）
    chat-log.ts               雑談モードの会話のログ（セッションの姿から導くだけ）
    context-usage.ts          いまのセッションのコンテキストの内訳と、配る経路の名前
    context-usage-record.ts   コンテキストの内訳を記録に残すときの形（1行 = 1セッション）
    token-usage.ts            トークン消費の記録の形（型だけ）
    token-usage-summary.ts    トークン消費の集計（期間で切って軸ごとに畳んだ形）と、配る経路の名前
    repository-file.ts        ファイル一覧の経路名と読み取り（入力欄の @ 補完。両側が見る）
    room.ts                   部屋の名前（ビューのポート1つ＝部屋1つ。語彙と、語彙の外の名乗り方。13.9）
    blank-text.ts             本文が読める文字を1字も持たないかを判定する純関数（ゼロ幅スペース等も空扱い）
    background-task.ts        背景のタスク（ターンのあとも claude が動かし続けているもの）の語彙（型だけ）
    japanese-prose.ts         本文の地の文が日本語かを判定する純関数（英訳の締めに最終レポートの席を渡さない）
  server/                     サーバ（Bun）側。判断（core/）と境界（adapter/）の2段
    core/                     サーバ側の純粋な判断。node: / SDK / ws を import しない
      session-driver.ts       駆動の契約（SessionDriver / SessionDriverOptions と既定値）だけ
      session-manager.ts      セッション1つの { generation, state, subscribers }。reducer をサーバ側でも回す
      event-batch.ts          届いたイベントをまとめて配る束（間隔と、書きかけの本文の連結）
      driver-command.ts       起き上がっている駆動に1件頼む（受け付けたかどうかの返し方 DispatchResult も）
      chat-archive-entry.ts   届いたイベント1件を雑談の会話のアーカイブの1行に変える（残すのは依頼とセリフだけ）
      session-launch.ts       起こす一続きの順序（外に触る部分は session-start.ts が渡す。起動も切り替えも同じ）
      character-selection.ts  どのパックを出すかの順位（一覧を作るのは adapter/character-pack.ts）
      pending-answer.ts       答え待ちの列（SDK の型は持たない。結び付けるのは adapter 側）
      sdk-message.ts          SDK のメッセージを検証して SessionEvent にする（SDK を import しない）
      self-started-turn.ts    claude が依頼なしで始めた続きのターンに turn-started を補う（ターンの外で届いた init が合図）
      session-restore.ts      続きから始めるセッションを選ぶ・transcript を履歴イベントにする
      port-resolution.ts      どのポートで試すかの決定（listen そのものは adapter/server.ts）
      config.ts               環境変数の解釈（読み取りは cli.ts。ここは渡された env を見るだけ）
      context-usage.ts        コンテキストの内訳を記録に残す書き口の契約と、セッション1つにつき1行だけ書く係
      token-usage.ts          トークン消費を記録する判断（何を1行にするか）と書き口の契約、1代ぶんの累計と内訳を持つ係
      prompt-image-shelf.ts   依頼に添えた画像の原寸の棚（直近の数枚をプロセスのメモリに持ち、/prompt-image/<id> で配る）
      report-notation.ts / speech-cadence.ts / chat-manner.ts / chat-memory-prompt.ts / chat-nudge.ts / chat-compact.ts
                              systemPrompt に足す規約・記憶・話しかけの文面（どれをどの順で渡すかは system-prompt.ts が決める）。
                              chat-compact.ts は /compact の文面に加えて、雑談のログの走行合計と閾値の見張りも持つ
      system-prompt.ts        systemPrompt の append の組み立て（人格 → 規約 → 雑談の記憶。モードで並びが入れ替わる）
      host.ts                 ホストのポート（showView）。実装は adapter/orca-host.ts
    adapter/                  外の世界に触る場所。1ファイル = 1つの境界
      sdk-driver.ts           SessionDriver の本物の実装（query() を回す）。SDK を import してよいのは sdk- で始まるファイルだけ
      sdk-tool.ts             tsukumo の MCP サーバと6つのツール（speak / remember / forget / keep / index / recall）
      sdk-session.ts          セッションの一覧・transcript の読み直し・印（listSessions / getSessionMessages / tagSession）
      sdk-context-usage.ts    コンテキストの内訳の問い合わせと、画面が要る形への写し
      fake-driver.ts          疑似セッションどおりに SessionEvent を流す SessionDriver（疑似セッションは fs から読む）
      server.ts               http（ページ・/assets・/vendor・/character・/repository-file）
      session-socket.ts       ws（フレームとコマンド）。listen 済みのサーバに upgrade を足す
      character-pack.ts       パックの列挙・読み込み（character.json / persona.md / 素材）
      character-edit.ts       画面から変えた立ち絵・差し色を ~/.tsukumo/characters/ へ書く
      persona-memory.ts       雑談で覚えた1行を ~/.tsukumo/characters/<pack>/persona.md の末尾の節へ書く
      chat-summary.ts         雑談の要約の写しと印（~/.tsukumo/chat-summary/<pack>.md）
      chat-archive.ts         雑談の会話のアーカイブ（~/.tsukumo/chat-archive/<pack>/<日付>.jsonl）
      remembered-default.ts   次に起こすときの初期値（~/.tsukumo/state.json。キャラクター名・モデル・許可モード）
      task-summary.ts         main の develop/tasks.json の読み直し（main の先端の変化を tasks-changed イベントにする。`git rev-parse` / `git show` を起こす）
      repository-file.ts      git 管理下のファイルの列挙（`git ls-files` を起こす唯一の場所）
      context-usage-log.ts    コンテキストの内訳の記録（ファイルに触るのはここだけ）。~/.tsukumo/context-usage/<日付>.jsonl
      token-usage-log.ts      トークン消費の記録（ファイルに触るのはここだけ）。~/.tsukumo/token-usage/<日付>.jsonl
      local-time.ts           ~/.tsukumo/ に積む JSONL の「いつ」の書き方（日の境目も時差もそのマシンのローカル時刻）
      bundle.ts / ui-rebuild.ts bun build（browser の入口と CSS）と src/browser/ の見張り
      source-fingerprint.ts   ソースの置き場の中身から指紋（ハッシュ）を作る（見張りつき起動で画面だけ組み直してよいかを決める）
      bundled-path.ts         同梱物の位置（import.meta.url）。tsukumo-home.ts は ~/.tsukumo/
      vendor-asset.ts         ブラウザへそのまま配る外部ライブラリの実ファイルを読む（node_modules のどのファイルを指すか知っているのはここだけ）
      orca-host.ts            `orca` コマンドを起こす唯一の場所
  browser/
    main.tsx                  入口。部品の木を組み立てて mount する（副作用はここだけ）
    css-variable.d.ts         browser 全体に効く型拡張（import されない ambient 宣言）
    css-module.d.ts           `*.module.css` を import したときの型（同上）
    css-global.d.ts           `styles/theme.css` を副作用だけで import したときの宣言（中身は空。同上）
    vendor-global.d.ts        外部ライブラリがブラウザのグローバルに置くものの型（`<script>` で読むので npm の型が引けない分。同上）
    features/                 機能。**機能どうしは import しない**
      layout/                 Layout・領域の枠・リサイザ・比率の保存
      screen-nav/             全画面の最上部の帯。部屋の名前・仕事/雑談のトグル・3画面の口・
                              いまの作業の札（押すと依頼の手順の一覧）・モデル/許可モードの
                              操作子（13.9）
      main-view/              TurnHeader・Turn・Report・QuestionRecord と markdown/（unified 一式）・
                              reveal/（レポートを筆で書き上げる演出ひとまとまり）
      character-view/         Portrait・BalloonTrack・Balloon・動きの hooks
      sidebar/                SessionInfo・TaskSection（まん中の区画ひとまとまり）と、
                              2区画の枠（SidebarSection）
      dispatch/               Composer・CommandSuggestions・FileSuggestions・PendingAnswer・TurnStatus
      chat-view/              雑談モードでメインの領域に差し替わるビュー（13.7）
      token-usage/            トークン消費の画面（期間の消費の札・小さな棒・集計の表）
      character-screen/       キャラクター画面と作る画面（13.6）。立ち絵・差し色の差し替え、使う人が変える色
      task-board/             タスク一覧。TaskList（区画の中身）・TaskBoard（表のモーダルの入口）・
                              PresentationalTaskBoard（器）。**領域を持たず、サイドバーに
                              置いてもらう機能**（下の「領域の機能と、置かれる機能」）
        hooks/                その機能だけが読むフック（`use-task-board.ts`）
        components/           その機能だけが使う部品（TaskTable・TaskRow・TaskItem ほか）
        domain/               その機能の語彙の純関数（`task-status.ts`・`task-list-count.ts`・
                              `task-sidebar-order.ts`）
                              （機能の見た目は、それぞれの中の `<機能>.module.css`。6.6）
    components/               機能の語彙を持たない React の部品（Select・Portrait と portrait.module.css）
    hooks/                    機能の語彙を持たない React のフック（`use-modal-dialog.ts`）
    domain/                   画面全体の語彙（複数の機能が読む、状態でも部品でもないもの。
                              `appearance-color.ts`＝画面の色・`reveal-speed.ts`＝演出の速さ）
    lib/                      ライブラリを包む道具（WebSocket・`FileReader`・React の hook）
    utils/                    ライブラリに依存しない汎用の道具（`clock.ts`）
    stores/                   画面全体で共有する状態（セッション・選んでいるターン・出している画面）
    styles/                   グローバルな CSS はこの1枚だけ（theme.css。トークン・body・リンク）
test/                         src/<相対パス>.ts → test/<相対パス>.test.ts（いまのまま）
characters/<name>/            character.json・persona.md・素材
```

**ファイル名は概念**（原則5）。`helpers/` と `common/` は作らない（`lib/` と `utils/` を
置く基準は下の「`lib/` と `utils/` に置く基準」）。**単数形の規約は
`src/browser/` の置き場所のディレクトリ（`features/` `components/` `hooks/` `domain/` `lib/` `utils/`
`stores/` `styles/` と、機能の中の `hooks/` `components/` `domain/`）だけ外れる**（bullet-proof-react の名前をそのまま採る。`shared` / `server` / `core` /
`adapter` と、
機能の中のファイル名は単数形のまま。`main-view/` のように機能の名前は用語集の語に合わせる）。

**`src/browser/` の箱と、置く基準**（bullet-proof-react の語をそのまま使う。判断に迷ったら
「その機能しか読まないなら機能の中」が既定）:

| 箱            | 置くもの                                                                      | import してよい先                                                         |
| ------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `main.tsx`    | 入口。Provider と `<Layout>` に機能を差し込む（composition root）             | すべて                                                                    |
| `features/`   | 1つの機能に閉じた部品・状態・保存                                             | `components` / `hooks` / `domain` / `lib` / `utils` / `stores` / `shared` |
| `components/` | **機能の語彙を持たない** React の部品（値と呼び先を全部受け取る）             | `hooks` / `lib` / `utils` / `shared`                                      |
| `hooks/`      | **機能の語彙を持たない** React のフック（`use-modal-dialog.ts`）              | `lib` / `utils` / `shared`                                                |
| `domain/`     | **画面全体の語彙**（tsukumo の語彙を名乗り、複数の機能が読むもの）            | `lib` / `utils` / `shared`                                                |
| `lib/`        | **ライブラリを包む**道具（React の部品ではないもの）                          | `utils` / `shared`                                                        |
| `utils/`      | **ライブラリに依存しない**汎用の道具（下の「`lib/` と `utils/` に置く基準」） | —（`utils` の中だけ）                                                     |
| `stores/`     | **画面全体で共有する状態**の store・Context と、それを読む hook               | `lib` / `utils` / `shared`                                                |
| `styles/`     | **グローバルな CSS だけ**（`theme.css`。機能の見た目は機能の中）              | —                                                                         |

- **`stores/` は「状態ライブラリの置き場」ではなく「画面全体で共有する状態の置き場」**
  （zustand を入れない決定は 6.2 のまま）。実体は7つあり、
  `stores/session.tsx` は `SessionState` を畳んで全機能に配り（`useSyncExternalStore` + セレクタ。
  Context で配るのは store そのもの）、`stores/main-view-turn.ts` はそこから**ターンの畳み**を
  姿ごとに1回だけ導き、`stores/turn-selection.tsx` は `location.hash` の `turn` から
  メインビューとキャラビューに同じターンの選択を配り、`stores/screen.tsx` は `location.hash` から
  **出している画面**を読む（書く口 `navigateTo` も同じ
  ファイル。13.6）。**1本の hash の書き方は `stores/location-hash.ts` だけが知る**（`screen.tsx` と
  `turn-selection.tsx` の2つがここを通して読み書きする）。`stores/question-answer.tsx` は答え待ちの質問に対する
  **答えの組み立て**を配る Context（質問の札はメインビュー、自由入力は入力欄と、読み手が
  2機能にまたがる）。`stores/question-scroll.tsx` は帯の「いまの作業」の一覧の「質問へ」から
  メインビューの質問の札へスクロールしてほしいという**一回限りの合図**を配る Context。**どれも
  複数の機能が読む**ので機能の中に置けず、`main.tsx` に残すと機能が
  入口を import することになる（だから箱が要る）
- **接続（`lib/socket.ts`）と再読み込み（`lib/refresh.ts`）は状態ではなく道具**なので `lib/`。
  入口の `main.tsx` は直下のまま（`app/` を作らない理由は下の表）
- **機能どうしは import しない**（唯一の例外が「領域 → 置かれる機能」の1方向。次の節）。
  機能をまたいで要るものは、**部品なら `components/`、フックなら `hooks/`、状態なら `stores/`、
  それ以外は tsukumo の語彙を名乗るなら `domain/`、ライブラリを包む道具なら `lib/` へ上げる**。
  上げる引き金は「2つ目の読み手が出たとき」で、
  1つの機能しか読まないものは機能の中に残す（`features/layout/split.ts` がその例。
  `appearance-color.ts` は**引き金が引かれたほう**の例——3色の操作子が帯の歯車へ移って
  `screen-nav` と `character-screen` の2つが読むようになったので、`browser/domain/` へ上げた）
- **引き金は逆にも引く。** 読み手が1つの機能だけに戻ったら、その機能の中へ**下ろす**
  （2026-09-23 決定。`browser/lib/` に溜まっていた `model-label.ts` /
  `permission-mode-label.ts` → `features/screen-nav/domain/`、`prompt-image.ts` →
  `features/dispatch/`、`chart.ts` / `vendor-script.ts` → `features/main-view/markdown/`）。
  **`browser/lib/` と `browser/domain/` に「1つの機能だけが読むファイル」が無いことは
  `test/architecture.test.ts` が見る**（機能が1つも読まない——`stores/` や `main.tsx` だけが
  読む `socket.ts` / `refresh.ts` のようなもの——は対象外）
- **`domain/` と `lib/` の線は、包んでいる技術の有無では引かない。** 引くのは
  「**ファイル名が tsukumo の語彙を名乗るか**」（下の「`lib/` と `utils/` に置く基準」の手順1）。
  `domain/appearance-color.ts` は `localStorage` と `getComputedStyle` を包むが、名前が指すのは
  **画面の色**という tsukumo の語彙なので `domain/`。逆に `lib/tool-summary.ts` は純関数だが、
  名前が指すのは Claude Code のツールという**外部システムの語彙**なので `lib/`。
  **機能の中の `domain/`（その機能の語彙）を画面全体へ1段上げたもの**が
  `browser/domain/` で、`components/` と `hooks/` が機能の中と画面全体の2段に分かれているのと
  同じ形（2026-09-23 決定）
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
下の2つの節）。**`browser/domain/` は 2026-09-23 に足した**——bullet-proof-react には無い名前だが、
機能の中で既に使っている `domain/`（その機能の語彙）と同じ語を1段上げただけで、
**実体が2つ（画面の色・演出の速さ）出てから作った**。

### 領域の機能と、置かれる機能

`features/` の中には2種類ある（2026-09-22 決定）。**機能どうしの辺は「領域 → 置かれる機能」の
1方向だけ**を許し、それ以外は落とす。

| 種類                       | どういうものか                                                                      | 辺                                                                 | いまの中身                                                                                                                           |
| -------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| **領域の機能**（region）   | 画面の領域を持つか、領域に差し替わる画面を持つ。**置き場所を決めるのは `main.tsx`** | 機能からは import されない。互いにも import しない                 | `layout` / `screen-nav` / `main-view` / `character-view` / `chat-view` / `character-screen` / `token-usage` / `sidebar` / `dispatch` |
| **置かれる機能**（placed） | 自分の置き場所を持たず、領域の中に置いてもらう                                      | 領域から import してよい。**自分はどの機能も import しない（葉）** | `task-board`                                                                                                                         |

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

**割るかどうかは、部品が抱えている「振る舞いの種類」の数で決める**（2026-09-23 決定。それまでは
「フックが0本のときだけ割らない」と書いていて、ストアのセレクタを1本読むだけの部品まで3つに
割る形になっていた）。**行数もフックの本数も数えない。** 数えるのは次の3つ:

| 種類                   | どういうものか                                                                       | 例                                                        |
| ---------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| **保つ**（state）      | `useState` / `useRef` で持ち、イベントで遷移する                                     | 開いているか・下書き・選んだ位置                          |
| **外と同期**（副作用） | `useEffect`・タイマー・`<dialog>` の DOM・取得（`useQuery`）・DOM の出来事の読み替え | 1秒ごとの刻み・`showModal()`・`git ls-files` の一覧の取得 |
| **畳む**（算出）       | 受け取った値を**画面に出す形**へ変える                                               | 経過秒 → 「1分05秒」・並びの反転・候補の絞り込み          |

**ストアを読むだけは数えない。** `useSessionSelector` / `useSessionDispatch` / `useTurnRunning` /
`useQuestionAnswer` は「props で降ろす代わりに自分で読む」だけで、読む場所が変わっても部品の
中身は増えない（降ろす道が遠いときに読むためのもの。6.2）。**これしか無い部品はフックが何本
あっても1ファイルのまま**（`sidebar/session-info.tsx` / `profile-card.tsx` /
`recent-topic-section.tsx` / `sidebar.tsx` / `character-switch.tsx`）。

**2種類以上そろったら割り、1種類までは1ファイルのままにする。** 1種類のあいだは、その部品の
中身がまだ「1つのこと」で説明が付く（`sidebar/session-switch.tsx` は**選択肢のラベルの作り方**
だけ、`sidebar/task-section.tsx` は**何を開いているか**だけ）。2種類そろうと、片方を読むために
もう片方を読み飛ばすことになる。

**割り方は「余分な種類を外へ出す」方向で決める。3つに割るのが唯一の形ではない**（2026-09-23 決定）:

| 抱えているもの                                         | 割り方                                                                | 例                                                                                        |
| ------------------------------------------------------ | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 3種類そろっている（見た目もロジックも重い）            | container / `hooks/use-<名前>.ts` / `presentational-<名前>.tsx` の3つ | `task-board` / `chat-view` / `dispatch/turn-status.tsx` / `character-view/speech-log.tsx` |
| **外の世界に触るフックだけ**が余分                     | そのフックだけを `hooks/use-<概念>.ts` へ出し、残りは1ファイルのまま  | `dispatch/file-suggestions.tsx` → `dispatch/hooks/use-repository-file-paths.ts`           |
| **純関数だけ**が余分で、**フックを呼ばない相手**が読む | `domain/<概念>.ts` へ出す                                             | `task-board/domain/task-status.ts`                                                        |

3つに割るときの分担（2026-09-22 決定。それまでは `hooks/` を「採らない」と書いていた）:

| ファイル                    | 持つもの                                                                          | 持たないもの                       |
| --------------------------- | --------------------------------------------------------------------------------- | ---------------------------------- |
| `<名前>.tsx`（container）   | フックを呼び、**戻り値を展開して渡す**（presenter の Props はフックの戻り値の型） | JSX の中身・算出・条件分岐         |
| `hooks/use-<名前>.ts`       | state・副作用・イベントの読み替え。**画面に出す形の値と呼び先を返す**             | JSX                                |
| `presentational-<名前>.tsx` | 器だけ。受け取ったものを `components/` に渡す                                     | **フックを1つも持たない**・算出    |
| `components/*.tsx`          | 部品ひとつずつ。class を付けて値を置く                                            | 算出・判定（**畳んだ値で受ける**） |
| `domain/*.ts`               | **フックに入れられない**機能固有の語彙（対応表・文言）                            | JSX・フック・React                 |

`task-board` がその1件目（2026-09-22 決定）:

```
features/task-board/
  task-board.tsx                  container。useTaskBoard を呼んで PresentationalTaskBoard へ渡す
  task-list.tsx                   区画の中身（畳むだけの1種類なので割らない）
  presentational-task-board.tsx   <dialog> の器（フック無し）
  hooks/use-task-board.ts         <dialog> の ref・backdrop のクリックと、行への畳み方（BoardRow）
  components/task-table.tsx       表（memo）
  components/task-row.tsx         1行
  components/readiness-cell.tsx   着手の列
  components/task-id-list.tsx     IDの並び
  components/task-item.tsx        区画の一覧1件（進行中を除く。印の形で status を区別する）
  components/task-running-card.tsx  区画の一覧の先頭に出す進行中（doing）のカード
  components/task-count-chip-list.tsx  見出し下の件数のチップ
  components/task-run-button.tsx  押せるタスクID（一覧と表の両方が置く）
  components/task-run-confirm.tsx 「<ID> を実行しますか」の確認（押した瞬間だけ組み立てる。下の「`components/` とストア」）
  domain/task-status.ts           status → 色の class（表の行が読む）
  domain/task-list-count.ts       見出し下の件数のチップの元（サイドバーが読む）
  domain/task-sidebar-order.ts    区画の一覧の並び（進行中を先頭にまとめる純関数）
  domain/task-sidebar-filter.ts   件数のチップで選んだ状態だけに絞る純関数（2026-09-23 決定）
```

- **部品に算出を残さない。** 「値が無いときどうするか」「どれを出すか」はフックが
  `BoardRow` へ畳んでから渡す。部品に残ってよいのは **class を選ぶ分岐だけ**
  （`domain/task-status.ts` の呼び出しのように、CSS の名前が絡むもの）
- **純関数でも、まず `hooks/use-<名前>.ts` に入らないかを見る**（2026-09-22 ユーザーの選択）。
  呼ぶのがそのフック1つなら、機能直下に `*.ts` を増やさずフックの下に関数として置く
  （`use-task-board.ts` の `boardRows`）。**`components/` は型だけを `import type` で引く**
- **`domain/` を切るのは、フックに入れないほうが良いもののうち、その機能固有の語彙で
  名乗れるものだけ。** 「純関数だから `domain/`」ではない。入れないほうが良いのは、**フックを
  呼ばない相手が読む**とき——`domain/task-status.ts` は表の行（フックを呼ばない部品）が読み、
  `domain/task-list-count.ts`・`domain/task-sidebar-order.ts`・`domain/task-sidebar-filter.ts`
  はサイドバーの区画（`task-section.tsx` / `task-list.tsx`）が読む。フックに置くと、
  フックを使わない側が `use-*.ts` を import することになる
- **`components/` は機能の中の部品**で、`browser/components/`（機能の語彙を持たない部品）とは
  別物。**読み手が2つの機能にまたがったら `browser/components/` へ上げる**

- **`presentational-` の接頭辞は、この形のときだけ付けてよい**（`CLAUDE.md` 原則5 の
  「置き場所を名前にしたファイルは作らない」の例外）。**container と1対1で対になっている**
  ことがファイル名で分かるほうが、`task-table.tsx` のような概念の名前より追いやすいため。
  逆に、対になっていない部品に `presentational-` を付けない
- **フックと presenter の名前は、機能名ではなく container の名前に合わせる**
  （`use-<container>.ts` / `presentational-<container>.tsx`。2026-09-23 決定）。**1つの機能に
  container はいくつあってもよく**（`dispatch` の `composer` / `pending-answer` / `turn-status`、
  `character-screen` の `character-create` / `character-edit`、`sidebar` の区画ごと）、機能名で
  名乗ると対が分からなくなる。機能名と一致するのは container が1つの機能だけ
  （`task-board` の `use-task-board.ts`）。**1ファイル1フック**
- **機能の中の `hooks/` に置くのは、その機能だけが読むフック。** 読み手が2つになったら
  **`browser/hooks/` へ上げる**（機能の語彙を持たないものだけが上がる。`use-modal-dialog.ts` は
  `<dialog>` の開閉を DOM へ写すだけでタスクを知らないので、最初から `browser/hooks/`）。
  **container と対になっていないフック**（`use-repository-file-paths.ts` のように、外の世界に
  触るぶんだけを出したもの）も同じ `hooks/` に置き、名前は container ではなく**その概念**にする
- **フックでない純関数は `hooks/` に置かない。** 機能の直下に概念の名前で置く
  （`features/layout/split.ts` がその形）
- **描き直しを止める `memo` は presenter 側に残す**（`PresentationalTaskBoard` の `TaskTable`）。
  container はフックのぶん毎回描き直されるので、そこに `memo` を置いても効かない

**機能の中に、概念の名前のサブディレクトリを置いてよい**（2026-09-23 決定。`markdown/` が先に
この形で、`reveal/` が2件目）。`hooks/` `components/` `domain/` が**置き場所**を名乗るのに対し、
こちらは**その機能の中の概念**を名乗る（原則5）。**条件は3つで、そろったときだけ切る**:

1. **ファイルが3つ以上**あり、**その概念だけで閉じている**こと（機能の中の他の部品が触るのは
   入口の1つか2つで、残りは中どうしでしか読まない）
2. **`hooks/` `components/` `domain/` のどれか1つに収まらない**こと。収まるならそちらへ置く。
   `reveal/` はフック・DOM を測る/書く道具・純関数・React の外の入れ物が混ざる
3. **名前がその機能の中の概念**（用語集の語か、それに準ずるもの）であること

**そろったら、`hooks/` `components/` `domain/` より概念のディレクトリを優先する。** 概念を
追うのに開くディレクトリが1つで済み、機能の直下に「接頭辞だけが仲間を表す」ファイルが並ばなく
なる。**中では接頭辞を落とす**（`reveal/band.ts`。`markdown/split-blocks.ts` と同じ）。

| ディレクトリ          | 中身                                                                     | 外から呼ぶ入口                                                           |
| --------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `main-view/markdown/` | unified の設定・記法の部品・塊の切り方                                   | `Markdown` / `splitReportBlocks`                                         |
| `main-view/reveal/`   | レポートを筆で書き上げる演出（段取り・測る・塗る・帯・ぶら下がり・筆先） | `useReportReveal`（`report.tsx`）と `useBrushTip`（`mini-portrait.tsx`） |

- **その概念のフックもこの中に置く。** 機能の中の `hooks/` は「その機能だけが読むフック」の箱
  だが、概念のディレクトリを切ったなら、そのフックはそちらへ入れる
  （`reveal/use-report-reveal.ts`）。`hooks/` に残すと、演出を追うのに2つのディレクトリを開く
- **読み手が1つの機能に閉じているかどうかは、いつもどおり数える。** `reveal/brush-tip.ts` は
  `stores/` にあったが、読むのは同じ機能の `mini-portrait.tsx` だけなので機能の中へ下ろした
  （2026-09-23。`stores/` は**複数の機能が読む**状態の箱）。逆に2つ目の読み手が出たら、
  部品は `browser/components/`、道具は `browser/lib/`、状態は `stores/` へ上げる

**`components/` とストア**: **機能の中の `components/` はストアを読んでよい**（2026-09-23 決定。
`browser/components/` のほうは読めない——箱の表で `stores/` を引く辺が無い）。**条件は2つ**で、
両方そろったときだけ:

1. **props で降ろす道に `memo` か、その事情を知らない部品が挟まっている**こと。
   `components/task-run-confirm.tsx` がこれで、開くまでの道
   （`PresentationalTaskBoard` → `TaskTable`（`memo`）→ `TaskRow` → `TaskRunButton`）に
   「タスクを実行する口の都合」を知らない部品が並ぶ。降ろすと `memo` の前提が崩れ、
   **黙って描き直しが増える**（`board-close.tsx` が context を使うのと同じ理由）
2. **読んだ値で分けるのは class と文面だけ**であること。`task-run-confirm.tsx` は
   `useTurnRunning()` で文面とボタンを出し分けるだけで、畳み込みは持たない

どちらかを満たさないなら、ストアを読む側を**機能の直下（container）へ出す**。

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
  置き場は層で分かれる: `shared` / `server/core` / `server/adapter` は**層の直下に平置き**、
  `browser` は **`browser/domain/`**（直下に置くと入口の `main.tsx` と並ぶうえ、機能は入口を
  import できないため。上の箱の表）
- `src/browser/features/` の中のものは、**その機能しか読まないなら機能の中に残す**
  （上げる引き金は「2つ目の読み手が出たとき」。`features/layout/split.ts` と
  `features/main-view/markdown/split-blocks.ts` がその例で、名前が形式（Markdown）を指していても
  読み手が1つなので機能の中）

**手順2 — `lib/` か `utils/` か**

| ファイル名が指しているもの                                                             | 箱       | 例                                                                               |
| -------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------- |
| **ライブラリを包む道具**（外部パッケージ・実行環境の API・外部システムとファイル形式） | `lib/`   | `browser/lib/socket.ts`（WebSocket）・`browser/lib/data-url.ts`（`FileReader`）  |
| **ライブラリに依存しない汎用の道具**（言語の標準だけで書けるもの）                     | `utils/` | `browser/utils/clock.ts`（`Temporal`）・`retry.ts` / `partition.ts` / `clamp.ts` |

**線は「言語の標準か、その外か」に引く。** ここでの「ライブラリ」は**言語の外から来るもの**
すべて — 外部パッケージ（React・remeda・Chart.js・Agent SDK）、実行環境の API（DOM・WebSocket・
`FileReader`・`canvas`・`matchMedia`・`node:fs`）、外部システムとファイル形式（`git`・Claude Code の
ツール・data URL）。言語の標準は ECMAScript の組み込み（`Math`・`Array`・`Temporal` など）。
実行環境の API（ブラウザの WebSocket・`FileReader`、Node の `node:fs`）はパッケージではないが、
**その実行環境でしか動かない**点でライブラリと同じ側に置く（`utils/` の歯止め3「別のプロジェクトへそのままコピーして意味が通る」を満たさない）。
`Temporal` は言語の標準の組み込みなので、使っていても `utils/` に置ける。

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

- `server/adapter/` の直下は**1ファイル = 1つの境界**（`orca-host.ts` / `repository-file.ts`）。
  **例外は Agent SDK の1つだけ**で、1つの境界を `sdk-` で始まる数ファイルに分けてある（理由は
  `docs/architecture.md` 原則3）。
  `adapter/lib/` はその下の段で、**境界を名乗らず、技術の扱い方だけを知っている道具**
  （「JSONL を1行ずつ読む」「`~` を展開する」）が入る。`adapter` にあるから `lib/` になるのではなく、
  **ファイル名が tsukumo の境界を名乗るかどうか**で分かれる
- `server/core/` は外の世界に触れないので、`core/lib/` に入れてよいのは **`node:` を要求しない
  技術**（zod の扱いなど）だけ。`core` の小物はたいてい `core/utils/` 側になる
- `shared/` の `lib/` は**両方の実行環境で動く技術**だけ（`node:` も `document` も触らない）
- **`src/browser/utils/` の辺は `test/architecture.test.ts` が見る**（`BROWSER_BOXES` と
  `ALLOWED_BROWSER_BOX_IMPORTS` が箱をまたぐ辺を、「browser/utils/ の import」が歯止め1
  ——外部パッケージ・`shared/` を含めて `utils/` の外を引いたら落ちる——を検査する）。
  他の層に `utils/` を作るときも、同じ検査を足す

**いまのファイルの行き先**（2026-09-23 に読み手を数え直して振り分けた）:

- **`browser/lib/` に残るのは7つ**。`socket.ts`=WebSocket、`refresh.ts`=`<link>` と `location`、
  `session-token-url.ts`=`URL` と `location`、`data-url.ts`=`FileReader`、`debounce.ts`=React、
  `reduced-motion.ts`=`matchMedia`、`tool-summary.ts`=Claude Code のツール。いずれも
  **ファイル名が指すのが言語の外のもの**（手順2の表の上の行）で、tsukumo の語彙は名乗らない
- **`browser/domain/` は2つ**。`appearance-color.ts`（画面の色）と `reveal-speed.ts`（演出の速さ）は
  どちらも `localStorage` を包むが、**名前が指すのが tsukumo の語彙**なので手順1で `lib/` から外れる
- **機能の中へ下ろしたのは5つ**（読み手が1つの機能しか無かったもの）。
  `model-label.ts` / `permission-mode-label.ts` → `features/screen-nav/domain/`、
  `prompt-image.ts` → `features/dispatch/`、`chart.ts` / `vendor-script.ts` →
  `features/main-view/markdown/`（6.3 が「Markdown 一式はメインビューの機能の中」と書いていたのに
  `lib/` に残っていた2つ）
- `shared/image-data-url.ts` は **`shared/lib/` へ**。名前が指すのは data URL という**形式**で、
  tsukumo の語彙を名乗らず、import も持たない（読み手は `portrait-image.ts` /
  `character-background.ts` / `prompt-image.ts` の3つ）
- **ライブラリに依存しない小物は、`utils/` を作る前に remeda（11章）にあるかを見る**（2026-09-22 決定）。
  8ファイルに書き写していた `isRecord` は、`core/utils/` を作らずに remeda の `isPlainObject` へ
  寄せた。**remeda に無いものだけが `utils/` の1件目になる**
- **`utils/` にあるのは `browser/utils/clock.ts` の1件だけ**（`Temporal` で現在のエポックミリ秒を
  読む。import は無く、歯止めの3つを満たす）。`shared/` `server/core/` `server/adapter/` の平置きは
  すべて tsukumo の語彙を名乗っている（手順1）ので動かさない。**実体が無い箱は先に作らない**ので、
  ほかの層の `utils/` は最初の1件が出たときに作る

## 3. 動きの流れ

### 起動

1. `cli.ts` が `config.ts` で環境変数を読み、`main.ts` の `run(config)` を呼ぶ
   （ポート・キャラクター・自動オープン・駆動の種類・新規起動）
2. `main.ts` が**即時終了する前提**を3つ確かめる — ポート番号として読めるか（`port-resolution.ts`）、
   `bundle.ts` の `readUiBundle` が**組み立て済みの成果物**（`dist/browser/` のスクリプトと CSS の
   1組。束ねるのは事前の `bun run build`）を読めるか（無ければ前提不足で即時終了。ソース
   （`src/browser/` / `src/shared/`）のほうが新しければ、止めずに1行知らせる）、fake driver なら
   疑似セッションを読めるか
3. `current-character.ts` が `character-pack.ts` で一覧を引き、既定のパック（または指定されたもの・
   覚えていたもの）を初期パックに決める。**以降このパックの持ち回りはここに閉じる**
4. `view-delivery.ts` が**起動トークン**を1つ作り、`server.ts` を `127.0.0.1` で listen させる
   （`TSUKUMO_WATCH_UI` のときは `src/browser/` の見張りもここで始める）
5. `session-start.ts` が `session-manager.ts` にセッションを1つ作る。駆動は `TSUKUMO_DRIVER` が
   `fake` なら fake driver、それ以外は SDK。復元（8章）はここで判定する。起こしたセッションは
   `view-delivery.ts` の `connect` で `/ws` に繋ぐ
6. ホストのポートで `http://127.0.0.1:<port>/?t=<token>` を開く（失敗しても続行）

**起こし直し**（`switch-character` / `set-chat-mode` / `switch-session`）も、駆動を起こす一続き
（`core/session-launch.ts` の `createSessionLaunch`）は起動時とまったく同じものを通る。違うのは
`session-manager.ts` が `generation` を1つ進めて古い駆動のイベントを捨ててから同じ一続きを
もう一度呼ぶ、という外側だけ（8章）。

```mermaid
sequenceDiagram
    participant Client as 画面（ブラウザ）
    participant Manager as session-manager.ts
    participant Launch as session-launch.ts（createSessionLaunch）
    participant Wiring as session-start.ts（SessionLaunchPorts の実装）
    participant Driver as sdk-driver.ts / fake-driver.ts

    alt 起動（main.ts が呼ぶ）
        Manager->>Launch: launchSession(onEvent, onRestoredEvent, { selection: "initial", resume: "latest" })
    else 起こし直し（switch-character / set-chat-mode / switch-session）
        Client->>Manager: dispatch(command)
        Manager->>Manager: generation を1つ進める（古い駆動のイベントを捨てる）
        Manager->>Launch: launchSession(onEvent, onRestoredEvent, request)
    end
    Launch->>Wiring: choosePack / characterEvent / readChatTopics / readRememberedLines
    Wiring-->>Launch: パック・記憶の状態
    Launch->>Wiring: findResumeSession(pack, chat)
    Wiring-->>Launch: SessionStart（new か resume）
    Launch->>Wiring: listSessions(pack, chat)
    Wiring-->>Launch: 切り替え先の一覧
    Launch->>Wiring: startDriver(seed, onEvent)
    Wiring->>Driver: startSdkDriver / startFakeSession
    Driver-->>Wiring: SessionDriver
    Wiring-->>Launch: SessionDriver
    opt 続きから始まった場合
        Launch->>Wiring: restoreEvents(sessionId, pack)
        Wiring-->>Launch: 復元したイベント列
        Launch-->>Manager: onRestoredEvent(...)（履歴の再生）
    end
    Launch-->>Manager: SessionDriver
    Manager-->>Client: events フレーム（character-changed / chat-mode-changed / sessions-changed …）
```

### 接続

1. ページが `/assets/ui.js` を読み、`<App>` が `/ws?t=<token>` へ接続する
2. サーバは Origin とトークンを確かめ、**`hello` フレーム**（`PROTOCOL_VERSION`・
   `SessionState` の snapshot・キャラクターの見せ方）を1つ返す
3. 以降、セッションで起きたイベントを **50〜100ms ごとにまとめた `events` フレーム**で押す。
   ブラウザは同じ `applySessionEvent` で畳む。**サーバとブラウザの `SessionState` は構造的に同じ**

### 依頼

1. Composer が `{ type: "prompt", commandId, text }` を送る
2. サーバは zod で検証し、`SessionManager.dispatch(command)` → 駆動の `prompt(text)`。
   駆動が `request` イベントを起こし、それが `events` で戻ってくる（**ブラウザはローカルで
   echo しない**。ターンの開始はサーバのイベントで知る）
3. 断片（`partial-utterance`）は1バッチ内で連結して1件にする（転送量の抑制。畳み込みの結果は同じ）
4. 受け付けられないとき（検証に落ちた・駆動が失敗を返した）は
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

`SessionEvent` の一覧とフィールド、各イベントの出どころは `src/shared/session-event.ts` の型定義
（`kind` ごとの doc コメント）を正典とする。ここに残すのは、コードから読み取れない決定だけ。

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
`docs/requirements.md` 4.10）。**原寸は載らない** — 原寸は `prompt` コマンドからモデルへ渡ったあと
サーバのメモリの「棚」（`src/server/core/prompt-image-shelf.ts`）に直近ぶんだけ残るだけで、
記録（`SessionState`）に残るのは縮めた控えだけになる。控えを作るのはブラウザ側で、
**サーバは画像を加工しない**。

**`character-changed` は、いま出しているパックの姿と一緒に全パックぶんの一覧（`packs`）を運ぶ**
（2026-09-23）。一覧の1件は使用中以外のパックの姿（立ち絵・差し色・背景・ひとこと）まで持つ。
**一覧だけの別のイベントにはしない** — 一覧が変わる契機（起こす・起こし直す・画面から変える・作る）は
いま出しているパックが変わる契機と重なり、使用中の印（`inUse`）は持ち替えのたびに動くので、分けると
契機ごとに2つのイベントを揃えて出すことになり、片方を出し忘れると一覧と姿がずれる。大きさは
1件あたり URL が十数本（1〜2 KB）で、パックが数十に増えても数十 KB に収まり、流れるのは上の契機の
ときだけ（ターンの中では流れない）。1件の形・配り直す契機・素材の URL は 7.2。

イベントは `StampedEvent`（`src/shared/session-event.ts`）として**時刻を持って**送る。`at` は
サーバの `Date.now()`。reducer は `applySessionEvent(state, event, at)`（いまの第3引数 `now` と同じ）。
**ブラウザ側で `Date.now()` を reducer に渡さない**（両側の状態が同じになるように、時刻はイベントの
発生側が決める）。

### 4.2 SessionState

`SessionState`（`src/shared/session-state.ts`）の各フィールドと理由は、その型（および
`TurnProgress` / `CharacterInfo` など内訳の型）の doc コメントを正典とする。ここに残すのは、
`SessionState` の外側にある決定だけ。

**`connection`（接続中／切断中）は `SessionState` に入れない**（サーバ側に意味が無いため）。
ブラウザだけが持つ状態で、`src/browser/stores/session.tsx` の `SessionSnapshot`
（`connection: ConnectionStatus`）が `SessionState` と同じ購読に相乗りさせて配る。

`speeches.slice(-1)`（`request` で前のターンの最後の1件だけ残す）・`speechCalledInTurn`・
`MAX_SESSION_STATE_TURNS` の窓、といった**畳み込みの規則も `shared` の側が持つ**。

**記録（`SessionRecord`）を依頼の区切りでターンに割るのは `src/shared/turn.ts` の
`splitIntoTurns` だけ**（2026-09-23）。メインビュー（`main-view.ts`）・ターンごとのセリフ
（`turn-speech.ts`）・依頼の手順（`turn-step.ts`）・記録の窓（`session-state.ts` の
`trimToRecentTurns`）はその並びの上で自分の形に変え、依頼より前の記録（先頭の `pre-request`。
番号は `PRE_REQUEST_TURN_ID`）をどう扱うかも各所が決める。

**経過時間の表示**は `turn` が持つ時刻（`running` の `startedAt`、`finished` の `startedAt` /
`finishedAt`）から browser が計算する（1秒ごとの刻みは browser の
ローカルな時計。`SessionState` に秒数は入れない）。

**記録の時刻**（2026-09-23 決定）。記録（`SessionRecord`）のうち**依頼（`request`）とセリフ
（`speech`）の2種類だけ**が `time: RecordTime` を持つ。読むのは雑談のログ（13.7「時刻と日の
区切り」）と、キャラビューのセリフのログの依頼の区切り（依頼の時刻だけ。`restored` には出さない）で、
仕事のメインビューへ渡す形（`MainViewEntry`）には載せない。

- **形は判別可能な合併型**（`RecordTime`。`src/shared/session-state.ts`）: `stamped` は起きた
  時刻が分かり、`restored` は前のセッションを組み直したもので時刻が分からない。
  `at: number | undefined` にしない（「無い」理由が1つに決まっているので、名前を付けて持つ）
- **時刻を打つのはサーバ**（イベントの `StampedEvent.at` をそのまま写す）。畳み込み
  （`applySessionEvent`）の中で時計は読まない（4.1。両側の状態が同じになる）
- **ほかの種類（本文・ツール・質問・圧縮の区切り）には足さない**。雑談のログが拾わないうえ、
  足すと記録を作る場所すべてに時刻の出どころが要る
- **復元した記録の時刻は運ばない**。組み直しの材料は claude の transcript で、読む口
  （SDK の `getSessionMessages`）が各メッセージの `timestamp` を落として返す（SDK 0.3.280 の
  実装で確認）。雑談の会話のアーカイブ（7章）は `at` を持つが、transcript の行と
  **文面で突き合わせるしかなく**、同じ文面（挨拶など）が並ぶと黙って別の時刻を付ける。
  間違った時刻を出すより「分からない」と出すほうを採る
- **組み直しの終わりは `history-restored` イベントで伝える**（`toRestoredEvents` が末尾に1つ
  足す）。畳み込みはそこまでの依頼とセリフを `restored` に書き換える。**起こし直すと記録は
  空から始まる**ので、そこまでの記録はすべて再生のぶんになる。再生のイベントに打たれる `at`
  （流し直した時刻）を記録に残すと、起こし直した直後のログが全部「いま」に見える

### 4.3 ClientCommand

`ClientCommand` の一覧とフィールドは `src/shared/command.ts` の `clientCommandSchema`（zod。
4章冒頭の決定どおりここが正典）を見る。各コマンドの意図はコマンドごとの doc コメントを参照。

- `text` の上限は `MAX_PROMPT_TEXT_LENGTH`（`src/shared/command.ts`）
- `images` は**原寸と控えの対**（`PromptImage`。`src/shared/prompt-image.ts` が正典）。上限・
  形式・枚数はそちらが持ち、値そのものは `docs/requirements.md` 4.10 が正典。**1枚も無いのが
  普通**なので、field ごと省いた形も受け取って空に畳む。`maxPayload`（session-socket.ts）は
  原寸が上限まで全部通る大きさにしてある（値は同じく 4.10）
- `PermissionMode` と `ModelAlias` の値の一覧は **`shared`（`src/shared/command.ts`）に1つだけ
  置く**。SDK の型との一致は `core` 側のテストで守る

### 4.4 ServerFrame

`ServerFrame` の一覧とフィールドは `src/shared/frame.ts` の型定義（`type` ごとの doc コメント）を
正典とする。

- `protocolVersion` が browser の `PROTOCOL_VERSION` と違えば、browser は会話の画面の代わりに
  「ページを読み込み直してください」を出し、以降の `events` を畳まない（起こし直したプロセスと
  古いタブの組み合わせで起きる。見張りつきの起動で**画面だけ**組み直されたときの道は11章の
  指紋の突き合わせで塞いだが、塞ぎ損ねたときは tsukumo を上げ直すまで直らないので、知らせには
  それも書く）。版の合う `hello` がまた届けば戻る
  （`src/browser/stores/session.tsx` の `protocol`）

### 4.5 版と互換

`PROTOCOL_VERSION` は整数1つ。**イベントの追加は版を上げない**（知らない `kind` は reducer が
無視する。いまの「未知の種別で落ちない」と同じ）。既存イベントの形を変える・状態の形を変えるときだけ上げる。

## 5. core と adapter

**サーバ側は2つのディレクトリに分かれている**（2章の表）。`core/` は純粋な判断だけで
`node:` / SDK / `ws` を import せず、外の世界に触るものは `adapter/` にある。この章の各節は
ファイル名で引けるようにしてあるので、どちらのディレクトリにあるかは各節の冒頭を見る。

### session-driver.ts（core）と sdk-driver.ts（adapter）

**契約は `core/session-driver.ts`、SDK の実装は `adapter/` 直下の `sdk-` で始まるファイル**。
境目の基準は「`shared` の語彙で書けるか / SDK の語彙を名乗るか」で、`SessionDriver` の契約
（`prompt` / `interrupt` / `answer` / `pending` / `setModel` / `setPermissionMode` / `close`）と
`onEvent`・`SessionDriverOptions`・`DEFAULT_PERMISSION_MODE` / `DEFAULT_MODEL` は `core` 側、
`query()` を回す `startSdkDriver` と `buildQuerySeedOptions`・SDK の型を持つ `DEFAULT_EFFORT` は
`adapter/sdk-driver.ts`、`findSessionToResume` / `readRestoredEvents` は `adapter/sdk-session.ts`。**名前が `startSession`
ではないのは、`src/session-start.ts` の `startSession`（セッションを1つ起こす配線）と役割が
違うから**（駆動を1つ起こすだけで、覚えた既定を読む・履歴を復元するといった段取りは持たない）。

- `systemPromptAppend: string` を受け取ってそのまま `systemPrompt.append` にする。**何が
  どの順で載るかは決めない**（組み立ては `core/system-prompt.ts` の `takeSystemPromptAppend`。7章）
- `resume: string | undefined`（8章）

**SDK 側は、SDK のどの口に触るかで4つに分かれる**（import してよい先の規則は
`docs/architecture.md` 原則3）。`query()` を回す本体が `sdk-driver.ts`、`query()` の
`mcpServers` へ渡す tsukumo のツールが `sdk-tool.ts`（`createSdkMcpServer` / `tool`）、
セッションの一覧・transcript・印が `sdk-session.ts`（`listSessions` / `getSessionMessages` /
`tagSession`）、`/context` の内訳が `sdk-context-usage.ts`（`getContextUsage()` の戻り値の検証と
写し）。`sdk-driver.ts` 以外を呼ぶのは駆動と配線層（`src/session-start.ts`）だけ。

**他のファイルと共有する定数は、読む側の層で置き場を決める。** `TSUKUMO_MCP_SERVER_NAME` /
`SPEAK_TOOL_NAME` は、届いた `assistant` メッセージから `speak` の呼び出しを見分ける
`core/sdk-message.ts` が持ち、ツールを組む `sdk-tool.ts` がそこから取る（`core → adapter` は
禁止なので、逆向きには置けない）。`DEFAULT_EFFORT` は SDK の型（`EffortLevel`）を名乗り、読むのが
駆動だけなので `sdk-driver.ts` に置く。

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

`SessionManager`（セッション1つぶんの持ち物）の契約と型定義は
`src/server/core/session-manager.ts` を正典とする。ここに残すのは、コードから読み取れない決定だけ。

- `createSessionManager(options)`: 駆動を起こし、`onEvent` で **(1) 時刻を打ち (2) 自分の `state` を畳み
  (3) その代の束に積む**。`EVENT_BATCH_INTERVAL_MS`（既定100ms。`event-batch.ts`）ごとに `events`
  フレームを購読者へ配る
- `dispatch(command)`: `switch (command.type)` で駆動へ渡す。**ここが唯一の分岐**
- `subscribe(send)`: 接続ごとに `hello` を送ってから購読に加える
- **セッションは1つで、鍵を持たない**（8章）

**代のあいだだけ意味のある勘定は、駆動1代ぶんの持ち物（`SessionGeneration`）に集める。**
起こし直し（`restart`）は**それを丸ごと作り直すこと**で、勘定を1つずつ空へ戻す行を持たない
——勘定を1つ足すたびに「宣言」「積むところ」「`restart` で戻すところ」の3か所を書き足すことに
なり、`restart` へ足し忘れても型は落とさなかった。いま `restart` が戻すのは、代の持ち物
（`generation = startGeneration(request)`）と画面の状態（`replaceState(INITIAL_SESSION_STATE)`）の
2つだけ。

| 持ち物                            | 置き場                                        | 代をまたぐか                                     |
| --------------------------------- | --------------------------------------------- | ------------------------------------------------ |
| 配る束（間隔と連結）              | `event-batch.ts`                              | またがない（積み残しを新しい画面へ配らない）     |
| 雑談のログの走行合計と `/compact` | `chat-compact.ts`                             | またがない（復元されたログが新しい圧縮点から先） |
| トークンの累計と1ターンの内訳     | `token-usage.ts`                              | またがない（`query()` が変われば累計も振り出し） |
| 起き上がった駆動                  | `session-manager.ts`（代の入れ物）            | またがない                                       |
| コンテキストの内訳を書いた印      | `context-usage.ts`                            | **またぐ**（同じIDなら2行目を書かない）          |
| 依頼の原寸の棚                    | `prompt-image-shelf.ts`（持ち主は `main.ts`） | **またぐ**（捨てるのは記録から消えたときだけ）   |

**「イベントを受けて何かを記録するもの」は、その概念のファイルへ寄せる**（`session-manager.ts`
が `if` の列で全部を持たない）。`chat-compact.ts` / `token-usage.ts` / `context-usage.ts` は
**書き口の契約と一緒に、走行中の勘定を持つ係**も出し、`chat-archive-entry.ts` は「どのイベントを
アーカイブの1行にするか」だけを持つ。`session-manager.ts` に残るのは**どの順で・どちらの由来の
ときに呼ぶか**（`origin` と `chatMode` の門）だけ。

**「ターン中なら断る」の判定は `dispatch` に1か所**（`state.turn.kind === "running"` の中で
コマンドの種類ごとに定型文を選ぶ）。その手前に「雑談の外なら断る」の門が1つあり、**順は
「雑談の外か」→「ターン中か」**——仕事のときに押された `nudge` にターン中の理由を返さないため。
見た目の編集のコマンドの一覧（`CHARACTER_EDIT_COMMAND_TYPES`）は `src/shared/command.ts` の
1つの並びから型も判定も導く（二重に列挙しない）。

### character-pack.ts（adapter）

7章。`listCharacterPacks(dirs)` と `readCharacterPack(dir)`。読めないものは `undefined`（立ち絵なしの
フォールバック）。画面へ流す `character-changed`（いまの姿と全パックの一覧）を組む
`characterChangedEvent` と、`/character/<pack>/<file>` が配ってよい1件を決める `readCharacterAsset`
もここ（7.2）。

**`remembered-default.ts`** はその隣に置く別モジュールで、**次に起こすときの初期値**を
`~/.tsukumo/state.json` に読み書きする（書き込みの失敗で例外を投げない）。覚えるのは2つ:

| 欄                                           | 読む口                         | 書く口                          | 読めないとき                                            |
| -------------------------------------------- | ------------------------------ | ------------------------------- | ------------------------------------------------------- |
| キャラクター名                               | `readRememberedCharacter`      | `writeRememberedCharacter`      | `undefined`（呼び出し側が既定へ）                       |
| 新しいセッションの既定（モデル・許可モード） | `readRememberedSessionDefault` | `writeRememberedSessionDefault` | 同梱の既定（Opus・`auto`。`shared/session-default.ts`） |

**2つを1ファイルに置いてあるのは、書き込みがファイル丸ごとの置き換えだから**（別のモジュールから
書くと後から書いたほうが相手の欄を消す。原則3「1ファイル = 1つの境界」）。**欄ごとに別のスキーマで
読む**ので、片方が壊れていてももう片方は読める。外の世界（ホームのファイル）に触るのはここだけで、
覚えた名前が `listCharacterPacks` の一覧に無いときに既定へ落とす判断は呼び出し側
（`current-character.ts`）が持つ。どちらも**選択そのものはセッション限り**だが、次に起こすときの
初期値としては覚える（13.6「第3の扱い」と「新しいセッションの既定」）。

**`character-edit.ts`** は書き込む側（7.1）。画面から届いた立ち絵・差し色を
`~/.tsukumo/characters/<name>/` に書き、書けたパックを読み直して返す（受け付けなければ `undefined`）。
**ホームの場所を組み立てるのは `tsukumo-home.ts` の1関数だけ**で、`state.json` もパックの置き場も
その下に並ぶ。

### task-summary.ts（adapter）

**読むのは作業ツリーのファイルではなく `main` の `develop/tasks.json`**（タスクの正典は `main` の
もので、作業ツリーのものは `git merge main` するまで別の作業ツリーで足したタスクを知らない）。
1.5秒ごとに `git rev-parse refs/heads/main` で先端を取り、**先端が変わったときだけ**そのコミットから
`git show <先端>:./develop/tasks.json` で読み直して `tasks-changed` を起こす。`git rev-parse` は
1回約10msなので、毎回子プロセスを起こしても負荷は無視できる。1回の見回りが終わってから次を
予約するので、`git` が遅くても見回りは重ならない。

- **`git` を起こすのはこのファイル自身**（`test/architecture.test.ts`「子プロセスを起こす箇所」の
  許可に入っている）。`main` の上のファイルを読む汎用の adapter を別に切らないのは、読み手が
  この一覧しかなく、切っても開くファイルが増えるだけで概念が増えないため
- **`main` が読めないとき（git リポジトリでない・`main` ブランチが無い・`main` に
  `develop/tasks.json` が無い）は `{ kind: "unknown" }`**。作業ツリーのファイルへは落とさない
  （読み元が2つになり、`main` の名前が違うリポジトリで一覧が黙って古いほうへ戻る）。最初から
  読めないときは通知そのものを送らない（既定値の「不明」と同じ）
- **`git` がタイムアウトしたときはその回を諦め**、覚えている先端も変えない（次の回で読み直す）

### server.ts と session-socket.ts（adapter）

**HTTP と WebSocket は別の境界**なので、ファイルも2つに分かれている。静的配信と、会話を含まない
JSON を配る経路（`/repository-file`・`/token-usage`・`/context-usage`）と会話の内容を運ぶ
`/prompt-image/<id>` は `server.ts`（listen するのもここ。経路の一覧は `respond` 関数と、経路ごとの
定数（`LAYOUT_PATH` / `uiScriptPath()` ・ `styleSheetPath()` / `VENDOR_PATH_PREFIX` /
`CHARACTER_ASSET_PATH_PREFIX` / `REPOSITORY_FILE_PATH` / `TOKEN_USAGE_SUMMARY_PATH` /
`CONTEXT_USAGE_PATH` / `PROMPT_IMAGE_PATH_PREFIX`）が正典）、`/ws` の upgrade とコマンドの受け口は
`session-socket.ts`（`SESSION_SOCKET_PATH`。listen 済みのサーバに受け口を足すだけ）。**起動トークンは
1つ**で、`server.ts` の `createStartupToken` が作ったものを両方が見る。

会話の内容が乗るのは `/ws`（`session-socket.ts`）と、依頼に添えた画像を配る `/prompt-image/<id>`
だけ。ページ・同梱物・素材（`/`・`/assets/*`・`/vendor/*`・`/character/*`）は静的な物なので
トークン無しでよい。**`/repository-file`・`/token-usage`・`/context-usage` は会話を含まないが
トークンが要る** — 配るのは利用者の作業ディレクトリの中身・使った量・いまのセッションが積んでいる
ものの内訳で、誰にでも配ってよい静的な物ではない（各経路の判断の理由は `server.ts` の関数ごとの
doc コメントを参照）。

### config.ts（core）

**この表を正典のままにする**（2026-09-23 決定。`src/server/core/config.ts` 冒頭のコメントも
同じ向きを明記している）。4章の `SessionEvent` / `SessionState` と違い、各環境変数名の doc コメントは
読み取り方や関連ファイルだけを持ち、既定値と挙動の説明は `port-resolution.ts` ・
`tsukumo-home.ts` など複数のファイルに分かれている。1つの型の doc コメントに寄せられないので、
表だけがこの9個をまとめて見渡せる場所になる。

| 環境変数                          | 意味                                                                                           | 既定             |
| --------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------- |
| `TSUKUMO_VIEW_PORT`               | ビューを配るポート（既定のまま塞がっていれば +1 で20個まで試す。明示指定したときはずらさない） | 7327             |
| `TSUKUMO_VIEW_PORT_FALLBACK_BASE` | `TSUKUMO_VIEW_PORT` が未設定のときの起点を差し替える（下記）                                   | 7327             |
| `TSUKUMO_CHARACTER`               | パック定義ディレクトリのパス（相対は cwd 相対）                                                | `tsukumo-spirit` |
| `TSUKUMO_OPEN_VIEW`               | 起動時にタブを自動で開くか（`0` のときだけ開かない）                                           | 開く             |
| `TSUKUMO_DRIVER`                  | `sdk` / `fake`                                                                                 | `sdk`            |
| `TSUKUMO_FAKE_SCENE`              | `fake` のとき起こした直後に流す場面の名前                                                      | 流さない         |
| `TSUKUMO_NEW_SESSION`             | `1` で復元せず新規に起こす（8章の逃げ道）                                                      | 復元する         |
| `TSUKUMO_WATCH_UI`                | `1` で `src/browser/` を見張って組み立て直す（11章）                                           | 見張らない       |
| `TSUKUMO_HOME`                    | tsukumo の持ち物を置くホーム（相対は cwd 相対）                                                | `~/.tsukumo`     |

`TSUKUMO_VIEW_PORT_FALLBACK_BASE` は**既定の帯（`DEFAULT_VIEW_PORT`〜+19）そのものを差し替える
口**で、`TSUKUMO_VIEW_PORT` を明示したときは効かない（明示指定はそもそもずらさないため）。
読めない値は `TSUKUMO_VIEW_PORT` と違って**起動を止めず**、黙って既定の 7327 に倒す
（`resolveViewPortFallbackBase`）。**この口が要る場面は1つだけ**——`test/cli.test.ts`
「既定ポートから上限まで全部塞がっている」テストが、実際の 7327〜7346 帯（他の tsukumo が
日常的に使っている）を塞がずに、その帯が全滅したときの失敗経路（試した範囲を伝えて終了コード1）
を確かめるための私的な帯を選ぶために使う。

`TSUKUMO_CHARACTER` は**パスとしてだけ解く**（`src/server/adapter/bundled-path.ts` の
`resolveBundledDir`。相対は cwd 相対、絶対はそのまま）。**パックの名前では指せない** —
`TSUKUMO_CHARACTER=local` は `<cwd>/local` に解かれる。一覧（`listCharacterPacks`）は同梱の
`characters/` ・ `~/.tsukumo/characters/` ・起動先の `characters/local` を常に返すので、
**この口が要るのはその3つの外にパックを置いたときだけ**。`TSUKUMO_CHARACTER_DIR` は
`TSUKUMO_CHARACTER` に統合済みで、いまは無い。

`TSUKUMO_HOME` は**ホームの丸ごとの差し替え口**（`state.json`・雑談の要約とアーカイブ・
トークンの記録・画面から作ったパックがすべて移る。7章の表の置き場）。**渡すのは、tsukumo を
2つ並行して動かす人が明示的に渡すときだけ**で、セッション単位で自動には分けない —
キャラクターの好みはプロジェクトごとではない（13.6）という決定はそのまま、**並行させたい
ときの逃げ道だけ**を開けてある。`TSUKUMO_VIEW_PORT` と2つ揃えて分けないと、ポートだけ分けても
ホームは共有されたまま。パスとしてだけ解き（相対は cwd 相対、絶対はそのまま）、`~` は展開しない
（展開するのはシェルの仕事）。読むのは `src/server/adapter/tsukumo-home.ts`
（`readConfig` ではない。理由はそのファイルの冒頭）。

## 6. browser

### 6.1 部品の木

```
<SessionProvider>            lib/socket.ts で接続。SessionState を持つ store を Context で配る（6.2）
└ <TurnSelectionProvider>    選んでいるターンを配る（6.2）
   └ <Root>                  main.tsx の中（export しない）。useScreen() で出す画面を選ぶ（6.2・13.6）。
      │                      **会話の画面は外さず hidden で隠す**（下書き・選んでいるターン・スクロール位置を保つ）
      ├ <ScreenNav>          **全画面の最上部の帯**（13.9）。部屋の名前・仕事/雑談のトグル・
      │                      3つの口（会話 / キャラクター / トークン消費）・いまの作業の札
      │                      （押すと依頼の手順の一覧）・モデル/許可モードのドロップダウン・
      │                      右端の設定の歯車。狭い画面ではタブ帯の右端の「≡」に畳む
      │   └ 設定の歯車       押すとポップオーバー（13.9「設定の歯車」）。いまある群は
      │                      画面の色（ground / surface / ink。domain/appearance-color.ts。localStorage）
      ├ <Layout>             会話の画面。grid。リサイザ。接続切れの印。答え待ちの印（タブのタイトル・枠色）。
      │  │                   比率を動かして既定と違う値になったときだけ、上下の仕切りの右端に
      │  │                   「比率を既定に戻す」ピルが出る（13.6）。**狭い画面では画面の高さに
      │  │                   固定し、上段（メインビュー / サイドバー）をタブで切り替える**（4.7）
      │  ├ <MainView>        札（<TurnHeader> + <Turn>）+ <QuestionAsk>。札の頭は ‹ › ・依頼の1行目の
      │  │                    タイトル・n / N・最新 / 最新へで、直近20件（`MAX_MAIN_VIEW_TURNS`）を1件ずつ遡る。
      │  │                    タイトル横の `⌄` を押すと窓の中のやり取りへ一度で飛べる一覧が開く
      │  │                    （新しいものを上に並べ、番号は `‹` `›` の脇と同じ古いほうを1とする
      │  │                    通し番号のまま。見ている行にだけ ● の印）
      │  │   └ <QuestionAsk> 答え待ちの質問の**札**（レポートの下）。「質問」のチップ + header + n / N、
      │  │                    選択肢を横に並べたカード（**選択肢ごとの `preview` は説明の下**。
      │  │                    ラベル末尾の (Recommended) は「おすすめ」のバッジ）、
      │  │                    下端に「これで答える」。**自由入力は入力欄が担う**（2026-09-23）
      │  │   └ <Turn>        <RequestRest>（依頼の2行目以降 + <PromptImageThumbnails>）
      │  │                    + [<Report> | <QuestionRecord>]*
      │  │       └ <Report>  Markdown（6.3）。書きかけはブロック単位で memo
      │  ├ <CharacterView>   <SpeechLog> + <Portrait> + <BalloonTrack>
      │  │   ├ <SpeechLog>   右上の「ログ」と、舞台を帯の下まで上へ伸ばしてセリフを遡るモーダル（4.2）。
      │  │   │               立ち絵はキャラビューから受け取り、吹き出しは <Balloon> を共有。位置は
      │  │   │               CSS の anchor positioning でキャラビューの床と吹き出しの並びに重ねる
      │  │   ├ <Portrait>    立ち絵。**components/portrait.tsx**（キャラクター画面の並びも使う）。SVG は
      │  │   │               インラインで差し色、ラスタは <img>。動きの hooks はキャラビュー側に残る（6.5）
      │  │   └ <BalloonTrack> <Balloon>*。最新を一番下、下端の位置を固定（4.2 の決定どおり）。
      │  │                   出るのは `speak` で来たセリフだけ。最新にだけ話し手の名前を添える（4.2）
      │  ├ <Sidebar>         {taskSection} + <SessionInfo>。**雑談中は chatMode を見て自分で差し替え**、
      │  │                   <ProfileCard> + <RecentTopicSection> + <PersonaMemorySection> +
      │  │                   <SessionInfo>（キャラクターの対なし）になる（13.7「雑談のときのサイドバー」）
      │  │   └ <TaskSection> **features/task-board/**（置かれる機能。2章）。枠は props で受け取り、
      │  │                   <TaskList>（区画の中身）と <TaskBoard> を描く。差し込むのは main.tsx
      │  │   └ <TaskBoard>   タスク一覧の表。見出しの「一覧を見る」から <dialog> で開く（4.2）
      │  │   └ <ProfileCard> 雑談中だけ。顔・名前・ひとことプロフィール・「変える ⌄」
      │  │                   （<CharacterSwitch> を透明にして重ねる。13.7）
      │  │   └ <SessionInfo> **区画ではなく下端の帯**（.sidebar-footer。見出しを名乗らず、
      │  │                   SidebarSection も通らない）。キャラクター（左に顔。
      │  │                   components/character-face.tsx。帯と共有）とセッションの2つの
      │  │                   <select> を、小さなラベルを上に置いて横に等分で並べる
      │  │                   （**仕事/雑談・モデル・許可モードとキャラクター画面へ入る口は
      │  │                   帯へ移った**。13.9）
      │  └ <Dispatch>        <PendingAnswer> + <Composer> + <TurnStatus>
      │      ├ <PendingAnswer> 許可（許可 / 拒否）だけ。**質問はここに出ない**（札はメインビュー）
      │      ├ <Composer>    <textarea>。Enter 改行 / ⌘Enter 送信。**質問が出ている間は答えを書く場所**
      │      │                （上に帯「↑ <キャラクター名> が質問しています…」、プレースホルダ
      │      │                「選択肢以外の答えを書く…」、枠は `--state-warn`、送るボタンは「答える」）。貼り付け / ドロップ / 画像のボタンで
      │      │                画像を添える（4.10）。<CommandSuggestions>（`/`）と
      │      │                <FileSuggestions>（`@`。同時には出さない）・<PromptImageChips>（札）を内包。
      │      │                下に道具の行（画像・`/`・`@` のボタン、操作の案内、<TurnStatus>）
      │      └ <TurnStatus>  経過 / 所要、送信 ⇄ 中断（道具の行の右端）
      ├ <CharacterScreen>    キャラクター画面（#character。13.6）。**戻る口と答え待ちの印は帯が持つ**（13.9）。
      │   │                  パックのラベルと名前・「新しく作る」（#character/new へ）。
      │   │                  **画面の色は帯の歯車へ移した**ので、この画面にはパックの持ち物だけが残る
      │   └ <CharacterEdit>  立ち絵の並び（表情ごと。<Portrait> を使う）と差し色（衣装ごと）・背景の差し替え（7.1）
      └ <CharacterCreate>    作る画面（#character/new。7.1）。戻る口「← キャラクターへ戻る」。
                             作れたら「このキャラクターに切り替える」
```

**部品は `SessionState` と `dispatch` だけを見る。** DOM を直接いじる配線（`MutationObserver`・
`data-` 属性で状態を渡す）は持たない。

**依頼に添えた画像は `components/prompt-image.tsx` の2つが出す**（`docs/requirements.md` 4.10）:
送る前の札（`<PromptImageChips>`。縮めた絵と外す `×`）と、送ったあとの控え
（`<PromptImageThumbnails>`。依頼の見出しの下と、雑談の利用者の吹き出しの中）。**どちらも1枚も
無ければ何も描かない**ので常設の枠にならない。**どちらも押すと原寸を拡大して見られる**
（`image-zoom.tsx`）——札は `<Composer>` のローカル状態にある原寸をそのまま出し、控えは押した
瞬間に id でサーバの「棚」（`src/server/core/prompt-image-shelf.ts`。`docs/requirements.md`
4.10「会話内容の扱い」）から原寸を取りに行き、棚から落ちていれば控えを代わりに拡大する。

**質問が出ている間も `<Composer>` は出したまま**（2026-09-23。札がメインビューへ移り、入力欄の
領域を質問に明け渡す必要がなくなった）。入力欄は**選択肢にない答えを書く場所**になり、送ると
その字が**いま見ている1問の答え**になる（`stores/question-answer.tsx` の `onAnswerWithText`）。
**進行中でも送れる**——SDK は答えを待って止まっているので、送るボタンは「中断」ではなく「答える」。

**選んでいるターンは `<SessionProvider>` の内側の `<TurnSelectionProvider>`
（`browser/stores/turn-selection.tsx`）が配る**（6.2）。`<MainView>` の札だけでなく **`<CharacterView>` の吹き出しと表情も同じ選択に
従う**（過去のターンを選んでいる間は、そのターンのセリフと**最後のセリフの表情**に戻す。
ターンごとのセリフは `shared/turn-speech.ts` が記録から引く）。**立ち絵の「動き」は遡らない**
（時間相対のアニメーションなので、遡るには `docs/requirements.md` 4.3 の決定の見直しが要る）。

### 6.2 状態の持ち方

| 状態                                                             | 置き場所                                                                                                                                                                       |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SessionState`                                                   | `<SessionProvider>` が持つ**React の外の store**（`applySessionEvent` で `events` を畳み、`hello` で置き換える）。部品は `useSessionSelector` で**自分が読む値だけ**を購読する |
| 接続中 / 切断中、プロトコルの版違い                              | 同じ store の snapshot に相乗りさせる（`browser/stores/session.tsx`。`SessionState` には入れない）                                                                             |
| 選んでいるターン（`turnId`）、追従中か（いちばん下を見ていたか） | `location.hash` の `turn`（`#?turn=3`。追従中は書かない）を `browser/stores/turn-selection.tsx` の Context が読んで配る（メインビューとキャラビューの両方が読む）              |
| 入力欄の下書き、候補の開閉と選択位置                             | `<Composer>` のローカル状態                                                                                                                                                    |
| 質問の選択（送る前）・何問目を見ているか・入力欄に書いた答え     | `browser/stores/question-answer.tsx` の Context（**メインビューの札と入力欄の両方が読み書きする**ので機能のローカル状態にしない）                                              |
| 経過時間の秒数                                                   | `<TurnStatus>` の1秒タイマー（`turn` の `startedAt` から計算）                                                                                                                 |
| 領域の比率                                                       | `<Layout>`。`localStorage` に**比率だけ**保存（会話は保存しない）                                                                                                              |
| 出している画面（会話 / キャラクター / 作る）                     | `location.hash` の `?` より前（`stores/screen.tsx` の `useScreen()` が `hashchange` を読む）。保存しない（URL が持つ。13.6）。hash の書き方は `stores/location-hash.ts` だけ   |

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
  `turn`（と、失敗の判定に使う `lastToolFailureAt`、「書いている」の判定に使う
  `speechCalledInTurn` / `partialUtterance`）から「いま読んでいるか、待っているか」を
  決め、**読んでいる間は呼吸だけに落とす**
- 作るのは5つ。**呼吸**（常時のごく小さい上下）/ **待っている間の移動**（ターン進行中に
  領域の中をゆっくり歩く）/ **書いている**（締めのセリフより後ろに書きかけの本文が伸びている間、
  筆を運ぶように小さく速く横へ揺れる。2026-09-23 決定）/ **完了の反応**（小さく跳ねる）/
  **失敗でびくっ**（一瞬のけぞる）
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

**機能の中の部品でも、見た目が独立しているときはその部品の隣に `<部品>.module.css` を置いてよい**
（`features/main-view/mini-portrait.module.css` / `features/sidebar/session-switch.module.css`
がその形）。分ける目安は「**その部品しか使わない class の塊になっているか**」——1つの
`*.module.css` に複数の部品の class が混ざって育ち、どれがどの部品のものか読み取りにくく
なったら、部品ごとに分ける側へ倒す（機能の1枚に戻すのが原則で、これは「その機能の中でも
部品の輪郭がはっきりしている」ときだけの例外）。

class 名は用語集の語（`balloon` / `portrait` / `turn-header` など）を**そのまま**保ち、部品からは
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
  人格も、起こし直せば確実に入れ替わる（`startSdkDriver` が `mcpServers` を毎回組み直しているので
  `setMcpServers` は要らない。2026-09-14 実測）。切り替え時に画面から消すのは吹き出し・立ち絵・
  メインビューの3つ
- **キャラクターごとに別のセッションを持つ**（2026-09-14 決定。「キャラクターごとに別の部屋が
  ある」）。セッションの印を **`tsukumo:<パック名>@<目印>`**（雑談は
  **`tsukumo:<パック名>:chat@<目印>`**。13.7。**末尾の目印はビューのポート番号そのもの**
  （`@7327` / `@7328` …）。`docs/requirements.md` 4.8「鍵」）にし、**起動時も切り替え時も、これから起こす側の印を
  持つ最新のセッションを探して `resume` する**（無ければ新規）。印の組み立ても読み取りも
  `core/session-restore.ts` の `sessionTag` / `readSessionMark` 1箇所で、
  `session-start.ts` はそれを `findSessionToResume` と `startSdkDriver` の `tag` の両方に渡す。
  **戻ってくれば、そのパックの会話も口調も戻る**
  - 画面の履歴は `readRestoredEvents` の再生をそのまま使う（8章）
  - **印はターンが終わって3秒後に付く**（`SESSION_TAG_DELAY_MS`）。ターンを1つも終えずに離れた
    パックのセッションは、次に来たときに見つからず新規から始まる
    （`docs/requirements.md` 4.8「復元できなかったときどうするか」の範囲）
- 素材が1体しか無いときも `<select>` は出す（選択肢1つ。無いように見えるほうが分かりにくい）
- パックの探し先は**同梱の `characters/`・`~/.tsukumo/characters/`・起動先の
  `characters/local/`** の3箇所。同名は後ろが勝つ（7.1）

**`systemPrompt` の append を組むのは `core/system-prompt.ts` の `takeSystemPromptAppend` 1つだけ**
（2026-09-23。それまでは並べる順を配線層が、モードごとの選び方を `core/session-rule.ts` が、人格との
連結を `adapter/character-pack.ts` が持っていた。寄せた理由は `docs/architecture.md`「新しいコードを
置く場所」）。**`persona.md` の全文を fs から読むのは adapter（`character-pack.ts`）のままで、
組み立てには文字列で渡す**ので、`core` はパックの型も fs も知らない。並びはモードで入れ替わる:

| 場面                             | append に入る節の並び                                              |
| -------------------------------- | ------------------------------------------------------------------ |
| 仕事                             | 人格 → セリフの間合い → レポートの記法                             |
| 雑談（記憶が載るとき）           | 人格 → 雑談の作法 → 前回までの要約 → 残すと決めた雑談 → 直近の雑談 |
| 雑談（続きから・写しが渡し済み） | 人格 → 雑談の作法                                                  |

- **人格が無いパックは先頭が落ちるだけ**（tsukumo 側の規約だけで起動する）
- **雑談の記憶の3節は、中身が無ければそれぞれ落ちる**（載せるかどうかの条件は下の「雑談の記憶の
  要約はどこに置くか」）
- **仕事と雑談は入れ替え**（並べない。理由は `core/chat-manner.ts` の冒頭）

### 7.1 画面から作るときの置き場と受け取り方

**書き込み先は `~/.tsukumo/characters/<name>/` の1箇所だけ。** `state.json` と同じ
`~/.tsukumo/` の下に置く。

- キャラクターの好みはプロジェクトごとではない（13.6 で `remembered-default` を cwd に
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
- **素材の URL に素材の版を混ぜる**（`?v=<更新時刻>`。7.2）。ファイル名が同じまま中身だけ
  変わるので、パックの名前（経路に入っている）だけではブラウザが取り直さない
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

2026-09-21 決定。**何を書いてよいかの正典は `docs/chat-mode.md` 4.9**（利用者については
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

- **ツールは雑談モードのときだけ載せる**（`core/system-prompt.ts` が `CHAT_MANNER_PROMPT` を
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
**何を消してよいかの正典は `docs/chat-mode.md` 4.9**で、判断は `core/chat-manner.ts` の条が
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

**画面からも1行ずつ消せる**（2026-09-23 決定。サイドバー「覚えていること」〔13.7〕の
「編集」。それまでは対象利用者は作者本人だけでファイルを直接開ける、という理由で見送っていたが、
雑談のサイドバーの器ができたので、開かずに消せる手を画面側にも足した）。
**消せるのはキャラクター自身が書き足した行だけで、消し方も `forget` と同じ**
（完全一致・節より前は触らない・同じ文面が2行あればいちばん古いほうを消す。書き込みは
`src/server/adapter/persona-memory.ts` の `forgetRememberedLineFromScreen` を通し、
`forget` ツールの裏にある `PersonaMemory` とは別の呼び口だが、突き合わせと書き込みの関数は
同じものを使う）。**1ターン1行の上限だけは掛からない**——その上限はモデルの暴走を防ぐ
ためのもので、利用者が画面から名指しした削除には要らない。

- **画面のサイドバーへ渡す形**: `SessionState.rememberedLines: readonly string[]`
  （`- ` を外した文面、古い→新しいの順）。源は `remembered-lines-changed` の1つだけで、
  **雑談で起こしたとき**（`chat-topics-changed` の直後）、**キャラクター自身の `remember` /
  `forget` で節が変わったとき**（`createPersonaMemory` の `onChange`）、**画面の「編集」から
  消したとき**のどれかで流れ直す。起こし直すと `chatTopics` と同じく初期値の空へ戻る
- **消すコマンド**: `src/shared/command.ts` の `forget-remembered-line`（`line: string`。
  消したい1行の文面そのまま、チップに出した文面を送る）。`editCharacter` と同じく**駆動には
  渡らず**、書き込みと `remembered-lines-changed` の流し直しで済む（セッションは起こし直さない）。
  **雑談モードでなければサーバも断る**（サイドバーの「覚えていること」自体が雑談中にしか
  出ないので、画面を経ない依頼の取りこぼし対策として `nudge` と同じ理由でここでも見る）
- **チップと全文**: 1行＝チップ1つのまま（決定は変えない）。**先頭20文字で切り、
  `…` を付ける。押すとその場で全文に開き、もう一度押すと閉じる**——`title` の hover にしな
  かったのは、キーボードでもタッチでも開ける手を選んだため
- **「編集」の形**: 区画の見出しの `action`（タスク一覧の「一覧を見る」と同じ枠）を「編集」⇄
  「完了」のトグルにし、押すと**各チップに × が付く**（一覧を別に開かない）。一覧を画面いっぱい
  に開く手は採らなかった——タスクの表と違って持つのは短い1行の並びだけで、区画の中で足りる
- **消す前の確認**: × を押すと確認のダイアログ（`task-run-confirm.tsx` と同じ `<dialog>` の形）
  を挟む（**消した行は戻せない**ため）。OK を押したら**サーバの返事を待たず即座に閉じる**
  （楽観的）
- **ターン中に同時に消えたとき**（キャラクター自身が同じ行を `forget` していた、など）:
  **レースは起きない**——Node は単一スレッドで、書き込みも `readFileSync` / `writeFileSync` の
  同期呼び出しなので、どちらが先に走っても片方が完全に終わってからもう片方が始まる。
  `forgetRememberedLineFromScreen` は完全一致でしか消さない**冪等な操作**なので、二重に消しても・
  行がもう無くても壊れない（一致しなければ何もせず `undefined`）。画面はどのみち次に届く
  `remembered-lines-changed` で最新になるので、**衝突を検出して待たせる仕掛けは持たない**

#### 雑談の記憶の要約はどこに置くか

2026-09-21 決定。**`~/.tsukumo/chat-summary/<パック名>.md` に1つだけ置く**（認められた例外の
範囲は `docs/chat-mode.md` 4.9「記憶の圧縮と忘却」が正典）。ここが決めるのは
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
  （最後の受け皿。`docs/chat-mode.md` 4.9）でも写しが新しくなる**
- 受け取った文字列は**ログにも画面にも出さない**（出してよいのは長さまで）
- **`/clear` も同じ口で受ける。** `conversation-cleared`（`src/server/core/sdk-message.ts`）が
  流れたら、写しの印を「未渡し」に戻す。見る場所は `relayMessages` の中で、`turn-finished` で
  `personaMemory.finishTurn()` を呼んでいるのと同じ1行の形

**最近の話題の見出しも同じ写しから取る**（2026-09-23 決定。範囲と理由は
`docs/chat-mode.md` 4.9「記憶の圧縮と忘却」。画面は 13.7「雑談のときのサイドバー」）。
別のファイルは持たない。

- **書かせ方**: `/compact` の依頼の文面（`src/server/core/chat-compact.ts` の
  `CHAT_COMPACT_COMMAND`）に、要約のいちばん最後へ `<topics>` と `</topics>` の行で挟んだ見出しを
  新しい順に3件まで（1行1件、`- ` で始める）書くよう足す。**印を XML の組にするのは**、
  `/compact` がもともと `<analysis>` と `<summary>` の組で書かせる形で、`compact_summary` にも
  その生の出力（下書きの `<analysis>` を含む）がそのまま届くから
- **取り出し方**: `chat-compact.ts` の `chatTopics`（純関数）。**最後の `<topics>` から次の
  `</topics>` まで**を読むので、下書きにも組があれば本文のほうが採られる。箇条の印を落とし、
  空行を飛ばし、3件で切る。**印が無い・閉じが無いときは空**（推し量って出さない）。依頼の
  文面と同じファイルに置くのは、印の形を両側で1つに保つため
- **流す契機は2つ**で、どちらも `chat-topics-changed` イベント（`SessionState.chatTopics` に
  畳む）: (1) **雑談で起こしたとき**（`src/server/core/session-launch.ts` が
  `chat-mode-changed` の直後に、ポート `readChatTopics` 越しに写しを読む） (2) **`PostCompact`
  で写したあと**（`sdk-driver.ts` の `chatSummaryHooks` が、**書いた直後の写しを読み直して**
  流す。上限で行が落ちたあとの写しから取るので、次に起こしたときと同じ見出しになる）。
  写しを読んで見出しにするのは core の `readChatTopics` 1つで、2つの契機はそれを呼ぶだけ
- **運ぶのは見出しだけ**で、要約の本文はブラウザへ渡らない

**渡し方は `systemPrompt` の append**（`persona.md` と同じ道。`takeSystemPromptAppend`）。
**2026-09-21 に、同じ口で直近の逐語も渡すことにした**（`docs/chat-mode.md` 4.9「直近の会話は
逐語のまま読み戻す」）。載せるかどうかの条件は下の2つで**要約の写しと逐語に共通**なので、
**判断は1箇所にまとめる**。

- **載せる条件は2つで、どちらかに当たれば載せる**: (1) 続きから始めない（`SessionLaunchSeed.resume`
  が `undefined`） (2) 続きから始めるが、**写しの印が「未渡し」**。どちらでもなければ載せない
  （`resume` した文脈に claude 側の要約が既にある）。**判断そのものは core の中で閉じる**
- **`/clear` を「続きから始めない」では拾えない。** 印はターンが終わるたびにそのときの
  セッションIDへ付け直され、`/clear` の直後は新しい `session_id` になる（`sdk-driver.ts` の
  `relayMessages` と `sdk-session.ts` の `scheduleMarkSession`）。だから**`/clear` のあと1ターン回せば空のほうが印を
  持ち**、次の起動は `seed.resume !== undefined` で始まる。条件(2)が無いと、そのパックの記憶は
  `TSUKUMO_NEW_SESSION=1` を使うまで戻らない
- **印が無い・読めないときは「未渡し」として扱う。** 倒れる方向を「同じ要約が2度載る」側にして、
  **黙って記憶が消えるほうへ倒さない**
- **載せたら印を「渡し済み」に戻す**（同じ写しを起こし直しのたびに重ねない）
- **雑談のときだけ**渡す（`personaMemory` と同じ単位。`system-prompt.ts` が規約を選ぶのと同じ境目）
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
  `docs/chat-mode.md` 4.9）
- 世代バックアップを採らないのは 7.1 と同じ理由（会話をきっかけに書いたものの残る場所を増やさない）

**層の切り方は `persona.md` の書き戻しと同じ**: 口（型）は `core/session-driver.ts`、ファイルに
触るのは `adapter`、結ぶのは配線層（`src/session-start.ts`）。

**`~/.tsukumo/` の中身は `state.json`・キャラクターパックのディレクトリ・雑談の要約の写し・
雑談の会話のアーカイブ（下）の4つ**（9章）。

#### 雑談の会話のアーカイブはどこに置くか

2026-09-21 決定。**残すかどうかと何を残すかの正典は `docs/chat-mode.md` 4.9
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
  同じ理由。`docs/chat-mode.md` 4.9）。**書く材料は届いたイベントそのもの**
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
  （`docs/chat-mode.md` 4.9。**読む側が落とすのではなく、口が最初から渡さない**）
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
| 読み戻す量 | **64 KiB**（文面のバイト数。`docs/chat-mode.md` 4.9）    |
| 消す手     | ファイル・ディレクトリを消す（日ごと・パックごと・全部） |

- **`8 KiB` のような上限を持たせない。** 要約の写しに上限があるのは**要約が会話の写しに育つ
  経路を塞ぐため**で、こちらは会話を残すことが目的なので、同じ理由が当たらない
- 画面から消す口は作らない（7.1 の「覚えたこと」と同じ理由）

#### 「残す」旗はどこに置くか

2026-09-21 決定。**立てるかどうか・何のためかの正典は `docs/chat-mode.md` 4.9
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

**誰がいつ書くか。** 旗を立てるのは `keep` ツール（`src/server/adapter/sdk-tool.ts`）、書くのは
**ターンの終わり**。

- **ツールは引数を取らない**（指せるのはそのターンだけ。`docs/chat-mode.md` 4.9）。戻り値は
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

2026-09-21 決定。**持つかどうか・何のためか・誰が書くかの正典は `docs/chat-mode.md` 4.9
「古い雑談は索引を引いて思い出す」**（見出しを書くのも引くのもキャラクター自身・1ターンに1行・
1回 8 KiB）。ここが決めるのは**どこに・どんな形で書き、どう引くか**と上限。

**置き場は `~/.tsukumo/chat-archive/<パック名>/index.jsonl`。**

- **アーカイブと同じディレクトリ**（索引はそのパックの会話に付く目次で、別の親に分ける理由が無い）。
  **パックをまたがない** — 雑談のセッションがパックごとに分かれているのと同じ単位
- **日付のファイルとは名前で見分ける。** 窓の側は `YYYY-MM-DD.jsonl` にだけ当たる正規表現で
  ファイルを選ぶので、`index.jsonl` は**窓の走査に混ざらない**（`kept.jsonl` と同じ）
- **日ごとに割らない。** 1ターンに1行・区切りがついたときだけ書くので、1日に数行になっても
  太り方は日数と区切りの数で読める

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
  1日に数行なので JSONL のままでも目で読める
- **同じ日に2行以上あっても、行は書き換えず追記するだけ。** 区切りがつくたびに書くので同じ日に
  何行あってもよく、**読む側はその日の行を全部照合の対象にする**（`matchedIndexDates` はどれか
  1行にでも当たればその日を拾う。追記だけなら途中で止まっても被害が1行で済む性質は崩れない）
- **`v` を上げない。** 日付のファイルも `kept.jsonl` も1バイトも変わらない

**誰がいつ書くか。** 書くのは `index` ツール（`src/server/adapter/sdk-tool.ts`）で、
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
  （言葉のずれを吸収するのが索引の役。足りないより多いほうへ倒す）。**同じ日に行が複数あっても
  全部照合の対象**で、どれか1行にでも当たればその日を拾う。**`date` も照合の対象**なので、
  `2026-09-21` のような鍵でも引ける
- **`grep` を起こさない。** 外部コマンドを増やすにはユーザーの承認が要るうえ、索引は1日に数行
  止まりなので `node:fs` で読んで絞るだけで足りる（`docs/chat-mode.md` 4.9）
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

| 何           | 決め                                                                             |
| ------------ | -------------------------------------------------------------------------------- |
| 積み重ね方   | **追記**（1行1件、上書きしない。同じ日は行が増え、どれに当たってもその日を拾う） |
| 1行の上限    | **120文字**（`remember` の1行と同じ値。超えた行は書かない）                      |
| 書ける数     | **1ターンに1行**                                                                 |
| 索引の上限   | **持たない**（1日に数行止まりなので、太り方が日数と区切りの数で読める）          |
| 読み戻す量   | **8 KiB**（文面のバイト数。窓の 64 KiB・旗の 8 KiB とは**別に**数える）          |
| 引ける数     | **1ターンに1回**                                                                 |
| 消す手       | `index.jsonl` を消す（索引が全部落ち、**会話そのものは残る**）                   |
| 画面から消す | **口を作らない**（7.1 の「覚えたこと」・アーカイブ・旗と同じ）                   |

### 7.2 パックの一覧と素材の URL

2026-09-23 決定。キャラクター画面は**使用中以外のパックも**一覧（顔・名前・表情の枚数・使用中か）と
詳しい設定（立ち絵・差し色・背景・ひとこと）に出し、そこで編集もできる（`docs/screen-design.md`
13.6）。そのために**全パックぶんの画面向けの形をサーバが組んで配り、素材も全パックぶん配る**。

**1件の形は `CharacterPackEntry`**（`src/shared/character.ts`。フィールドの意味は型の doc コメントが
正典）:

- **サイドバーの選択肢（`CharacterPackChoice`。`name`・`label`）を含み**、姿（`character`）・
  `inUse`・`deletable` を足す。選択肢だけを読む `<select>` には一覧をそのまま渡せる
- **姿は `CharacterInfo` をそのまま入れ子で持つ。** 使用中のパックの姿を読む部品に使用中以外の
  パックの姿を同じ型で渡せ、画面向けの型が2つに割れない。平らに広げないのは、
  `CharacterPackChoice.name`（ディレクトリ名）と `CharacterInfo.name`（表示名）がぶつかるため
- **表情の枚数は `character.expressionsWithPortrait` の数、変えられるかは `character.editable`**
  から読み、重ねて持たない

**変えられるか・消せるかはサーバが決めて持たせる。** `editable` は 7.1 の `isEditableCharacterPack`
（起動先の `characters/local` と同じ名前のパックだけ false）。`deletable` は**消す口がまだ無いので
どれも false**（使用中のパックは口ができても false のまま）。画面は理由を推し量らず、この2つを見て
口を出し分ける。

**一覧を配り直す契機: `character-changed` を組むたびに一覧を読み直す**（`src/current-character.ts`
の `event`）。起こす・起こし直す・画面から変える・作るのどれも最後に `event()` を返すので、
**パックの集まりを変える口（これから足す「消す」も）は「書いたら `event()` を返す」だけで一覧が
配り直される。** 読み直しを口ごとに呼ぶ形にしないのは、1つ呼び忘れると古い一覧が黙って配られる
ため。読み直しは置き場の `readdir` と各 `character.json` の読み取りだけで、流れる回数も少ない。
素材を配るときに突き合わせる一覧も、最後に `event()` で読んだものを使う（配った URL が 404 に
ならない）。

**素材の URL は `/character/<pack>/<file>?v=<版>` の1つの形に揃える**（使用中のパックも同じ）:

- 使用中だけ `/character/<file>` を残すと、同じパックの姿が使用中かどうかで違う URL を持ち、
  持ち替えのたびに URL が変わり、配る側にも経路の読み方が2つ残る
- パック名とファイル名は**それぞれ `encodeURIComponent` した1区間**。組み立て
  （`characterAssetPath`）と読み分け（`readCharacterAssetPath`）は `src/shared/character-asset.ts`
  の1箇所で、区切りの `/` がちょうど1つでない経路・デコードできない経路は引きに行かずに 404
- **取り直しの印（`?v=`）は素材の版（更新時刻）だけ。** パックの名前は経路に入ったので、別の
  パックの同じファイル名（`default.png` など）とは印が無くても URL が分かれる。配る側は `?` 以降を
  見ない
- **配ってよいのは、一覧にあるパックの、そのパックの定義に載っているファイル名だけ**
  （`readCharacterAsset` → `readCharacterPackFile`。allowlist はパックごと）。パック名も一覧と
  突き合わせるだけでパスにしないので、無いパック名・`..` を含む名前・別のパックの定義にしか無い
  名前は自然に 404 になる
- **一覧の中の、使用中と同じ名前の1件は使用中のパックに置き換える**（一覧に無ければ末尾に足す）。
  `TSUKUMO_CHARACTER` で一覧の外を指したときや、一覧を読んだあとに持ち替えたときも、画面に出す
  もの・配るものが「いま出しているもの」とずれない
- 素材はトークン無しで配る（9章。会話を含まない静的な物なのは使用中以外のパックでも同じ）

## 8. セッションの復元と複数化

**復元の決定は `docs/requirements.md` 4.8 のまま**（`cwd` + tsukumo の印（パックごと。7章）、
常に自動で続きから、**復元のためには**会話を保存しない、失敗したら新規で起こす）。**雑談の会話の
アーカイブ（7章）は復元の材料ではない** — 画面を組み直すのは今までどおり transcript からで、
アーカイブは読み戻さない。新しい形では次が楽になる。

- 画面の履歴の組み直しは「`getSessionMessages` → `SessionEvent[]`（時刻付き）→ `session-manager` の
  `state` に畳む」だけ。接続したブラウザは `hello` の snapshot でそのまま同じ姿になる
  （**ブラウザ側に復元の特別な経路は要らない**）
- 逃げ道は `TSUKUMO_NEW_SESSION=1`（起動時）と、画面から新規に起こすコマンド（`ClientCommand` に
  はまだ足していない）
- **どのセッションの続きから始めるかは画面から選べる**（2026-09-22。サイドバーの「セッション」の
  `<select>` → `switch-session` → `session-launch` の起こし直し）。並ぶのは**同じパック・同じモードの、
  目印（`@7327` / `@7328`）違い**で、新しいほうから `MAX_SESSION_CHOICES` 件まで。**起動時は今までどおり
  自動で続きから始まる**（選ばせる画面は出さない）

**複数化は当面やらない**（2026-09-21 決定。`docs/requirements.md` 2.2。それ以前は未決事項
だった）。**`SessionManager` はセッションを1つだけ持ち、鍵（`sessionId`）を持たない**
（2026-09-23 に外した）。キャラクター・雑談モード・セッションの切り替えは、同じ `SessionManager` の
中で駆動を起こし直す（何代目かの印で古い駆動のイベントを捨てる）ので、古い側と新しい側を
並べて持つ場面が無い。`hello` も `sessionId` を名乗らない（画面に出るセッションのIDは
`SessionState` の側にある claude 自身のID）。広げるときの形はここに描かない
（要件から落としたので、描いておくと布石として読まれる）。

## 9. 会話内容と安全

`docs/coding-standards.md`「会話内容の扱い」は最優先のまま。新しい形で変わる点と変わらない点:

| 項目                                               | 扱い                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| バインド先                                         | `127.0.0.1` だけ。変えない                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Origin                                             | WebSocket の upgrade で確かめる（いまの POST と同じ規則。`Origin` が無ければ通す、あれば自分と一致）                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 起動トークン                                       | 起動ごとに乱数を1つ作り、`/ws?t=` で要求する。ページの URL に付けて配る（`showView` に渡す URL に含む）。同じマシンの別プロセスが `127.0.0.1:7327` を読める、という既知の割り切りを塞ぐ                                                                                                                                                                                                                                                                                                                                                           |
| ディスク                                           | 会話を**書く**のは**2つの例外だけ**（下の「雑談の要約の写し」と「雑談の会話のアーカイブ」。その次の行は書かずに**読む**ほう）。`bun build` の出力もメモリ。`localStorage` に置くのは領域の比率だけ（キャラクターパックへ書くのは**会話ではなくキャラクターの属性1行**だけ。下の行）                                                                                                                                                                                                                                                               |
| ブラウザ側のメモリ                                 | `SessionState` として会話の一部を持つ。**同じオリジンの `127.0.0.1` のタブの中に閉じる**（いまも DOM として持っている。持ち方が変わるだけ）                                                                                                                                                                                                                                                                                                                                                                                                       |
| ログ                                               | `error` フレームの `reason` は定型文。サーバの stderr に会話を出さない（いまのまま）                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 雑談の記憶の要約                                   | 作るのは claude 自身の圧縮（`/compact`）で、tsukumo がするのは容量を数えて圧縮を頼むことと、区切りを画面に出すことだけ。**要約の文面は画面にも `error` フレームにも stderr にも出さない**（画面に出すのは写しから取り出した話題の見出しだけ。7章）                                                                                                                                                                                                                                                                                                |
| 雑談の要約の写し                                   | `~/.tsukumo/chat-summary/<pack>.md` に**最新の1つだけ**を上書きで持つ（8 KiB まで）。**ユーザーが 2026-09-21 に認めた「別の場所に複製しない」の例外の1つ目**（範囲と理由は `docs/chat-mode.md` 4.9、形と上限は7章）。載せ直すのは**雑談のセッションの `systemPrompt`** で、条件は「新規に起こした」か「`/clear` を見たあと」の2つ（写しの1行目の印が持つ）                                                                                                                                                                                        |
| 雑談の会話のアーカイブ                             | `~/.tsukumo/chat-archive/<pack>/<日付>.jsonl` に、雑談の依頼とセリフを表情つきで1行ずつ追記する。**ユーザーが 2026-09-21 に認めた「別の場所に複製しない」の例外の2つ目**（範囲と理由は `docs/chat-mode.md` 4.9、形と上限は7章）。**画面の 100 ターンには影響されない。** 画面にも `error` フレームにも stderr にも出さない                                                                                                                                                                                                                        |
| 直近の雑談を逐語で読み戻す                         | アーカイブの**新しいほうから 64 KiB まで**を読み、**雑談のセッションの `systemPrompt`** へ逐語のまま載せる。載せる条件は要約の写しと同じ2つ。**渡す先はそこだけ**で、画面にも `error` フレームにも stderr にも出さず、**仕事の側の文脈にも載せない**。逐語が新しいセッションの transcript に書かれることは承認に含まれる（範囲と量は `docs/chat-mode.md` 4.9「直近の会話は逐語のまま読み戻す」、読み口は7章）                                                                                                                                     |
| 人格への書き戻し（覚えたこと）                     | 雑談で覚えたことを `~/.tsukumo/characters/<pack>/persona.md` の末尾の節へ1行ずつ足す。**利用者については書かない**（範囲は `docs/chat-mode.md` 4.9、形と上限は 7.1）。会話の文面はディスクに届かない                                                                                                                                                                                                                                                                                                                                              |
| コンテキストの内訳の記録                           | `~/.tsukumo/context-usage/<日付>.jsonl` に、**セッション1つにつき1行**だけ積む（最初のターンが終わったとき、`detail: "full"` で取った値）。**会話の複製ではない** — 入るのは数と、SDK が内訳として返す名前（分類の表示名・MCP ツール名・メモリファイルのパス・スキル名）だけで、文面の口が型に無い。**ターンごとのトークン消費の記録（`~/.tsukumo/token-usage/`）とは置き場も版も分ける** — 「書いてよいもの」の線が種類ごとに違い、同じファイルに混ぜると広いほうの線が狭いほうにもかかるため（線の正典は `src/shared/context-usage-record.ts`） |
| テストのフィクスチャ・fake driver の疑似セッション | 手で書いた架空の会話だけ                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

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

| 直した場所                       | どうなるか                                                                                                       |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `src/browser/**/*.css`           | ページを読み込み直す（下の注記）。状態は繋ぎ直しの `hello` で戻る                                                |
| `src/browser/` の `.ts` / `.tsx` | ページを読み込み直す（`refresh` の `page`）。状態は繋ぎ直しの `hello` で戻る                                     |
| `src/shared/`                    | **プロセスの上げ直しが要る**（下）。上げ直すまで画面の組み直しも止まる                                           |
| `src/server/core/` `src/` 直下   | **プロセスの上げ直しが要る**。サーバ側のコードは動いているプロセスの中にある。上げ直すまで画面の組み直しも止まる |

**CSS だけを取り直す道（`refresh` の `style`）は使わない**（2026-09-20）。CSS Modules の class 名は
ハッシュ化されて JS 側の対応表にも焼かれるので、片方だけ新しくすると綴りが食い違って崩れた画面が
残る。`shared` には `style` が残っているが、押すのは常に `page`。

`src/shared/` を見張らないのは、**畳み込み（`session-state.ts`）がサーバ側でも回っている**から。
ブラウザ側だけ新しくすると、新旧が食い違ったまま動く状態ができる。片方だけ救うより
「`src/browser/` だけが救える」という1本の線のほうが信用できる。

**サーバ側のソースが起動時から変わっていたら、組み直さない**（2026-09-23 決定）。見張るのは
`src/browser/` だけでも、**組み立ては import で辿れる `src/shared/` も束ねる**。tsukumo の中の
Claude が同じ作業ツリーで `git merge main` を打つと `src/browser/` と `src/shared/` が一度に
変わり、見張りが新しい契約の画面を組んで古いサーバへ配っていた（版が合わない知らせが出て、
読み込み直しても同じ画面が配られるので戻れなかった）。そこで見張りの始めに**サーバ側のソース
（`src/` の下で `browser/` 以外）の中身の指紋**を取り、組み直す前に取り直して比べる
（`src/server/adapter/source-fingerprint.ts`）。違えば組み立てず、前の版を配り続けて理由の1行を
ペインに出す（組み立てに失敗したときと同じ扱い）。**時刻ではなく中身で比べる**ので、同じ中身へ
書き戻されただけなら組み直しは止まらない。指紋が取れなかったときは止める根拠が無いので組み直す。

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

**足す依存**（**2026-09-13 に「移行しようか」の
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
