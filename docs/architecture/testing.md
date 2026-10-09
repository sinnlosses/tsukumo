# テスト

最終更新: 2026-10-07。ステータス: **正典**。

責務: 対象ごとのテストの方法、E2E（走らせ方・成果物・シナリオ）、手で確かめる手順を持つ。
読む時: テストを足す・E2E を直す・目視で確かめるとき。
直す時: テストの段取り・E2E の足場・目視の手順を変えたとき。

## 節の索引

| 節                  | 中身                                                                                                                              |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| ## テスト           | 対象ごとの方法、フィクスチャの作法、**E2E（走らせ方・成果物・期待値の範囲・揺れを生まない書き方・シナリオ）**、E2E に任せないもの |
| ## 手で確かめること | 自動チェックで捉えられない見た目の確認手順                                                                                        |

## テスト

| 対象                                      | 方法                                                                                                                                                                                | 置き場所                                                 |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| reducer（`applySessionEvent`）            | 純粋関数として単体で                                                                                                                                                                | `test/shared/session/session-state.test.ts`              |
| zod スキーマ                              | 受け付ける形・落とす形を1件ずつ                                                                                                                                                     | `test/shared/contract/command-input.test.ts` など        |
| SDK の型との一致                          | `PERMISSION_MODES` / `MODEL_ALIASES` が SDK の型と同じ値であること（型レベルの検査）                                                                                                | `test/server/session-driver/adapter/sdk-driver.test.ts`  |
| `session-manager`                         | fake driver を差し込み、`hello` → `events` の順序・バッチ・代の寿命（起こし直し・`hello` の配り直し・古い代のイベントを捨てる）と反応の順                                           | `test/server/session/core/session-manager.test.ts`       |
| コマンドの受け手（`createCommandRouter`） | 偽の `CommandSession`（姿は本物の reducer で畳む）を渡し、断る条件（契約の `meta`）・受け手が口へ渡す入力・失敗の定型文の理由・流すイベント・頼む起こし直しの中身                   | `test/router.test.ts`                                    |
| `server`（ws）                            | 購読 → `hello` が先に届き、押した順に取りこぼさず流れる、切断で購読が外れる、トークン無しは 403、Origin 違いは 403、コマンド → 受け手が呼ばれる                                     | `test/server/view-server/adapter/session-socket.test.ts` |
| browser の部品                            | Vitest + `happy-dom` + `@testing-library/react`。**役割と文言で当てる**（HTML の文字列一致はしない）                                                                                | `test/browser/**`                                        |
| 層の検査                                  | 層の辺・機能どうしの辺・browser の箱と領域の辺（`docs/architecture.md`「全体構成」）。外部ツールは増やさない                                                                        | `test/architecture.test.ts`                              |
| 画面の見た目                              | **fake driver で起こした tsukumo に Playwright**（`webapp-testing` スキル）。数値で読めるものは CDP で読む。色・間合いは人の目                                                      | `scripts/`（本体から呼ばれない）                         |
| 状態のカタログ                            | 疑似セッションの場面を名指しして起こし直し、広い窓と狭い窓で撮って索引 HTML に並べる（`TSUKUMO_FAKE_SCENE`）                                                                        | `scripts/capture-catalog.ts`                             |
| E2E                                       | **fake driver で起こした tsukumo を手元の Chrome で開き、利用者に見える流れを1本ずつと、実ブラウザでしか確かめられないもの（寸法・入力・サーバとの往復）を確かめる**（下の「E2E」） | `test/e2e/`                                              |

- **`server.ts` / `session-socket.ts` はテストする。** 「描く」側の入り口だが、配った結果は HTTP と WebSocket の
  両方で外から観測できるので、バインド先・経路・フレームの往復は自動で守れる。目視でしか
  確かめられないのは**ブラウザに出た絵**の側
- **`pnpm run test <ファイル>` は、渡したファイルに加えて規約のテスト（`CONVENTION_TEST_FILES`）も走らせる。**
  リポジトリ全体を読むので、変えたファイルとは別のテストが落ちうる。文書だけの変更で `pnpm run check` が打つ
  文書の検査は `pnpm run test:document` で、この一覧のうち `test/architecture.test.ts` を除いたもの
- **`orca-host.ts` は自動テストの対象外。** 実際に Orca が動いていないと結果を確かめられない。
  ここに判断を書きたくなったら、それは「決める」側に置くべきものが漏れている合図

**利用者に見える流れを1本ずつと、実ブラウザでしか確かめられないもの（寸法・入力・サーバとの往復）は E2E で守り、
出し分けと DOM の細部は部品・フックの単体で守り、見た目（色・崩れ・間合い）は目視で確かめる。**
1つの流れに E2E を2本以上置くのは、その1本が次のどれかを名指せるときだけ: 実ブラウザの寸法・計算されたスタイル・
メディアクエリ・コンテナクエリ・当たり判定／画面の操作がサーバへ届いて書き込み・起こし直し・棚の配信を経て画面が変わる往復／
contenteditable（CodeMirror）・IME の確定。同じ場面と窓で測れるものは1本にまとめる。E2E が判定に
使うのは DOM の構造と WebSocket のメッセージの列だけで、スクリーンショットは目視の添え物（判定しない）。
目視の手順は下の「手で確かめること」。足場（起こす・開く・成果物を書く・比べる）は
`test/e2e/scenario-run.ts` の1ファイルで、シナリオはそれを呼ぶだけにする。

### フィクスチャ

**フィクスチャの文字列もリポジトリの検査に掛かる。** 架空のパスは `docs/` で始めず、架空の ID は
タスク番号の形（`T-` と3桁以上の数字、または `GH-` と数字）にしない。`test/section-reference.test.ts`
（実在しない docs のパス）と `test/task-id.test.ts`（タスク番号）は、フィクスチャと本物を区別しない。

### E2E の走らせ方

- **ランナーは Vitest**（単体テストとランナーを共有する）。ブラウザは `playwright-core` の `chromium`
  （`channel: "chrome"`、headless）。**新しい外部コマンドは足さない**
- **置き場所は `test/e2e/<シナリオ>.test.ts`**（1ファイル = 1つの機能のまとまり。E2E は1つのファイルの
  振る舞いではないので、`src/` の写しの構成には従わない）
