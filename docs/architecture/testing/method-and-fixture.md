# テスト: 対象ごとの方法とフィクスチャ

ステータス: **正典**。入口は `docs/architecture/testing.md`（テストの全体）。

責務: 対象ごとのテストの方法と置き場所、E2E と単体と目視の分担、フィクスチャの作法、E2E に任せず単体テストに残すもの。
読む時: テストを足す・どこで守るかを決めるとき。
直す時: 対象ごとの方法・分担・単体に残すものを変えたとき。

## 節の索引

| 節                                   | 中身                                                   |
| ------------------------------------ | ------------------------------------------------------ |
| ## テスト                            | 対象ごとの方法と置き場所、E2E・単体・目視の分担        |
| ### フィクスチャ                     | フィクスチャの文字列もリポジトリの検査に掛かる         |
| ### E2E に任せず単体テストに残すもの | E2E があっても単体に残すもの、部品の単体が持ち主のもの |

## テスト

| 対象                                      | 方法                                                                                                                                                                                                | 置き場所                                                 |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| reducer（`applySessionEvent`）            | 純粋関数として単体で                                                                                                                                                                                | `test/shared/session/session-advance-*.test.ts`          |
| zod スキーマ                              | 受け付ける形・落とす形を1件ずつ                                                                                                                                                                     | `test/shared/contract/command-input.test.ts` など        |
| SDK の型との一致                          | `API_ERROR_KINDS` が SDK の `SDKAssistantMessageError` と同じ綴りであること（型レベルの検査）。`PERMISSION_MODES` / `EFFORT_LEVELS` は `sdk-driver.ts` の SDK への受け渡しの型が守る                | `test/server/session-driver/adapter/sdk-driver.test.ts`  |
| `session-manager`                         | fake driver を差し込み、`hello` → `events` の順序・バッチ・代の寿命（起こし直し・`hello` の配り直し・古い代のイベントを捨てる）と反応の順                                                           | `test/server/session/core/session-manager*.test.ts`      |
| コマンドの受け手（`createCommandRouter`） | 偽の `CommandSession`（姿は本物の reducer で畳む）を渡し、断る条件（契約の `meta`）・受け手が口へ渡す入力・失敗の定型文の理由・流すイベント・頼む起こし直しの中身                                   | `test/router*.test.ts`                                   |
| `server`（ws）                            | 購読 → `hello` が先に届き、押した順に取りこぼさず流れる、切断で購読が外れる、トークン無しは 403、Origin 違いは 403、コマンド → 受け手が呼ばれる                                                     | `test/server/view-server/adapter/session-socket.test.ts` |
| browser の部品                            | Vitest + `happy-dom` + `@testing-library/react`。**役割と文言で当てる**（HTML の文字列一致はしない）                                                                                                | `test/browser/**`                                        |
| 層の検査                                  | 層の辺・機能どうしの辺・browser の箱と領域の辺（`docs/architecture.md`「全体構成」）。外部ツールは増やさない                                                                                        | `test/architecture/`                                     |
| 関数の並びの検査                          | `export` する関数が `export` しない関数より前に並ぶ（`docs/coding-standards.md`「関数の並び順」）                                                                                                   | `test/function-order.test.ts`                            |
| 画面の見た目                              | **fake driver で起こした tsukumo に Playwright**（`webapp-testing` スキル）。数値で読めるものは CDP で読む。色・間合いは人の目                                                                      | `scripts/`（本体から呼ばれない）                         |
| 状態のカタログ                            | 疑似セッションの場面を名指しして起こし直し、広い窓と狭い窓で撮って索引 HTML に並べる（`TSUKUMO_FAKE_SCENE`）                                                                                        | `scripts/capture/capture-catalog.ts`                     |
| E2E                                       | **fake driver で起こした tsukumo を Playwright の headless shell で開き、利用者に見える流れを1本ずつと、実ブラウザでしか確かめられないもの（寸法・入力・サーバとの往復）を確かめる**（下の「E2E」） | `test/e2e/`                                              |

- **`server.ts` / `session-socket.ts` はテストする。** 「描く」側の入り口だが、配った結果は HTTP と WebSocket の
  両方で外から観測できるので、バインド先・経路・フレームの往復は自動で守れる。目視でしか
  確かめられないのは**ブラウザに出た絵**の側
- **`pnpm run test <ファイル>` は、渡したファイルに加えて規約のテスト（`CONVENTION_TEST_PATHS`）も走らせる。**
  リポジトリ全体を読むので、変えたファイルとは別のテストが落ちうる。文書だけの変更で `pnpm run check` が打つ
  文書の検査は `pnpm run test:document` で、この一覧のうち層の検査（`test/architecture/`）と関数の並びの検査を除いたもの。
  `test/scripts/document/` の直下で `repository-root` を import するか `readFileSync` を使うテストを `DOCUMENT_CHECK_TEST_FILES` へ足し忘れると、`test/scripts/dev/check-plan.test.ts` が落ちる。
  層の検査は塊ごとのファイルに分かれているので、一覧はファイルを並べずにディレクトリ `test/architecture/` を1つ指す。
  vitest は渡した文字列をパスの部分一致の絞り込みとして読むので、ディレクトリの中のファイルがすべて走り、
  そのうちの1つを別に渡しても二重には走らない（ファイルを足しても一覧を直さずに済む）。
  変えたファイルから選ぶ `--related` は引数を変えたファイルとして読みディレクトリを展開しないので、
  `test/architecture/` の中のテストファイルを `scripts/dev/test.ts` が1本ずつ列挙して渡す
