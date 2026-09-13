# アーキテクチャの再考（2026-09-13）

**この文書は調査メモであって正典ではない。** `docs/` の他ファイルにある「節の索引」はここには作らない。
**2026-09-13 に移行を決定し、設計は `docs/design.md` に落とした。** ここは経緯（症状・採らなかった案・
判断の基準）として残す。設計の中身は `docs/design.md` を読む。

**問いの出どころ**: ユーザーの言葉「今の tsukumo の機能を見て、このような機能を実現するときの最適な
アーキテクチャを再考して提案してくれる? 今の決まりや規約にとらわれず、今後の機能拡張や改修に
耐えられ、メジャーで参考資料がそれなりに多いと助かる。言語やエコシステムから見直してもいい」。

**前提として読んだもの**: `src/` 全体（2026-09-13 時点、約 15,000 行。テスト含む）、`docs/requirements.md`、
`docs/architecture.md`、`docs/coding-standards.md`、`docs/research/app-shell.md`、
`docs/research/view-rendering.md`、`develop/tasks.json` の残タスク、`docs/history/direction.md` の
2026-09-11 の節、`node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`（v0.3.268）。

## 結論

**言語とランタイムは変えない（TypeScript、当面 Bun）。変えるのは「描く」層の重心で、
「サーバが HTML を組み立てて押し、ブラウザが morph で当てる」形から、
「共有の型付きプロトコルでイベントを押し、ブラウザ側のコンポーネントが状態から描く」形へ移す。**
SDK の駆動・`speak` ツール・答え待ちの列・イベントの畳み込み・会話を外へ出さない原則は、
そのまま残す（ここは今の設計の資産で、直す理由が無い）。

理由を1つに絞ると: **これから足したい機能の重心が、ブラウザ側の「状態を持つ部品」に移っている。**
キャラクターの動き（表情の遷移・まばたき・登場と退場の演出。**声は出さない**）、複数セッション、
入力履歴、質問の複数選択、Electron 化。どれも「HTML 文字列を丸ごと押して morph する」設計が
最も苦手とするもので、いまの方式で1つずつ足すと `browser/` に配線モジュールが増え続ける
（`develop/progress.md` の未解決「`multiSelect` の挙動が単一選択的かもしれない」はその最初の症状）。

**ただし、いま決めるのは「向き」だけでよい。** 移行は領域ごとに併走でき、最初の1段
（Markdown レンダラの置き換え）は今の形のままでも価値がある（下の「移行の順番」）。

## いまの形の評価

### 残すもの（設計の資産）

| もの                                                                      | 理由                                                                                                                       |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Agent SDK で Claude Code を動かす（`session-driver.ts`）                  | 唯一の現実解。headless CLI は中断と許可ツールが無い。SDK を import する場所を1ファイルに閉じているのも正しい               |
| `speak(text, expression)` を MCP ツールで受ける                           | 「呼ばれた事実が分離」という設計は本質的。戻り値 `"ok"` で逆流を断つのも良い                                               |
| `SessionEvent` の判別可能な union と `applySessionEvent` の純粋な畳み込み | これは**そのまま「共有プロトコル」の核になる**。テストが集中しているのもここ。捨てるどころか両側（サーバ・ブラウザ）で使う |
| 答え待ちの列（`pending-answer.ts`）                                       | `canUseTool` の Promise を保留する形は SDK の契約に素直                                                                    |
| 会話をプロセスの外へ出さない・`127.0.0.1` だけ・ディスクに書かない        | 変えない。ブラウザ側で状態を持つ形にしても、同じマシンの同じオリジンのメモリに留まる点は今と同じ                           |
| キャラクター定義を外に出す（原則4）                                       | これを**人格まで含めた「パック」に拡張する**（下の「キャラクター層」）                                                     |
| 起動時に `bun build` で束ねてメモリから配る                               | React / TSX も `bun build` はそのまま束ねられる。ビルド工程を増やさずに移れる                                              |

