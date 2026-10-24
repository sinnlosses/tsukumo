# テスト: E2E の成果物と期待値

ステータス: **正典**。入口は `docs/architecture/testing.md`（テストの全体）。

責務: E2E が判定に使う2つの成果物（DOM の構造・WebSocket のメッセージの列）の形、時計の固定、期待値の置き場所と比べ方、写す部分木の範囲、比べる成果物の選び方。
読む時: E2E の期待値を撮り直す・写す範囲や比べ方を直すとき。
直す時: 成果物の形・期待値の範囲・比べ方を変えたとき。

## 節の索引

| 節                     | 中身                                                                                                  |
| ---------------------- | ----------------------------------------------------------------------------------------------------- |
| ### E2E の成果物と再現 | 2つの JSON の残すもの・落とすもの・置き換え、時計の固定、置き場所と比べ方、食い違った回の控え         |
| ### E2E の期待値の範囲 | 部分木を名前で選ぶ3つの決まり、引かれない期待値の検査、場面を開く入口、`*.messages.json` を比べる場面 |

## テスト

### E2E の成果物と再現

**判定に使うのは2つの JSON だけ**。何を残し・落とし・置き換えるかの実装は `test/e2e/dom-tree.ts`・`test/e2e/message-record.ts`・`test/e2e/artifact.ts`。

- **DOM の構造**（`<シナリオ>.dom.json`。写す範囲は下の「E2E の期待値の範囲」）: 残すのは要素の名前・
  `role`・`aria-*`・`data-*`・入力の状態・`href` と `src` のパス・文字。**落とすのは `class`・`style`・`id`・描かれていない要素・図とグラフの中身・
  属性を1つも持たない `div` / `span`**（見た目の直しのたびに変わるもの）。**状態が `class` にしか
  出ていないものは、E2E で見たくなったときに `data-*` か `aria-*` に出す**（意味の契約は `data-*`・
  `aria-*`・文字に置く）
- **WebSocket のメッセージの列**（`<シナリオ>.messages.json`。期待値と比べるのはサーバとの往復を守る場面だけで、下の「E2E の期待値の範囲」）: コマンドとフレームを届いた順に並べる。
  `events` は束をほどいてイベント1件ずつにし（束の切れ目は走らせるたびに変わる）、`hello` は版だけ、
  `character-changed` はいまのパックの名前と表情だけを残す。比べない場面でも成果物には書く
- **両方に共通の置き換え**: リポジトリ・一時のホーム・一時の cwd・ポート・`hello` の版（`PROTOCOL_VERSION`）を `<root>` などの印に置き換え、
  **起動トークンは成果物に書かない**

**時計の固定**:

- **サーバの時計は `TSUKUMO_FIXED_CLOCK` で凍らせる**（進む時計だと `at` と「N 秒」が走らせるたびに
  ずれる。経過の計算は `shared` の単体テストが守る）
- **`Temporal.Now` を読むのはサーバの `src/server/adapter/local-time.ts`（`createServerClock` と
  `timeZoneId` の中だけ）と、ブラウザの `src/browser/utils/clock.ts` の2つだけ**で、`.oxlintrc.json` の
  `no-restricted-properties`（`Temporal.Now`。ファイル単位）と `test/architecture/clock.test.ts`（関数単位）がそれを縛る（固定が黙って
  効かなくならないように）
- **ブラウザの時計は E2E の側だけで差し替える**（`page.clock` は `Temporal.Now` を差し替えないので、
  初期スクリプトで `Temporal.Now.instant()` を `Date.now()` に従わせる。本番のコードに試験用の口を作らない）。
  止めたあとは DOM の構造が2回続けて同じになるまで読み直してから書く
- **止めた時計の上でも `requestAnimationFrame` は本物の描画のフレームで呼ぶ**（`page.clock` は rAF も止めるので、
  rAF で束ねて渡す届いたフレームが画面に出なくなる）。`followFakeClock` が入れる初期スクリプトが偽と本物の早いほうで1回呼び、
  時刻は進めない。撮影の道具（`capture-view.ts`）も同じものを入れる