- **`pnpm run check` の中の別の段にする**（`pnpm run test` は既定の設定が `test/e2e/` を外し、E2E は
  `pnpm run test:e2e` が E2E 専用の設定で走らせる）。時間切れの既定を E2E の段だけ延ばし、単体テストを
  1ファイル走らせるときに Chrome を要らないままにするため。`pnpm run check` は軽い段のあとに重い段（単体と E2E）を
  並べて走らせ、作業ツリーをまたぐ錠は取らない（ほかの作業ツリーの検証とも並ぶ）。負荷は
  `maxWorkers` で抑える。E2E の1本は vitest のワーカーに加えて
  Chrome と `node src/cli.ts` を起こすので、実際に走るプロセスは `maxWorkers` の本数を大きく超える。
  E2E の設定は `maxWorkers: "15%"`、単体テスト（`vitest.config.ts`）も `"15%"` で、2つ合わせて
  コア数の 30% までに収める。単体は `dom` と `node` の2つの project に分け、DOM のグローバルを借りる
  `test/dom-environment.ts` は `dom`（`test/browser/` と、DOM を描くほかの置き場のファイル）にだけ掛ける。
  `vitest.config.ts` の `DOM_TEST_FILES` に無いファイルが DOM を要するようになったら、そこへ足す
- **引数なしの `pnpm run check` は、変えたファイルから選んだ E2E のファイルだけを流し**、選んだもの
  （または全件に倒した理由のパス）を1行で出す。**全件は `pnpm run check --full` で、main へ送る直前
  （`tw ship` の送る前の検証コマンドと `scripts/ship.ts`）に1回だけ流す**。選び方（`scripts/lib/e2e-selection.ts`）は
  変えたファイル1件ごとに次の順で決め、1件でも全件なら全件にする（取りこぼすより遅いほうを選ぶ）
  - 文書・単体テスト・E2E から届かない `scripts/` などは選ばない。E2E ファイルはそれ自身、期待値は場面の
    名前を持つ E2E を選ぶ
  - E2E の足場の根（`package.json`・`vitest.e2e.config.ts`・`scripts/build-ui.ts` など）から import で
    届くファイルは全件。E2E ファイルから import で届くファイル（`test/e2e/scenario-run.ts`・
    `test/e2e/task-room.ts`・`test/fixture/` など）は、届く元の E2E を選ぶ
  - `src/` は、サーバの入口 `src/cli.ts` から届けば全件（どの E2E もサーバ全体を起こす）。ブラウザだけが
    読むファイルは、見張りの表（`scripts/lib/e2e-watch.ts`）の領域の根から届くかで領域を決め、その領域を
    見ている E2E を選ぶ。どの根からも届かない（アプリや会話の画面の枠）なら全件
  - どれにも当たらないパスは全件。見張りの表に載せる E2E の領域が足りないと取りこぼすが、送る直前の全件で拾う。
    **E2E のファイルを足したら表に足す**（載っていないと単体テストが落ちる）
  - 期待値を撮り直す `pnpm run test:e2e:update` も既定は同じ選び方で、`--full` で全件、ファイルを渡せばそのファイルだけ
- **`dist/browser/` は E2E の段が自分で組み立てる**（起動は古い成果物でも止まらずに配る〔`docs/architecture/build.md`〕ので、
  組み立てを前提にすると古い画面を確かめて通ってしまう）。`vitest` を直に流したときは E2E の設定の
  `globalSetup`（`test/built-ui-setup.ts`）が、組み立てが `src/browser/`・`src/shared/` より古い
  （または無い）とテストの前に落とす。黙って組み立て直さず、`pnpm run build` を打つ。**Chrome が無ければ前提不足で落ちる**
  （飛ばすと黙って守らなくなる）
- **ブラウザは1ファイルに1つ、tsukumo は1件ごとに1つ起こす**。後始末は自分の pid だけに `SIGTERM` を
  送り、終わるのを待ってから一時のディレクトリを消す（広いパターンで止めない）。**ブラウザは
  `chromium.launchServer` で起こして繋ぎ、ファイルの終わり（`afterAll`）に丁寧に閉じず kill する**
  （手元の Chrome は丁寧に閉じると最後のコンテキストを閉じてから約 10 秒たつまで終わらず、ファイルごとに
  その待ちが乗って E2E の段の半分を占めていた。kill しても一時のプロファイルは Playwright が消す）
- **起こし方**: fake driver・空きポート・自動オープンなし・**`TSUKUMO_HOME`・`HOME`・cwd は1件ごとの
  一時ディレクトリ**（リポジトリで起こすと Beads の実データと git の履歴が画面に入る。`HOME` には使用状況の
  送信を止めた `bd` の設定だけを置く。タスクの一覧は `bd` を起こさない（「E2E のシナリオの一覧」のタスクの一覧の行）が、
  `bd` を起こしうるほかの機能のために残す）・
  `TZ=Asia/Tokyo`・下の固定の時計。**親の環境から `TSUKUMO_` で始まる変数は外してから渡す**
- **名指しの場面も `opening` も、ページが繋がってから流れ始める**（起こした直後に流すと、繋がる前の
  ぶんが `hello` に畳まれてメッセージの列が揃わない）。**`open` は、`opening` と名指しの場面の予定の
  最初の静かな区切り（次の手まで 500ms 以上空く時点。予定が尽きた時点を含む）までの手が届いてから
  部屋を渡す**（予定は fake driver の `startupSteps` を足場も読む。区切りは予定の時刻だけから決まり、
  走らせる速さに依らない）。そこから先は**場面が流れ終わるのを時間で待たず**、届いたイベントを待つ。長い場面は途中のイベントで止めて撮る。**場面を速く流す口は足さない**（ブラウザ側の
  間合いとの比が変わる）。`afterMs` は場面の始まり（`opening` は開いた時点、名指しの場面は `opening` の最後の手の続きから）からの経過で、前の手からの差ではない。手の並びの順に単調に増え（同じ値は可）、減る場面は読み込みで場面名と手の位置つきで拒まれる。**テストが答えるまで先へ進めたくない場面は、その手に `waitForAnswer: true` を付ける**（積まれた答え待ちがすべて答えられるまで流さず、その手と続く手の `afterMs` は答えが届いた時点からの経過になり、単調の検査もここで数え直す。時刻で流すと答えが遅れた分だけ手が入れ替わる。足場の間合いの検査は、次の手がこの手なら無限大として扱う）。必要な瞬間が遅い場面は、短い場面を疑似セッションに足す（名前に `-quick` を付け、元の場面と同じ手を `afterMs` だけ詰める。**最終まで流して撮るテストだけがこれを使い**、途中で止めて撮る側は元の場面のまま。詰めても、`report` が差し戻される場面は最初の静かな区切りが差し戻される `report` より前に残るようにする）
- **途中のイベントで止めて撮る（`waitForEvent` のあと `settleAndMatch`）ときは、待った手から疑似セッションの
  予定の次の手までの間合いを `scenario-run.ts` の足場が検査する**（`MIN_NEXT_STEP_GAP_MS` 未満なら落ちる。
  次の手が撮り終える前に届くと messages に1件多く載って食い違うため）。間合いが足りない場面は、名前に
  `-hold` などを付けて最初の静かな区切りで打ち切った版を別に足す（元の場面は書き換えない）