### 限界（症状つき）

1. **描画がサーバ側の文字列組み立てに寄っている。** `presentation/view.ts` 1,628 行 + そのテスト 3,224 行。
   テストは HTML の文字列一致なので、見た目を1箇所変えると大量に落ちる（T-088 が「1バイトも変えない」を
   完了条件にせざるを得ないのはこのため）。
2. **ブラウザ側の状態が暗黙。** 選択中のタブは `MutationObserver` で差し替え後に付け直し、答え待ちの箱は
   `data-pending` 属性、経過時間はブラウザの変数、候補の開閉は `keydown` の分岐。部品ごとに別々の
   仕組みで状態を持っていて、**部品同士が状態を共有する手段が無い**。
3. **通信の経路が5本＋6本。** SSE が `main` / `character` / `sidebar` / `turn-status` / `pending-answer` の
   5本（HTML と JSON が混在）、POST が `prompt` / `interrupt` / `answer` / `permission-mode` / `model` /
   `commands` の6本。機能を1つ足すたびに `index.ts` → `view-server.ts` → `browser/` の3箇所へ
   コールバックを通す（`startViewServer` の引数は9個）。
4. **Markdown レンダラとサニタイザが自前。** 引用・ネスト・水平線・列揃えが描けず（T-063）、
   その制約を**書き手（モデル）への規約**として押し付けている（`report-notation.ts`）。同梱の
   mermaid が 3.3MB ある以上、「依存ゼロ・容量」の理由は弱い。HTML サニタイザを自前で持つのは
   保守と安全の両面で標準から外れている。
5. **トークンごとに全領域を組み直している。** 断片1つで `buildMainBody` が3ターンぶんの Markdown を
   描き直す（100ms のスロットルはあるが、ターンが長いほど1回の組み立てが重くなる）。
6. **層をまたぐ型の複製。** `CharacterAssetsLike` / `TurnStatusSnapshot` / `PERMISSION_MODES` の
   写しなど、「import しない」を守るために同じ形を複数箇所に書いている。共有パッケージが無いことの
   裏返し。
7. **1プロセス = 1プロジェクト = 1ページ。** 複数プロジェクトで同時に起こすとポートをずらす
   （7327〜7346）。「キャラと一緒に」を複数のプロジェクトにまたがって続ける形にはならない。

**T-069（2026-09-12、フレームワークを入れない）の判断は当時の3つの不足に対しては正しかった。**
ここで論点が変わったのは「不足を埋める」から「これから足すものに耐える」へ問いが動いたため。

## 目指す形

```
┌──────────────────────────────────────────────────────────┐
│ ui（ブラウザ。React + 共有の reducer）                     │
│   Main / Character / Sidebar / Dispatch = 状態から描く部品  │
│   状態 = protocol の SessionState（reducer は core と同じ物）│
└───────────────▲──────────────────────────┬───────────────┘
                │ ServerFrame（snapshot / events）│ ClientCommand
                │      1本の WebSocket（127.0.0.1）  ▼
┌──────────────────────────────────────────────────────────┐
│ core（Bun。将来は Node でも動く）                           │
│   session-driver（SDK。ここだけが SDK を import）          │
│   session-manager（1つ → 複数へ広げられる形）              │
│   character-pack（定義・素材・人格を1単位で読む）          │
│   server（http: 静的配信 / ws: フレーム）                  │
└───────────────▲──────────────────────────┬───────────────┘
                │ SDKMessage                    │ query / interrupt / canUseTool
┌──────────────────────────────────────────────────────────┐
│ Claude Code（SDK が起こす子プロセス）                       │
└──────────────────────────────────────────────────────────┘
        protocol（domain の語彙 + reducer + zod スキーマ。ui と core の両方が import する）
```

### ディレクトリ（いまの4層との対応）