- ビューポートは 1400x900（狭い窓の積み替えを見るシナリオだけ 720x900、スマホの縦の窓は 390x844）、`reducedMotion: "reduce"`。
  **書体は固定しない**（判定は画素を見ない）

**置き場所と比べ方**: 期待値は `test/e2e/expected/<シナリオ>.*.json` に置いてリポジトリに入れ、走らせた
結果は `/tmp/tsukumo-e2e/<シナリオ>/` に毎回書き直す。スクリーンショットは食い違って落ちた回（残す `failures/` の下）と
`E2E_UPDATE=1` の回（`<シナリオ>/`）だけ撮り、通った回は撮らない。比べ方は `toEqual` で、
**比べる期待値が無ければ落とし、比べない期待値が残っていても落とす**（黙って書かない・黙って比べない）。**期待値の更新**は `pnpm run test:e2e:update` → `git diff
test/e2e/expected/` で意図した変化だけであることを確かめる → 直した変更と同じコミットに入れる。
shared の手続き応答に乗る型や DOM の構造を変える計画には、その変更を含むコミットで期待値を撮り直す段を置く。

**期待値と食い違った回**は、`matchArtifact`（`test/e2e/artifact.ts`）がその回の成果物と期待値との
行単位の差分を `/tmp/tsukumo-e2e/failures/<シナリオ>/<Temporal の刻んだ名前>/` へ残す（あとで通った回に
上書きされない。シナリオごとに直近5回まで）。落ちたときのエラー文に残した場所のパスが出る。

### E2E の期待値の範囲

**`*.dom.json` は、場面が選んだ部分木だけを写す。** ページ全体を写すと、場面と関係のない部品を1つ
直しただけで全場面の期待値が書き換わる。そうなると `git diff test/e2e/expected/` を人も受け入れの
エージェントも読み切れず、「E2E の揺れを生まない書き方」の条3が見る途中の状態を見落とす。
範囲は次の3つの決まりで絞る。

1. **部分木は名前で選ぶ。** 名前から根のセレクタへの表は `test/e2e/dom-tree.ts` に1つだけ置き、
   場面はセレクタを書かずに名前の並びを選ぶ。根は `role`・`aria-*`・`data-*` で当て、`class` では
   当てない（当てる印が無ければ部品の側に `data-*` を出す。「E2E の成果物と再現」の意味の契約と同じ）

   | 名前                                       | 根                                                                           |
   | ------------------------------------------ | ---------------------------------------------------------------------------- |
   | `page`                                     | ページ全体（`body` の子。いまの写しと同じ）                                  |
   | `screen-nav`                               | 帯（`nav[aria-label="画面"]`。中に開くセッションの切り替え画面を含む）       |
   | `main`・`sidebar`・`character`・`dispatch` | 会話の画面の4領域（`[data-region="…"]`）                                     |
   | `work-strip`                               | 進み具合の帯（`section[aria-label="進み具合"]`）                             |
   | `turn-outline`                             | やり取りの列（`nav[aria-label="やり取り"]`。畳んだ状態は開くの button だけ） |
   | `remembered-lines`                         | サイドバーの覚えていること（`section[aria-label="覚えていること"]`）         |
   | `task-section`                             | サイドバーのタスクの区画（`section[aria-label="タスク"]`）                   |
   | `task-board`・`task-run-confirm`           | タスクのモーダル・実行の確認                                                 |
   | `session-switcher`                         | セッションの切り替え画面                                                     |

2. **名前の並びは場面のファイルの `open` の選択肢に書く**（`scenario`・`scene`・`viewport` と並べる）。
   「この場面で何を守っているか」を、`it` の題とその並びの1か所で読めるようにするため。期待値は
   名前をキーにした写しで、指定そのものは持たない（期待値の側に指定を置くと、撮り直しで指定ごと
   書き換わる）。選ぶのは、`it` の題が述べる変化が出る部分木だけ。変化が2つの領域にまたがれば
   両方を選ぶ（入力欄から送る場面は `main`・`dispatch`）。**当たる要素が無い名前は空の並びとして
   写す。** 閉じたモーダルを「無い」として守れる。セレクタが外れたときも空の並びに変わるので、
   撮り直した差分で中身が空の並びに変わっていたら、まず表のセレクタを疑う