- `maxWorkers` は所要時間ではなく check の間に手元が重くならないことを優先して決める（値は単体テストの
  `vitest.config.ts` と合わせてコア数に対する比率で決める）。所要時間が延びること自体は受け入れる

### E2E の成果物と再現

**判定に使うのは2つの JSON だけ**。何を残し・落とし・置き換えるかの実装は `test/e2e/scenario-run.ts`。

- **DOM の構造**（`<シナリオ>.dom.json`。写す範囲は下の「E2E の期待値の範囲」）: 残すのは要素の名前・
  `role`・`aria-*`・`data-*`・入力の状態・`href` と `src` のパス・文字。**落とすのは `class`・`style`・`id`・描かれていない要素・図とグラフの中身・
  属性を1つも持たない `div` / `span`**（見た目の直しのたびに変わるもの）。**状態が `class` にしか
  出ていないものは、E2E で見たくなったときに `data-*` か `aria-*` に出す**（意味の契約は `data-*`・
  `aria-*`・文字に置く）
- **WebSocket のメッセージの列**（`<シナリオ>.messages.json`）: コマンドとフレームを届いた順に並べる。
  `events` は束をほどいてイベント1件ずつにし（束の切れ目は走らせるたびに変わる）、`hello` は版だけ、
  `character-changed` はいまのパックの名前と表情だけを残す
- **両方に共通の置き換え**: リポジトリ・一時のホーム・一時の cwd・ポート・`hello` の版（`PROTOCOL_VERSION`）を `<root>` などの印に置き換え、
  **起動トークンは成果物に書かない**

**時計の固定**:

- **サーバの時計は `TSUKUMO_FIXED_CLOCK` で凍らせる**（進む時計だと `at` と「N 秒」が走らせるたびに
  ずれる。経過の計算は `shared` の単体テストが守る）
- **`Temporal.Now` を読むのはサーバの `src/server/adapter/local-time.ts` と、ブラウザの
  `src/browser/utils/clock.ts` の2つだけ**で、`test/architecture.test.ts` がそれを縛る（固定が黙って
  効かなくならないように）
- **ブラウザの時計は E2E の側だけで差し替える**（`page.clock` は `Temporal.Now` を差し替えないので、
  初期スクリプトで `Temporal.Now.instant()` を `Date.now()` に従わせる。本番のコードに試験用の口を作らない）。
  止めたあとは DOM の構造が2回続けて同じになるまで読み直してから書く
- ビューポートは 1400x900（狭い窓の積み替えを見るシナリオだけ 720x900）、`reducedMotion: "reduce"`。
  **書体は固定しない**（判定は画素を見ない）

**置き場所と比べ方**: 期待値は `test/e2e/expected/<シナリオ>.*.json` に置いてリポジトリに入れ、走らせた
結果とスクリーンショットは `/tmp/tsukumo-e2e/<シナリオ>/` に毎回書き直す。比べ方は `toEqual` で、
**期待値が無ければ落とす**（黙って書かない）。**期待値の更新**は `pnpm run test:e2e:update` → `git diff
test/e2e/expected/` で意図した変化だけであることを確かめる → 直した変更と同じコミットに入れる。
shared の手続き応答に乗る型や DOM の構造を変える計画には、その変更を含むコミットで期待値を撮り直す段を置く。

**期待値と食い違った回**は、`matchArtifact`（`test/e2e/scenario-run.ts`）がその回の成果物と期待値との
行単位の差分を `/tmp/tsukumo-e2e/failures/<シナリオ>/<Temporal の刻んだ名前>/` へ残す（あとで通った回に
上書きされない。シナリオごとに直近5回まで）。落ちたときのエラー文に残した場所のパスが出る。

### E2E の期待値の範囲

**`*.dom.json` は、場面が選んだ部分木だけを写す。** ページ全体を写すと、場面と関係のない部品を1つ
直しただけで全場面の期待値が書き換わる。そうなると `git diff test/e2e/expected/` を人も受け入れの
エージェントも読み切れず、「E2E の揺れを生まない書き方」の条3が見る途中の状態を見落とす。
範囲は次の3つの決まりで絞る。

1. **部分木は名前で選ぶ。** 名前から根のセレクタへの表は `test/e2e/scenario-run.ts` に1つだけ置き、
   場面はセレクタを書かずに名前の並びを選ぶ。根は `role`・`aria-*`・`data-*` で当て、`class` では
   当てない（当てる印が無ければ部品の側に `data-*` を出す。「E2E の成果物と再現」の意味の契約と同じ）

   | 名前                                       | 根                                                                     |
   | ------------------------------------------ | ---------------------------------------------------------------------- |
   | `page`                                     | ページ全体（`body` の子。いまの写しと同じ）                            |
   | `screen-nav`                               | 帯（`nav[aria-label="画面"]`。中に開くセッションの切り替え画面を含む） |
   | `main`・`sidebar`・`character`・`dispatch` | 会話の画面の4領域（`[data-region="…"]`）                               |
   | `task-section`                             | サイドバーのタスクの区画（`section[aria-label="タスク"]`）             |
   | `task-board`・`task-run-confirm`           | タスクのモーダル・実行の確認                                           |
   | `session-switcher`                         | セッションの切り替え画面                                               |

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

**どこからも引かれずに残ったものは単体の `test/e2e-reference.test.ts` が落とす。** 落とすのは、組のそろっていない・どの E2E のシナリオ名も指さない期待値のファイルと、どの E2E も `domRoots` に渡さない表の名前と、テスト・`scripts/`・`src/`・`docs/architecture/` のどこからも名前で引かれない `fake-session.json` の場面。場面は `turns` の並びで流れることを使い手と数えないので、並びに頼るなら名前で引く形にする。

**`*.messages.json` は絞らない。** 書き換わった件数の見積もりと、絞らない理由の数は `docs/history/decision.md`「testing.md E2E の期待値の範囲（部分木に絞る見積もり）」。
例外は `session-info` の `slashCommands`・`terminalSlashCommands` と `command-descriptions` の
`descriptions`（コマンド一覧）で、`collapseCommandCatalog`（`test/e2e/scenario-run.ts`）が固定の印に
畳む。一覧が画面に届くことは `markdown-composer` の `/` の補完の確定が通し、中身の写しは
`test/server/session-driver/core/sdk-message.test.ts` と `test/shared/session/command-suggestion.test.ts` が持つ。

### E2E の揺れを生まない書き方