| 新                   | 中身                                                                                          | いまの層との対応                                      |
| -------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `src/protocol/`      | `SessionEvent` / `SessionState` / `applySessionEvent` / `ClientCommand`・`ServerFrame` の zod | `domain` + `usecase/session-view.ts`                  |
| `src/core/`          | SDK 駆動・セッション管理・キャラクターパックの読み込み・HTTP/WS サーバ・環境変数              | `infrastructure` + `usecase/event-sink.ts` など       |
| `src/ui/`            | React のコンポーネント・hooks・CSS。`bun build --target=browser` で束ねる                     | `presentation`（HTML 組み立てとブラウザ側 JS の両方） |
| `src/cli.ts`         | 配線（composition root）                                                                      | `index.ts`                                            |
| `characters/<name>/` | `character.json` + `persona.md` + 素材                                                        | `characters/`（人格が加わる）                         |

依存の向きは `protocol ← core`、`protocol ← ui`、`core ⟂ ui`（互いに import しない）。
`test/architecture.test.ts` の検査はこの3辺に書き換えれば流用できる。

### 通信: 1本の WebSocket に統一する

- **下り**は `ServerFrame = { type: "snapshot", state } | { type: "events", events: SessionEvent[] }`。
  接続直後に `snapshot`、以降は 50〜100ms でまとめた `events`。再接続しても `snapshot` から戻れる
- **上り**は `ClientCommand = prompt | interrupt | answer | setModel | setPermissionMode | switchCharacter | newSession | …`。
  zod のスキーマ1つで検証し、サーバは `switch (command.type)` 1箇所で駆動に渡す
- **ブラウザは同じ `applySessionEvent` で畳む**（isomorphic）。サーバとブラウザの状態が構造的に一致し、
  セッション復元（T-078）は「transcript から起こしたイベントを流す」だけで両側とも戻る
- SSE でなく WebSocket にする理由は、上りが6本の POST に散っているのを下りと同じ1本にできること。
  **SSE ＋ POST 1本（`/api/command`）でも成立する**ので、ここは好みの範囲。`ws` パッケージは Bun でも
  Node でも動く（`Bun.serve` の WebSocket に寄せない）
- `Origin` の検査はいまの POST と同じ。加えて**起動ごとのトークンを URL に付ける**ことを勧める
  （同じマシンの別プロセスから読める、という既知の割り切りを1行で塞げる）

### 描画: React + 共有 reducer + unified の Markdown

| 層             | 選ぶもの                                                                          | 代替                                         | 理由                                                                                                                                                                       |
| -------------- | --------------------------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| コンポーネント | **React 19**（`bun build` の TSX でそのまま束ねる。Vite は HMR が欲しくなったら） | Preact（API 互換・4KB。alias で差し替え可）  | 参考資料の量が桁違い。AI チャット UI の部品（assistant-ui、AI SDK の UIMessage）、Live2D / Lottie の web 例、Electron との組み合わせが全部 React 前提                      |
| 状態           | `useReducer` + Context に **protocol の reducer をそのまま渡す**                  | zustand（配り方が面倒になったら）            | reducer は既にある。新しい状態管理を学ぶ必要が無い                                                                                                                         |
| Markdown       | **unified**: `react-markdown` + `remark-gfm` + `rehype-raw` + `rehype-sanitize`   | `streamdown`（Vercel。流れる Markdown 専用） | 引用・ネスト・水平線・列揃え（T-063）が最初から描ける。`rehype-sanitize` の schema に `note` / `badge` / `cols` / `card` の語彙を許可すれば自前サニタイザ（398行）が消える |
| コードの色付け | `rehype-highlight`（highlight.js のまま）                                         | shiki                                        | いまの資産をそのまま                                                                                                                                                       |
| 図・グラフ     | mermaid / Chart.js は**部品として**遅延読み込み                                   | —                                            | `useEffect` で描く。morph に消されない安定した DOM を持てる                                                                                                                |
| CSS            | いまの `.css` をそのまま。部品ごとに分ける                                        | CSS Modules（`bun build` が対応）            | 700行の資産を捨てない                                                                                                                                                      |