- **`orca-host.ts` は自動テストの対象外。** 実際に Orca が動いていないと結果を確かめられない。
  ここに判断を書きたくなったら、それは「決める」側に置くべきものが漏れている合図
- **サニタイザ・属性の許可を検査するテストは、DOM でなく木（hast）の段階で、本番と同じ rehype の段（`rehypeSanitize` など）を通して行う。**
  テスト環境の DOM は不正な CSS・属性値を CSSOM に入れる段で捨てるので、サニタイザが素通ししても
  DOM 上の `style` は null になり、抜け道の入力を足しても緑のまま空振りする。
  手本は `test/browser/components/page/conversation/components/markdown/renderer/sanitize-schema.test.ts`
- **サニタイザの許可を変えたときの目視には、疑似セッションの `report-meter` 場面（`fixture/fake-session/report-meter.json`）で
  割合の帯（`stat-meter`）と数の棒（`cell-bar`）を撮る。** 例: `node scripts/capture/capture-view.ts --scene report-meter --size 1200x1400 --wait-for '[class*="stat-meter"]' --measure '[class*="cell-bar"]'`。
  場面は名前を指して起こすので、足しても名前を指さない既存の E2E の期待値は変わらない
- **インラインの `kbd`・`samp`・コードと、`/` の後で折れる長いパスの目視には、`report-inline-code` 場面を撮る。**
  既定の撮り方は書き上げの演出が終わる（約10秒）のを待ってから撮る。
  例: `node scripts/capture/capture-view.ts --scene report-inline-code --size 390x1500`
- **行を指したパスに重ねて出る抜き書きの浮きの目視には、`report-file-peek` 場面を撮る。**
  例: `node scripts/capture/capture-view.ts --scene report-file-peek --size 1440x900 --wait-for '[class*="is-final_"]' --hover '[role="button"]:has-text("repository-file.ts:29")' --advance 800`

**利用者に見える流れを1本ずつと、実ブラウザでしか確かめられないもの（寸法・入力・サーバとの往復）は E2E で守り、
出し分けと DOM の細部は部品・フックの単体で守り、見た目（色・崩れ・間合い）は目視で確かめる。**
1つの流れに E2E を2本以上置くのは、その1本が次のどれかを名指せるときだけ: 実ブラウザの寸法・計算されたスタイル・
メディアクエリ・コンテナクエリ・当たり判定／画面の操作がサーバへ届いて書き込み・起こし直し・棚の配信を経て画面が変わる往復／
contenteditable（CodeMirror）・IME の確定。同じ場面と窓で測れるものは1本にまとめる。E2E が判定に
使うのは DOM の構造と WebSocket のメッセージの列だけで、スクリーンショットは目視の添え物（判定しない）。
目視の手順は下の「手で確かめること」。足場（起こす・開く・成果物を書く・比べる）は
`test/e2e/scenario-run.ts` を入口にし（部屋を組み立てる `scenario-open.ts`・待ちの `scenario-wait.ts`・窓の大きさの `scenario-viewport.ts` を読む。成果物・DOM の木・記録などは同じ置き場の概念ごとのファイル）、
シナリオは入口を呼ぶだけにする。

### フィクスチャ

**フィクスチャの文字列もリポジトリの検査に掛かる。** 架空のパスは `docs/` で始めず、架空の ID は
タスク番号の形（`T-` と3桁以上の数字、または `GH-` と数字）にしない。`test/scripts/document/section-reference-repository.test.ts`
（実在しない docs のパス）と `test/scripts/document/task-id.test.ts`（タスク番号）は、フィクスチャと本物を区別しない。

**本物の `bd` を起こすテストは `test/server/repository/adapter/beads-issues-reader.test.ts` の1ファイルに置く。**
`bd init` 済みの雛形は `globalSetup`（`test/beads-template-setup.ts`）が実行ごとに1回だけ作り、
`test/fixture/beads-repository.ts` が `inject("beadsTemplate")` の写しを配る。読むだけの検査は取り込み口のフェイクを使う。

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

逆に、出し分けと DOM の細部（依頼の全文・知らせの行・目録の1行・中間レポートの畳み方・進み具合の帯の出し分け・反応の吹き出し・
タスクの一覧とモーダルの操作・`class` にしか出ない記法の付け替え）の持ち主は部品の単体テストで、E2E の場面で
組み直さない（E2E は `class` と属性の無い `div`/`span` を写さない）。container と対のフック（`hooks/use-<部品>.ts`）の単体では、部品の単体が同じ入力で描いて
確かめている出し分け・送り先を組み直さない。フックに残すのは、部品から観察しにくい時刻・タイマー・
参照の保ち方と、部品の単体が通さない分岐だけ。