過去の揺れと「揺れずに間違った期待値」から取り出した条。例は `test/e2e/` のシナリオのファイル名で
言い、会話の実物は例に使わない。外の実践（Playwright・Martin Fowler・Google）との対応は
`docs/research/e2e-flakiness.md`。

1. **操作（送る・押す）は、場面のタイマーで届く手が途切れた区切りで行う。** `open` が最初の区切り
   まで待ってから部屋を渡すので、開いてすぐの操作は書き足さずに競わない。操作を最初の区切りより先の
   時点で行うなら、疑似セッションの場面の手を前後 500ms 以上空けて区切りを作り、その区切りの手まで
   `waitForEvent` で待つ。場面の手の途中に操作を挟まない（許可の答え（いまの `inquiry`）: 押して流れる
   `pending-changed` と場面の `speech`（`afterMs` 200）が競って揺れた。`input-dispatch`: `opening` の
   `speech` と依頼後の `partial-utterance` が同じ時刻に届いて競った）
2. **非同期の取得（TanStack Query など）が済むまで表示が続く要素は `aria-busy="true"` を出し、
   `settledDom`（`test/e2e/scenario-run.ts`）は DOM が2回続けて同じでも `aria-busy="true"` が
   残っていれば撮らずに待つ。** `settledDom` は DOM の中身を見ず「2回続けて同じ文字列」だけで
   落ち着いたと判定するので、「取得中…」のように取得の途中でも文字が変わらない表示があると、
   応答が届く前の DOM を2回連続で捉えて安定と誤判定する。回数や経路を数えるシナリオ専用の待ちは
   書く側の注意に頼るので、表示する側の印1つで機械的に効くこちらを選ぶ（`context-usage-card.tsx`・
   `usage-review-card.tsx` の先例に揃え、`context-usage-row.tsx` にも足した）。「取得中」の文字や
   途中の `data-motion` を期待値に入れない（`background-task`: コンテキスト使用量の取得が
   `turn-finished` の直後にまだ返っておらず、「取得中…」のまま2回連続で捉えられていた）。
   ブラウザの時計は止めてあるので、取得の結果を画面へ知らせるごく短い `setTimeout` も眠ったままに
   なる。`settledDom` は `aria-busy="true"` が残るあいだだけ時計を 1ms ずつ進めて起こす
   （`plan-usage-row.tsx` の利用枠の札: 取り直しが終わらず「取得中…」のまま撮られ、`aria-busy` を
   付けると今度は 15 秒待っても外れなかった。0ms 進めるだけでは起きない回があった）。
   `settleAndMatch` は撮る時刻へ進める前にも1回落ち着くまで待つ（取り直しが進める後に済むと、
   取れた時刻が「10:00 時点」でなく「10:01 時点」になる）。
   `import()` で分けたものの読み込み待ち（Markdown の描画一式を待つ空の器）も、読み込みが済むまで
   表示が続く要素に当たる。`Suspense` の fallback は印を出しても起きない（React が本体への差し替えを
   `setTimeout` で 300ms 間引き、`settledDom` が 1ms ずつ進める上限の 150ms に届かない）ので、
   読み込み待ちは store の更新で描き直す形にする（`docs/architecture/browser.md`「重いライブラリ」）
3. **期待値を撮り直したら `git diff test/e2e/expected/` の中に途中の状態が入っていないかを見る。**
   揺れずに間違っている期待値は揺れより見つけにくい（立ち絵の反応が `success`/`failure` の
   まま戻らない期待値11ファイルが、ブラウザの時計を凍らせるまで長く正解として記録されていた）
4. **揺れを見たら、打ち直す前に落ちた it の名前を控える。** 成果物と期待値との差分は
   `matchArtifact` が `/tmp/tsukumo-e2e/failures/<シナリオ>/` へ自動で残すので、打ち直しても
   消えない（`speak-bubble`: 1回だけ落ち、打ち直し3回は通過したが、当時は自動で残らず原因を
   追えなかった）
5. **シナリオを足した・待ち方を直したときは、足した・直した `it` だけを `-t` で絞って5回続けて回し、
   落ちないことを確かめ、回数を `## 結果` に書く。** 揺れは1回流しただけでは出ないことが多い
   （許可の答え（いまの `inquiry`）の待ちを直したときは、単独で12回続けて回して確かめた）。ファイル丸ごとを
   回すと、足していない `it` の分だけ時間が延びる。回すのはシェルの繰り返しで
   `npx vitest run --config vitest.e2e.config.ts test/e2e/<シナリオ>.test.ts -t '<it の名前>'` を
   5回呼び、落ちたら止める。背景で回してよく、そのあいだに目視を進める。Vitest の `it` の `repeats` は
   コードに残って検証を重くするので使わない
6. **E2E に自動の再試行を掛けない。** `vitest.e2e.config.ts` にも `it` にも `retry` を置かない。
   再試行で通すと「落ちた」という事実だけが消え、原因（控え）を見ないまま `pnpm run check` と
   `task ship` を通ってしまう。1回でも落ちたら揺れとして扱い、条4で控えを見る（`background-task`:
   打ち直すと通る揺れの控えを見ると、利用枠の行が `aria-busy` を出さずに
   「取得中…」のまま撮られるという、画面の側の欠けだった）
7. **テストの外の状態を共有しない。** ポート・ホーム・cwd・一時ファイルは、1件ごとの一時ディレクトリと
   空きポート（`TSUKUMO_VIEW_PORT=0`）から作る（「E2E の走らせ方」の起こし方）。固定のパス・固定の
   ポート・リポジトリの中のファイルに書く足場を足さない。例外は `/tmp/tsukumo-e2e/` の成果物で、
   シナリオ名で分かれる。並行する作業ツリーも同じ機械で同時に E2E を流すので、ファイルの並びでは
   なく値の作り方で衝突を避ける（単体テストの `cli.test.ts` は、既定のポートの帯を塞ぐ作りのため、
   別の作業ツリーが同じ帯を使うと結果が揺れた）
8. **ドラッグや CSS 変数で寸法を変えた直後に寸法を測るときは、`waitForFunction` などで描画が追いつく
   のを待つ。** `container-type: inline-size` の器の中で `grid-template-columns` を CSS 変数で動かすと、
   直後の `getBoundingClientRect()` は古い列幅を返し、次の描画で追いつく。測った値をそのまま
   `expect` に渡さず、期待する寸法になるまで待ってから測る（`report-main-view`: やり取りと本文の境界を
   ドラッグした直後のやり取りの列の幅の検査で、待たずに測ると古い幅が返った）