**流れる本文**: 完成したブロックは memo し、書きかけの末尾ブロックだけ描き直す。トークンごとに
3ターンぶんを描き直す今の形より軽くなる。未終端のコードフェンスの扱いは `streamdown` が参考になる。

**メインビューの語彙**: いまの `MainViewEntry`（request / question / tool / detail）は、AI SDK の
`UIMessage.parts`（text / tool-invocation / reasoning …）とほぼ同じ形になっている。名前だけでも
業界の形に寄せておくと、参考資料をそのまま読める（`Turn { request, parts[], status }`）。

### キャラクター層: 「パック」を1単位にする

いま人格は `~/.claude/output-styles/asuna.md`（全プロジェクト共通の TUI 向け）にあり、素材は
`characters/tsukumo-spirit/` にある。名前も一致していない（人格は Asuna、立ち絵はつくもの精霊）。
キャラクターの切り替え（T-064）は、**人格を素材と同じ場所へ持ってくる**のがいちばん筋がよい。

```
characters/<name>/
  character.json   … name / portraits / outfitAccents / expressions（名前とラベル）/ speechMarker / voice
  persona.md       … tsukumo が systemPrompt.append で足す人格（speak の使い方を含む）
  *.svg / *.png    … 素材
```

- 切り替えは「別のパックでセッションを起こし直す」（`Query.reinitialize` / `setMcpServers` で
  `speak` の enum を作り直せるかは要スパイク。効かなければ起こし直しに倒す）
- **グローバルの出力スタイルと二重にならないようにする**必要がある。候補は
  `applyFlagSettings({ outputStyle })` で tsukumo のセッションだけ中立のスタイルに切り替えるか、
  `settingSources` からユーザー設定を外すか。後者は orca の hooks も外れるので**要確認**
- 立ち絵の動き（表情の遷移・まばたき・登場と退場の演出。**声は出さない**）は `Character` 部品の中の状態機械に
  なる。ここが React（部品のライフサイクル）を選ぶ最大の理由の1つ。Live2D / Spine の web SDK も
  「安定した canvas 要素」を前提にしており、morph の設計とは相性が悪い

### セッション管理: 1つから複数へ広げられる形にしておく

すぐに複数にする必要は無い。**`sessionId` を鍵にした `SessionManager` を1つ置き、いまは要素1つ**
で始めればよい。これだけで、後から次へ広げられる。

- 複数プロジェクトを1つの画面で切り替える（ポートずらしが要らなくなる）
- `tsukumo` コマンドが「常駐へ接続して cwd を登録し、画面を前面にする」クライアントになる
  （tmux / docker / language server と同じ client–daemon の形。参考資料は多い）
- セッションの一覧・復元・削除を画面から扱う（SDK に `listSessions` / `getSessionMessages` /
  `tagSession` / `deleteSession` / `renameSession` がある）
- `startup()`（CLI の事前起動）で最初の依頼までの待ちを縮める

### テスト: 「偽の駆動」を1つ持つ

- **reducer のテスト**（`protocol`）はいまの `session-view.test.ts` をそのまま持ち越す
- **部品のテスト**は Testing Library の流儀（役割・文言で当てる）。HTML の文字列一致はやめる
- **偽の駆動**（`SessionDriver` を台本どおりに `SessionEvent` を流す実装に差し替える。
  `TSUKUMO_DRIVER=fake` など）を用意する。**claude を起こさずに画面全体が動く**ので、目視・
  Playwright・スクリーンショットが決定的にできる。「7327 番の常駐を落とさない」「API を消費する」
  という運用上の気遣いが減る
- 層の検査（`architecture.test.ts`）は `protocol ← core` / `protocol ← ui` / `core ⟂ ui` に書き換える