3. **ページ全体の写し（`page`）は3場面だけに残す**: 仕事モードの広い窓（`turn-flow`）・雑談モード
   （`chat-compact-boundary`）・狭い窓（`conversation-tier-narrow`）。領域の外の骨組み（境界・狭い窓の
   積み替え）と、どの場面も選ばない部品（サイドバーの下端の使用量の札など）はこの3場面が守る。
   部品を足したときにそれを選ぶ場面が無くても、この3場面のどれかの差分に出る。**特定の部品を
   守りたくなったら `page` の場面を増やさず、部品の名前を表に足して場面で選ぶ**

**どこからも引かれずに残ったものは単体の `test/e2e-reference.test.ts` が落とす。** 落とすのは、同じ場面の `*.dom.json` の無い `*.messages.json`・どの E2E のシナリオ名も指さない期待値のファイルと、どの E2E も `domRoots` に渡さない表の名前と、テスト・`scripts/`・`src/`・`docs/architecture/` のどこからも名前で引かれない `fixture/fake-session/` の場面（場面のファイル名で数える）。場面は `turns` の並びで流れることを使い手と数えないので、並びに頼るなら名前で引く形にする。

**E2E の足場（`test/e2e/` の `.test.ts` 以外）が export する場面を開く入口は、`test/e2e/task-room.ts` に置く `open…Room` の名前の関数だけにする。** 期待値の持ち主の判定（`scenarioOwners`）は場面名の位置の式を辿れるときだけ辿るので、名前が `ROOM_OPENER` に合わない入口や `task-room.ts` 以外の足場が export する入口を足すと、単体の `test/scripts/shared/e2e-scenario.test.ts`「場面を開く入口」が落ちる。export しない入口とテストファイルの中の局所の入口はこのテストの外で、名前は縛らない（局所の関数は呼び出しの引数と `scenario:` の値から辿る）。

**`*.messages.json` は、サーバとの往復を守る場面だけが比べる。** 残すのは、ブラウザが送るコマンドの中身と数（`session.prompt` の文面・`session.answer`・`session.setModel`・`session.switchSession`・`session.startNewSession`・`session.recordWelcomeGreeting`・`chat.forgetRememberedLine`）か、サーバが決めて返すイベント（`aside` など）を、ほかに比べる場面の無い形で流す場面。
イベントの列が疑似セッションの台本の写しで、結果が `*.dom.json` に出る場面は比べない。台本に書いた並びは
台本そのものが差分に出て、イベントの形は `sessionEventSchema`（`src/shared/session/session-event.ts`。台本も
`fake-session.ts` が読むときに通す）と単体テスト（`test/shared/`・`test/server/`）が守る。
同じコマンドを同じ形で送る場面が2本あれば、比べるのは流れの持ち主の1本だけにする。

**比べる成果物は、撮る口の名前で場面が選ぶ。** `settleAndMatch` は `*.dom.json` だけを比べ、
`settleAndMatchWithMessages` は `*.messages.json` も比べる（どちらも `test/e2e/scenario-open.ts` の `ScenarioRoom`。シナリオは `test/e2e/scenario-run.ts` から読む）。
部分木の名前の並び（上の決まり2）は `open` の選択肢に書くが、こちらは `it` の本文の撮る口の名前で選ぶ。
どちらも指定は場面のファイルにあり、期待値は写しだけを持つ。
`settleAndMatch` の場面に `*.messages.json` が残っていると落ちる。`E2E_UPDATE=1` は比べない場面の
`*.messages.json` を書きも消しもしないので、比べるのをやめた場面の期待値は `git rm` で消す。

比べる場面の列にも例外があり、`session-info` の `slashCommands`・`terminalSlashCommands` と `command-descriptions` の
`descriptions`（コマンド一覧）は、`collapseCommandCatalog`（`test/e2e/message-record.ts`）が固定の印に
畳む。一覧が画面に届くことは `markdown-composer` の `/` の補完の確定が通し、中身の写しは
`test/server/session-driver/core/sdk-message.test.ts` と `test/shared/session/command-suggestion.test.ts` が持つ。