9. **ブラウザの起動には `hookTimeout` より短い上限を持たせ、起こしかけのものも `afterAll` で止める。**
   負荷の高いときは起動だけで hook の上限に当たりうる。打ち切られた起動を放置すると、親を失った
   ヘッドレス Chrome が残る（`test/e2e/scenario-run.ts` の `BROWSER_LAUNCH_TIMEOUT_MS`）

### E2E のシナリオの一覧

シナリオは `docs/requirements.md` の利用者に見える流れごとに1本を基本にし、2本目からは上の「テスト」節の
3つ（実寸・往復・入力）のどれかを名指せるものだけを置く。「残す理由」の「流れ」は、その流れを通す1本。
「載せない」は終わりの構造では捕まえられないもの。

| シナリオ（流れ）                                                                                                                                                         | 場面（`fake-session.json`）                                                                                                                                                                                                                                                                 | ファイル（`test/e2e/`）                       | 残す理由                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------- |
| ターンの流れ（依頼 → ツール → report → 締めのセリフ）                                                                                                                    | `report-tool-quick`                                                                                                                                                                                                                                                                         | `turn-flow`                                   | 流れ（4.1）                                                         |
| 入力欄から送る（`prompt` が流れ、`request` が戻る）                                                                                                                      | 名指し無し（`opening` → 送ると `report`）                                                                                                                                                                                                                                                   | `input-dispatch`                              | 流れ（4.1）                                                         |
| 入力欄のマークダウンエディタ（切り替えと下書きの引き継ぎ・`/` の補完の確定・送信・変換の確定）                                                                           | 名指し無し（`opening` のコマンド一覧に打つ・送ると `report`）。エディタは中の行を辿らず、行に見えている字だけを写す（隠した記号は写らない）                                                                                                                                                 | `markdown-composer`                           | 入力（CodeMirror・IME）                                             |
| speak → キャラビューの吹き出し（締めのセリフ）                                                                                                                           | `closing-narration-quick`                                                                                                                                                                                                                                                                   | `speak-bubble`                                | 流れ（4.3）                                                         |
| 機械の出来事 → キャラビューの反応（受けた間の「…」が `speak` で消える・依頼を待つ間に書かせた待ちの行）                                                                  | `reaction-accepted`・`waiting-idle`（待ちの一言を出す間を越えた経過で撮る。先頭で架空の行を持つ迎えの挨拶を流す）                                                                                                                                                                           | `character-reaction`                          | 流れ（4.3）                                                         |
| report → メインビュー（記法の一覧・グラフ・画像・やり取りの列の畳み・列のやり取りの行）                                                                                  | `notation`・`report-chart`・`report-image`・`long-report-quick`（800x768 ではやり取りの列が既定で畳まれ、開くの選択が読み込み直しても残り、狭い窓でも列が畳んだ形で出る）・`turn-outline`（5件のやり取りが結果の印つきで並び、やり取りの行で Enter を押すとそのやり取りへ移る）             | `report-main-view`                            | 流れ（4.1）。実寸（ベンダの描画・コンテナクエリ）・往復（棚の画像） |
| お伺い（許可と質問をマウスで答える・1024 で「次へ」を転がさずに押せる・preview の手元の画像）                                                                            | `permission`・`question-pair`・`question-long`・`question-preview`・`question-preview-image`                                                                                                                                                                                                | `inquiry`                                     | 流れ（4.1 `canUseTool`）。実寸（当たり判定）・往復（棚の画像）      |
| 進み具合の帯（作業中の書き換わり・転がしても動かない・1024 でお伺いと長いレポートの末尾を覆わない）                                                                      | `work-strip-running`（1つ目の手順のあとと、4つ目の長い Bash が走り出した直後）・`work-strip-ask`・`work-strip-question`（どちらも 1024x768）・`work-strip-long-report-quick`（末尾まで転がす）。覆わないことは `document.elementFromPoint` で確かめる                                       | `work-strip`                                  | 流れ（4.1）。実寸（当たり判定）                                     |
| 背景のタスク（ターンが終わっても残り、再開で続きのターンが流れて消える）                                                                                                 | `background-task-short`（長い版 `background-task` は再開まで 12 秒超）                                                                                                                                                                                                                      | `background-task`                             | 流れ（4.1）                                                         |
| 委譲中の脇の話（背景のタスクが残っているあいだに送っても札が増えず、帯が親の段取りのまま残り、欄に言葉と答えの対が出る）                                                 | `aside-delegating`（`turn-finished` のあと入力欄から ⌘⏎ で送ると、次の場面 `aside-answer` のセリフが答えになる）                                                                                                                                                                            | `aside-thread`                                | 流れ（4.1）                                                         |
| 会話の画面の段（761〜1100px の柱と重ねて開くサイドバー・境目の 1100/1101px・広い窓と狭い窓では柱を出さない）                                                             | 名指し無し。cwd の `FAKE_BEADS_ISSUES_PATH` に架空の課題を置いて進行中を1件立てる足場。狭い窓で開いてページ全体（`page`）を撮り、同じ部屋で広い窓と境目へ窓を変える                                                                                                                         | `conversation-tier`（足場は `task-room.ts`）  | 実寸（メディアクエリ）                                              |
| 会話の画面の局面（中身の入れ替えの順・4領域の寸法）                                                                                                                      | 名指し無し（`opening` → 送ると `report`。1440x900 と 1024x768）                                                                                                                                                                                                                             | `conversation-moment`                         | 実寸                                                                |
| 会話の画面の押す的と字（押せるものが 24x24 以上で名前を持つ・字が 12px 以上・コントラストが 4.5:1 以上。文の中の inline の `<a>` と `role="button"` は大きさを問わない） | `question-multi`・`api-failure`・`turn-history`・`work-strip-running`・`notation`・`work-plan-quick`・`report-task-verdict`・名指し無し（迎える画面とサイドバーとのぞき窓。1440x900 と 1024x768）。期待値は撮らず、`readability-scan.ts` の走査結果で判定する                               | `target-size`（走査は `readability-scan.ts`） | 実寸（計算されたスタイル）                                          |
| 迎える口（おすすめの札と「ほかの始め方」・「始める」で依頼がすぐ送られる・横にあふれない）                                                                               | `welcome-recommendation`（続きの要約は `sessionDigests`。タスクは cwd の `FAKE_BEADS_ISSUES_PATH` に架空の課題を置く足場）                                                                                                                                                                  | `welcome`（足場は `task-room.ts`）            | 流れ（4.6）。実寸                                                   |
| 失敗の塊（頭にある・内部の綴りは `title` だけ・同じ依頼を入力欄に戻す・入力欄の下段が1段のまま）                                                                         | `api-failure`（1024x768）。期待値は撮らず DOM で判定する                                                                                                                                                                                                                                    | `turn-failure`                                | 流れ（4.1）                                                         |
| 会話が終わったあとの入力欄（送れず、口を押すと起こし直されて送れるようになる）                                                                                           | `ended-ready`                                                                                                                                                                                                                                                                               | `session-ended`                               | 往復（起こし直し）                                                  |
| 会話の画面の読み上げとフォーカス（送って閉じるまでの読み上げ・`main`・スキップリンク・入力欄の名前と輪）                                                                 | 名指し無し（開いた直後・送る）。期待値は撮らず、`ScenarioRoom.announced` と DOM で判定する                                                                                                                                                                                                  | `live-region-focus`                           | 流れ（4.7）。実寸（計算された輪と Tab の順）                        |
| タスクの作業のレポートの結論部（目録の1行・見出し）                                                                                                                      | `report-task-finished`。場面のあとに cwd の `FAKE_BEADS_ISSUES_PATH` に架空の課題を置く足場                                                                                                                                                                                                 | `report-task`（足場は `task-room.ts`）        | 流れ（4.1）                                                         |
| タスクの一覧（並ぶ・のぞき窓から頼む）                                                                                                                                   | 名指し無し（`opening` のみ）。ブラウザが繋がったあと、cwd の `FAKE_BEADS_ISSUES_PATH` に架空の課題を `bd list --json` の形で置く足場（疑似セッションの見張りは `bd` を起こさずにこのファイルを約 200 ms ごとに読み、ファイルがあれば `.beads` があるものとして扱う。`readFakeBeadsIssues`） | `task-list`（足場は `task-room.ts`）          | 流れ（4.7）                                                         |
| タスクのモーダル（開いて本文を Markdown で描く）                                                                                                                         | 上と同じ足場                                                                                                                                                                                                                                                                                | `task-board`（足場は `task-room.ts`）         | 流れ（4.7）                                                         |
| 雑談の切り替えと忘却の区切り                                                                                                                                             | `chat-compact-boundary`                                                                                                                                                                                                                                                                     | `chat-compact-boundary`                       | 流れ（4.9）                                                         |
| 復元した雑談の履歴                                                                                                                                                       | `chat-restored-history`                                                                                                                                                                                                                                                                     | `chat-restored-history`                       | 流れ（4.8・4.9）                                                    |
| 続きから開く（過去の transcript の復元が `hello` に載る）                                                                                                                | `session-resume`（`pastSessions` の架空の transcript を `resume` で指す。名指しした場面だけが続きを持ち、他の場面は続きを探さない）                                                                                                                                                         | `session-resume`                              | 流れ（4.8）                                                         |
| 覚えていること（編集・消す）                                                                                                                                             | `chat-remembered-lines`                                                                                                                                                                                                                                                                     | `chat-remembered-lines`                       | 流れ（4.9）                                                         |
| セッションの切り替え（札で開き、↓ と Enter で起こし直す）                                                                                                                | `session-list`（作り物の一覧を `sessions-changed` で流す）                                                                                                                                                                                                                                  | `session-switch`                              | 流れ（4.8）。往復（起こし直し）                                     |
| モデル・effort・許可モードの操作子（選ぶとコマンドが流れて値が戻る・柱の吊り札が横へ吊られる）                                                                           | 名指し無し（`opening` のみ）                                                                                                                                                                                                                                                                | `run-setting`                                 | 往復・実寸                                                          |
| 途中のちらつき・止まって見える発話                                                                                                                                       | `interim-flicker`・`narration-stuck`・`narration-flash`                                                                                                                                                                                                                                     | 載せない（目視）                              | —                                                                   |