### 箱: いま決めない。二層にしておけば両方に開く

`docs/research/app-shell.md` の比較はそのまま有効。二層（core + ui）にしておくと:

- **Electron**: `BrowserWindow.loadURL("http://127.0.0.1:<port>/")` で済む。core は「`Bun.*` に
  寄せない」規約のおかげで **Electron の Node（utilityProcess）でそのまま動かせる**ので、
  Bun の同梱すら要らなくなる。参考資料は最多（VS Code、Claude Code / Codex のデスクトップ版）
- **Tauri v2**: core を `bun build --compile` で単一バイナリにしてサイドカーにする。軽いが Rust の
  toolchain が要る
- どちらでも ui は変えない。**参考資料の多さを優先するなら Electron**、常駐の軽さを優先するなら Tauri

### 言語・ランタイム・エコシステム

| 論点       | 結論                                | 理由                                                                                                                                                    |
| ---------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 言語       | **TypeScript のまま**               | Agent SDK は TS と Python のみ。ブラウザ側はどのみち JS なので、reducer とプロトコルを**両側で同じコード**にできるのは TS だけ。Python にする利点は無い |
| ランタイム | **当面 Bun。Node 互換を保つ**       | 開発の速さ（TS 直実行・テスト・バンドラ・`--compile`）は Bun。Electron に行くときは Node で動くことが効く。いまの「`Bun.*` に寄せない」規約は残す       |
| バンドラ   | `bun build`（起動時・メモリ）のまま | TSX も CSS も束ねられる。HMR が欲しくなったら Vite を**開発時だけ**足す                                                                                 |
| UI         | React                               | 上の表                                                                                                                                                  |
| Markdown   | unified（remark / rehype）          | 上の表                                                                                                                                                  |
| 検証       | zod（既に依存にある）               | プロトコルの境界で1回                                                                                                                                   |
| 構成       | `src/{protocol,core,ui}`            | ワークスペース（`packages/`）にするほどの規模ではまだ無い。必要になったら分ける                                                                         |

## 採らない案とその理由

- **Python の SDK + Web UI**: 言語が2つになり、reducer を共有できない。得るものが無い
- **Rust / Go の core**: SDK が無い。CLI の stream-json を直接叩く形に戻ることになり、中断と許可ツールの
  問題（3章）を再び抱える
- **Next.js / Remix などのフルスタック枠組み**: ページ遷移もサーバルーティングも無い。SDK を抱えた
  1プロセスに別のサーバ枠組みを重ねることになる（`view-rendering.md` の評価のまま）
- **HTMX / Datastar / Turbo**: 「サーバが HTML を作る」一族。**いまの設計の延長線上**にあり、上の
  症状 1〜2（ブラウザ側の状態）を解かない
- **Svelte / Solid / Lit**: 技術的には十分だが、「参考資料の多さ」という条件で React に劣る。
  Lit はサーバ HTML と併用できる利点があるが、AI チャット UI の部品資産が薄い
- **全部を一度に作り直す**: 下の順番で領域ごとに移す。2026-09-11 の「作り直し前提で使えるものだけ拾う」
  と同じ進め方

## 規約への影響

移るなら先に直すもの（コードより先に正典を直す、という 2026-09-11 の進め方に合わせる）。

- `docs/architecture.md`「描画にフレームワークを入れず…」: **論点が変わったこと**を注記して置き換える
- 同「ビューの更新は Server-Sent Events で押す」: WebSocket 1本に置き換える理由を書く
- 同「層をディレクトリで表し…」: 4層 → `protocol` / `core` / `ui` の3つに
- `docs/coding-standards.md`「会話内容の扱い」: ブラウザ側のメモリに会話の状態を持つが、同じ
  オリジンの `127.0.0.1` に閉じる点は変わらない、と1文足す
- `docs/requirements.md` 2.2「外部の Markdown ライブラリを同梱しない」（T-062 の決定）: **覆す**。
  理由は上の症状4
- `CLAUDE.md` の「`Bun.*` に寄せない」は残す。「テストのためだけに公開しない」「イミュータブル」も残る

## 移行の順番（併走できる形で）

| 段  | やること                                                                                                                                         | 効き目                                                                                                | 併走 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ---- |
| 0   | **Markdown を unified に置き換える**（サーバ側で `remark-parse → remark-gfm → remark-rehype → rehype-raw → rehype-sanitize → rehype-stringify`） | T-063 が消え、`report-notation.ts` から「描けない記法」の迂回が消える。**今の形のままでも価値がある** | 可   |
| 1   | `src/protocol/` を切り、`SessionEvent` / reducer / `ClientCommand`・`ServerFrame` の zod を置く。`/ws` を1本足す（既存の SSE と POST は残す）    | 通信が1本に。サーバ側の配線が `switch` 1つに縮む                                                      | 可   |
| 2   | `src/ui/` に React の部品を**サイドバー → 入力欄 → キャラビュー → メインビュー**の順で作る。領域ごとに `data-event-path` の購読を外していく      | 領域ごとに置き換わる。いつでも止められる                                                              | 可   |
| 3   | 旧 `presentation/view.ts` と `view.test.ts` と `browser/` を消す。SSE と POST を消す                                                             | 約 6,000 行が消える                                                                                   | —    |
| 4   | 偽の駆動 + Playwright の目視                                                                                                                     | claude 無しで画面が動く                                                                               | 可   |
| 5   | キャラクターパック（`persona.md`）と切り替え（T-064 / T-065）                                                                                    | 人格と素材が1単位に                                                                                   | —    |
| 6   | `SessionManager` を鍵付きにし、必要なら client–daemon へ                                                                                         | 複数プロジェクト・ポートずらしの廃止                                                                  | —    |
| 7   | 箱（Electron or Tauri）                                                                                                                          | `loadURL` するだけ                                                                                    | —    |

段0 と段1 は今のタスク群（T-063 / T-078 / T-088）とぶつからない。**段2 に入るなら T-088（`view.ts` を
割る）は着手しないほうがよい**（割った先ごと消える）。

## いつ移るか（判断の基準）

次のうち**2つ以上を数か月のうちにやりたい**なら移る価値がある。1つ以下なら、段0 だけやって今の形を続ける。

- 立ち絵の動き（表情の遷移・まばたき・登場と退場の演出。声は出さない）
- 複数プロジェクト／複数セッションを1つの画面で扱う
- Electron / Tauri で1つのアプリにする
- 入力履歴・質問の複数選択・待ち時間の演出など、**ブラウザ側で状態を持つ**機能が続く

「キャラクターと一緒に楽しく仕事をする」という目的から見ると、上の1つ目（キャラの動き）が最も
目的に近く、それだけでも重心は移る側にある。

## 参考（一次情報に当たるときの入口）

- Agent SDK: `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`（`Options` / `Query` / `SDKMessage` の
  union は 39 種。`startup` / `listSessions` / `getSessionMessages` / `tagSession` / `reinitialize` /
  `setMcpServers` / `applyFlagSettings` あり）
- unified: <https://unifiedjs.com/>、`react-markdown` / `remark-gfm` / `rehype-raw` / `rehype-sanitize`
- 流れる Markdown: `streamdown`（Vercel）
- AI チャット UI の状態の形: Vercel AI SDK の `UIMessage`（parts）、assistant-ui
- 立ち絵の動き: Lottie（`lottie-web`）、Live2D Cubism Web SDK、CSS の `@keyframes`（SVG のままなら十分）
- WebSocket: `ws`（Bun / Node 両対応）
- Electron: `BrowserWindow.loadURL`、`utilityProcess`。Tauri v2: sidecar（`bun build --compile`）
- 箱の比較: `docs/research/app-shell.md`