**まだ無いシナリオ**: 素の `<textarea>` での `/` の補完（`opening` のコマンド一覧に打つ。エディタの側は `markdown-composer`）・`@` の補完（一時の cwd に手書きの
ファイルを置く足場が要る）・API の不調の入力欄の行の見た目（`api-failure`・`rate-limit`。下段が1段に収まることは `turn-failure` が判定する。再試行中の帯の2行目と反応の吹き出しは部品の単体が持つ）・書き終わりの知らせ
（`diary-written`）・確認の
モーダルと日記帳の見開きといまの作業の失敗（疑似セッションに場面が足りない）。成果の画面・キャラクター
画面・使用量の画面は、一時の cwd とホームに手書きの材料を置く足場ができてから足す。

### E2E に任せず単体テストに残すもの

E2E が通るのは**疑似セッションに書いた並びだけ**で、fake driver は `SessionEvent` を直に流すので
**SDK のメッセージから `SessionEvent` への写しは1行も通らない**（`report` だけは本物と同じ
`reportEvents` を通るので、欄を省いて書いてよい）。次は E2E があっても単体テストに
残す:

- `sdk-` で始まるファイルの写し（SDK のメッセージ → `SessionEvent`）の全部
- 畳み込み（`applySessionEvent` など `test/shared`）のうち、**疑似セッションに同じ並びが無い
  もの**・**未知の `type` / `kind` を無視するもの**・境界の検証（zod スキーマの受け付ける形と
  落とす形）。消してよいのは、同じ並びをシナリオが流して DOM の構造で結果を固定しているものだけ
- 時刻に依る計算（経過・日の境目）。E2E は時計を凍らせるので見えない
- 再接続・版の食い違い・バッチの束ね方・エラー方針の分岐（起動時の即時終了・その回だけ諦める）
- `docs/coding-standards.md`「消すかどうか」表で「残す」としたもの（書式の固定・回帰テスト）

逆に、出し分けと DOM の細部（依頼の塊・知らせの行・目録の1行・中間レポートの畳み方・進み具合の帯の出し分け・反応の吹き出し・
タスクの一覧とモーダルの操作・`class` にしか出ない記法の付け替え）の持ち主は部品の単体テストで、E2E の場面で
組み直さない（E2E は `class` と属性の無い `div`/`span` を写さない）。container と対のフック（`hooks/use-<部品>.ts`）の単体では、部品の単体が同じ入力で描いて
確かめている出し分け・送り先を組み直さない。フックに残すのは、部品から観察しにくい時刻・タイマー・
参照の保ち方と、部品の単体が通さない分岐だけ。

## 手で確かめること

**見た目（色・崩れ・間合い）は自動チェックで捉えられない。** 単体テストで守るのは「受け取る」
「決める」と配信そのもの（バインド先・経路・push）と出し分け・DOM の細部、**E2E で守るのは利用者に見える流れと実ブラウザでしか確かめられないもの**
（上の「E2E の走らせ方」。`pnpm run check` の最後の段の `pnpm run test:e2e`）
まで。E2E のスクリーンショットは `/tmp/tsukumo-e2e/` に出るが判定には使わないので、表示に関わる変更をしたら、
次を確認してその結果を `evidence` に書く（`~/.claude/skills/task-workflow/WORKFLOW.md`
「良いevidenceの書き方」と `docs/workflow.md`「タスクを書くとき・受け入れるとき」）。

**fake driver（`TSUKUMO_DRIVER=fake`）で起こせる**ので、claude を起こさず（API を使わず）に
下の手順を回せる（上の「テスト」）。

**状態ごとの画面を並べて見るときは `node scripts/capture-catalog.ts`。** 疑似セッションの場面
（`test/fixture/fake-session.json` の `turns[].name`）ごとに tsukumo を1件ずつ空きポートで起こし、
広い窓（1400x900）と狭い窓（720x900・縦に積み替わるのでページ全体）で撮る。**同じ場面を別の
操作で何枚も撮る件があるので、名指しは場面の名前ではなく件の名前**（`--only notation-figure`
のように。`--only` に使える名前の一覧は `--help` で出る。**オプション無しで実行すると
カタログ全件を広い窓・狭い窓の2枚ずつ撮ってしまい、60秒では終わらないので踏まない**）。
**件によっては撮る前に操作を当ててから撮る**（領域の内側を送る・ボタンを押す・
入力欄に打つ・`location.hash` を書く、など） — 疑似セッションを流しただけでは出ない
状態（記法の見本の下側・タスク一覧のモーダル・`/`と`@`の補完・キャラクター画面）をこれで出している。
`/tmp/tsukumo-catalog/index.html` に並べる（`--out` で置き場を変えられる）。**依頼を手で送らなくても狙った状態が出る**ので、
お伺いの札・レポートの記法を直したら前後で撮り比べる。1枚だけ撮って要素の位置と大きさを
数値で読むのは `capture-view.ts`（class セレクタで測るときは `[class*="…"]` — CSS Modules が
`名前_ハッシュ` に焼くため）。**`capture-catalog.ts` の件が待つ `[class*="名前_"]` の名前が CSS Modules に
定義されているかは `test/scripts/capture-catalog-selector.test.ts` が確かめる**（件そのものは
`pnpm run check` で走らない）。**撮った画像はリポジトリに置かない。** 疑似セッションの会話は架空でも、
**タスク一覧のモーダルを撮る件には実データのタスク一覧（Beads の課題）が写る**ので、
画像そのものを他所へ共有・複製しない。

**検証結果の表（`report-checks`）とレポートの記法の「流れ」（`notation-flow`）も
`capture-catalog.ts` の件にある。** 書き上げていくように見せる演出中の要素は `clip-path` で
隠すだけで DOM には残る（`useReportReveal`）ので、疑似セッションが場面の最後まで流れ切って
狙った要素が現れるのを待ってから、演出を打ち切って（`skipReveal`）書き上がった状態を撮る。
`report-checks` は2件目の `report` が届く約7秒後まで検証結果の表が現れないので、
`CatalogEntry` の `settle` がその出現まで個別に待つ。**`settle` の `selector` は上限まで
現れなければ画像を書かず、非0で終わる**（読み込み中の画を黙って撮らない）。

**要素が出るまで待ってから1枚だけ撮るときは `capture-view.ts --wait-for <selector>`。**
`capture-catalog.ts` と同じ理由（演出中の要素は現れているだけで書き上がっていない）で、
指定した要素が出たあと `useReportReveal` の演出が終わる（`data-revealing` が消える）のも
合わせて待つ。演出は打ち切らず、`capture-view.ts` が開いたページの時計
（`page.clock.install` で差し替える）を `runFor` で進めて終わらせるので、節が多い長いレポートでも
演出の長さで上限に当たらない。要素の出現は実時間で待ち、そのあとの演出の終わりも合わせて上限
（15秒）を超えたら screenshot を撮らずに失敗で終わる（黙って空の画面を撮らない）。

**メインビューの下のほうにある塊（ファイルの塊など）を窓の大きさで撮るときは
`capture-view.ts --scroll-to <selector>`。** `--wait-for` の待ちが済んだあと、指した要素を
メインビューのスクロールの容れ物の上端へ送ってから撮る。要素が無ければ撮らずに失敗で終わる。

**入力欄に打つ・押すなど、手を動かさないと出ない状態を撮るときは、`capture-view.ts` に
`--type <selector> <文字>`・`--click <selector>`・`--hover <selector>`・`--hash <hash>` を並べる。**
書いた順に、`--wait-for` の待ちのあと・`--scroll-to` の前に当てる。1つでも当たらなければ
撮らずに失敗で終わる（撮影のカタログの `prepare` は当たらない手を飛ばして撮る）。
語彙と当て方は `scripts/lib/capture-preparation.ts` で共有している。
**待ち時間が経たないと出ない画（待ちの一言など）は `--advance <ms>` で偽の時計を進めて撮る。**
`Temporal.Now` も進んだ時刻に従うので、経過の秒数のような時刻の表示も進んだ値で描かれる。

**URL を手で拾わずに1件だけ撮るときは `capture-view.ts --scene <場面>`。** fake driver の
tsukumo を空きポートで自分で起こし、配信 URL を待って撮り、終わったら（失敗しても）自分で
止める（`node scripts/stop.ts` を別に打たなくてよい）。URL を直に渡す使い方とは併用できない。
知らない場面名のとき・URL も `--scene` も無いときは、何も起こさずに理由を出して非0で終わる。
**場面の途中の画は `--until-step <n>`（`--scene` と一緒にだけ使える）。** 場面の手を先頭から n 個で
止めて流すので、止めた先の状態が残る（`opening` の手は数えない）。止めた先の要素は `--wait-for` で待つ。
撮影は読み込みの1〜2秒後なので、遅い手で止めるときは `--wait-for` でその手が出す目印まで待つ
（`--advance` はページの時計だけでサーバの手は進めない）。
最終レポートまで流し切って待つときは `--wait-for '[class*="is-final_"]'`（`scripts/capture-catalog.ts`
の `WORK_PLAN_FINAL_SELECTOR` と同じ。`report-head` や `--advance` で待つと中間レポートや作業中の画を撮る）。
**幅で画面が切り替わる境目は 1100px と 760px。** 1100px 以下でサイドバーが柱に畳まれ、760px 以下で
頭・本文・顔と吹き出し・入力欄の縦の1列と引き出しになる。境目は `--size 1100x900` と `--size 1101x900`、`--size 760x900` と `--size 761x900` の両側を撮る
（`docs/architecture/screen-design.md`「13.4 Layout」「狭い画面（760px 以下）」）。
**どの場面にどの塊が出るかを引くときは `capture-view.ts --list-scenes`。** 場面ごとに `report`
に出る塊の `kind` を一覧し、`table` は状態のセル（`{ status, text }` の行）を持つものを
`table(status)` と区別する。検証結果の表（`report` の `checks`）を持つ場面には `checks` も出る。

**部品1つの状態違いを並べて見るときは Storybook（`pnpm run storybook`、`http://localhost:6006/`）。**
`capture-catalog.ts` とは見るものを分ける。**Storybook は部品を props で切り替えて見る道**
（`note` の6種・`badge` の3種・表・図・グラフ・立ち絵の SVG とラスタ・吹き出しの長い文と空のとき）で、
story は `story/` の下にある。**`capture-catalog.ts` は画面に入れたときの見え方を見る道**
（領域の内側のスクロール・モーダル・補完・狭い窓での積み替え・実データのタスク一覧）で、
tsukumo を本当に起こして撮る。崩れの多くは部品単体ではなく領域に入れたときに出るので、
**描画の変更の `evidence` は引き続き `capture-catalog.ts`（か手で起こした tsukumo）で撮る**。
Storybook は部品を直している最中に状態を切り替えて見るための補助で、`capture-catalog.ts` を
Storybook の story を撮る形に寄せることはしない（寄せると疑似セッション・サーバ・領域の
組み合わせが写らなくなる）。Storybook の class 名は本体の成果物と同じ綴りになる
（`docs/architecture/build.md`）ので、`[class*="…"]` の probe は Storybook の iframe
（`/iframe.html?id=<story の id>`）でもそのまま使える。**起こした Storybook は撮り終えたら止める。**

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
   （Claude Code の TUI は開かない）。成果物か取り込んだプラグイン（`vendor/tsukumo-plugins`）が無いと起動は前提不足で止まり、`src/browser/` の
   ほうが新しいと「古い画面が出る」1行が出る
2. **tsukumo 自身がレイアウトページのタブを開く**ので、それが**Orca 内のブラウザタブ**に
   出ること（外部ブラウザに出ないこと）を見る。タブだけ閉じてしまったときは
   `node scripts/open-views.ts <URL>` で開き直せる
3. **画面の入力欄から依頼を打つ**。送信できること、実行中に中断できること
4. **再読み込みなしに**吹き出しにセリフが出て、メインビューにレポートが流れること
5. ツールを使う依頼で、**帯の「いまの作業」の札に進行が出て、押すと依頼の手順の一覧が開く**こと
6. 許可の要る操作を頼み、**メインビューの帯の下にお伺いの札が出て、タブのタイトルが変わり、
   カードを選んで「これで答える」を押すか、入力欄の帯の「お伺いへ」から 1 と Enter で答えると作業が続く**こと
7. ウィンドウの幅を変えて、**折り返しがブラウザ側で追従する**こと
8. `orca` が使えない状況を作っても、プロセスが落ちずに配信を続けること
9. レポートに出た git 管理下のパス（inline code・フェンスのファイル名・相対リンク）を押すと、
   **Orca のエディタでそのファイルが開く**こと（`docs/architecture/display.md` 4.2「各表示物」）

`evidence` には「どの環境で何を見たか」を1行で書く。

**claude が自分で始めた続きのターン（`turn-resumed`）の合間を測るときは、疑似セッションの場面
`resumed-report`（`TSUKUMO_FAKE_SCENE=resumed-report`）を使う。** 中間の `report` のあと、
`turn-resumed` → `speech` → ターンの終わりを2回はさみ、最後に完了の一言と最終 `report` が続く。
`turn-resumed` が届いてから次の `speech` / `report` が届くまでのあいだも、メインビューは前の
`report` を出したままで、吹き出しは空にならず前のセリフを保っている
ことを確かめる（`docs/architecture/screen-design.md` 13.9「背景のタスク」）。

**段のまとまり（`docs/architecture/display.md`「段取り」）の描き方を確かめるときは、疑似セッションの場面
`work-strip-parallel`・`work-strip-parallel-ask`・`work-plan-parallel` を使う。** 前の2つは帯でまとまりの丸が
1つの囲みに並び位置が「2·3/4」になること（お伺いでは囲みの中の丸がどれも「?」）、`work-plan-parallel` は
まとまりの中の段を後ろの番号から済ませて閉じ、帯が全部 ✓ になることと、最終レポートの段ごとの時間に
「並列 2·3」の壁時計の行と字下げした中の段の行が出ることを見る（`docs/architecture/screen-design.md`
「進み具合の帯」「レポートの頭（合図の行）」）。

**段取りを止めて閉じたときと、段の所要が測れないときの描き方を確かめるときは、疑似セッションの場面
`work-plan-stopped`・`work-plan-phase-unknown` を使う。** `work-plan-stopped` は段2の途中で
`task.outcome` が `stopped`・`workPlanClosing: "stopped"` の `report` で閉じ、帯のチップが「止めた」になること、`work-plan-phase-unknown` は
段2を一度も今にしないまま閉じ、最終レポートの段ごとの時間で段2が「不明」になることを見る
（`docs/architecture/display.md`「段取り」）。

**書き終わりの知らせ（`docs/architecture/screen-design.md` 13.10「書き終わりの知らせ」）を確かめるときは
疑似セッションの場面 `diary-written`（`TSUKUMO_FAKE_SCENE=diary-written`）を使う。** `diary-requested`
→ `diary-drafting` → `diary-stage`（`write` → `pick`）→ `diary-written` と流れ、成果の画面
（`#achievement?date=2026-09-20`）でも会話の画面でも画面の下中央に札が出ることと、「日記帳で開く」で
その日の見開きが開くこと、× で消えて再読み込みするまで戻らないことを見る。日記の中身（本文・
しおり）も見るときは、`~/.tsukumo/diary/<リポジトリ>/2026-09-20.json`（`TSUKUMO_HOME` を
分けていればその下。置き場の形は `src/server/diary/adapter/diary.ts`）に架空の日記を1件置いてから
起こす——fake driver は `diary` ツールの中身を持たないので、置かなければ手続き `achievement.day` の
その日は「日記が無い」のまま。**この置く手間ごと `capture-catalog.ts` の `diary-book` 件がやる**
（次の段落）ので、見開きを撮るだけなら手で置かなくてよい。`diary-book` 件は「日記帳で開く」を
押したあと、見開きの本文が現れるまで待ってから撮る（`achievement.day` が返るまで見開きは
「…」のまま。本文が現れなければ撮らずに落ちる）。

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

**fake driver の質問の場面を Playwright で自動操作すると、`turnInProgress` が解けないまま残る
ことがある**（再現条件は分かっておらず、手で触ったときには起きていない。操作側の問題の
可能性もある）。そのときは疑似セッションの `opening` に質問を足して、開いた時点で出す形で
確かめる。もう一度踏んだら条件を書き足す。
