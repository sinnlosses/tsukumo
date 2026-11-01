# E2E のランナーを `@playwright/test` に移し、撮影の道具は待ちの部品だけ借りる（2026-11-01）

ステータス: 採用

**E2E（`test/e2e/` の 37 本）のランナーを vitest から `@playwright/test` に移す。** 期待値の形と置き場、選び方、見張りの表、排他、`check` と `tw verify` の読み方は変えず、変わるのはランナーと、ブラウザの起こし方と、入口 `scripts/dev/e2e.ts` の中だけにする。
移す間は、どのファイルを Playwright で流すかを1つの表で決め、入口が両方のランナーを続けて流す。移す単位は `docs/architecture/testing/e2e-scenario-*.md` の4分野。
**撮影の道具（`scripts/capture/`）は CLI のまま `playwright-core` で起こし、`@playwright/test` からは `expect` の自動待ちだけを借りる。**

全面移行は 2026-10-31 に利用者が決めた。材料は `docs/research/playwright-test-trial-2026-10-31.md`（以下「試作の記録」。試作と、前段の確認4件の追記）。単体テストは vitest のまま。ブラウザは Playwright 同梱の `chromium-headless-shell` で、製品版 Chrome は使わない。実会話が写る外部サービスと Storybook（ADR 0041）は範囲の外。

## 何が困っていたか

- ブラウザの起動・接続・後始末と、1件ごとの後始末の順を、自前の足場（`test/e2e/scenario-run.ts`・`chrome-launch.ts`・`test/e2e-chrome-setup.ts`、計 124 行）が持っている。`@playwright/test` の fixture と worker が同じ役を持つ
- 失敗の手がかり（trace・レポーター）、`expect` の自動待ち、画像の比較が、ランナーに備わったものを使えず、足場の側で書くか、無いままになっている

## 前提の裏取り

前段の確認の課題は4件とも済んでおり、取り下げたものは無い。

| 前提                                                              | 確かめた場所                                                                                      | 結果                                                                                                                                                                                                                          |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 部屋を使う E2E が、既存の足場のまま `@playwright/test` の下で通る | 試作の記録「E2E 3 本の移行と 37 本ぶんの見積り」                                                  | `inquiry`・`session-switch`・`target-size`（16 テスト）が各 10 回 10/10。`scenario-open.ts`・`artifact.ts` ほか 2,165 行は書き換えずに呼べ、新しく書いたのは fixture の 34 行                                                 |
| 移すと所要が縮む                                                  | 同上                                                                                              | 縮まない。疑似セッションの場面を流す3本は同じ（`inquiry` 13〜15 秒が 14〜17 秒）。縮んだのは場面を流さない `design-gallery` の試作だけ                                                                                        |
| 期待値を `artifact.ts` のまま比べられる                           | 同上「期待値の比べ方」の案A                                                                       | 期待値4件が既存と同じ中身で比べられ、壊した版では食い違いとして落ちた。`E2E_UPDATE=1` を Playwright の下で打つことは試していない                                                                                              |
| 期待値を `toMatchSnapshot` に移せる                               | 同上の案B                                                                                         | 名前の `.` を `-` に直して探すので、いまの名前のままでは見つからない。完全一致 15 件の改名が要り、部分一致（`*.dom-pick.json`）37 件は表せない                                                                                |
| 37 本が同じ fixture に載る                                        | `test/e2e/*.test.ts` の import を数えた                                                           | 37 本すべてが `useScenarioRun` を使い、vitest から読むのは `describe`・`it`・`expect` だけ。`it.each` は6本、完全一致の `settleAndMatch`・`settleAndMatchWithMessages` は3本、`expectReadable` は3本                          |
| 設定の trace と `openRoom` の trace がぶつかる                    | 試作の記録「衝突と制約」                                                                          | 設定の `trace: "retain-on-failure"` で `Tracing has been already started` が出た。ファイルで `trace: "off"` にすると通った                                                                                                    |
| 複数の worker で動く                                              | 同上                                                                                              | 試していない（`workers: 1` だけ）。成果物の置き場はシナリオ名ごとに分かれている                                                                                                                                               |
| `#design` の全面の画像が安定して比べられる                        | 試作の記録「全面の比較に残る課題」                                                                | ポートの固定・作業状態が `idle` になるまでの待ち・高さの待ち・Chart.js の伸びの止めを入れて、基準を書いたあとの 10 回が 10/10。基準を書く回は1〜3回の打ち直しが要る。ほかの画面は確かめていない                               |
| 撮影の待ちを `expect` で置き換えられる                            | 試作の記録「撮影の待ちの置き換え」                                                                | `data-revealing` の終わりの待ちは `toHaveCount(0)` で 10/10。`settleRender`・`watchSceneEvents` は試していない。検証結果の表は `toBeVisible` が `hidden` と判定し、`toBeAttached` なら待てた                                  |
| `@playwright/test` の `expect` が runner の外で動く               | `playwright-core` で起こしたページに `node --input-type=module -e` で1回打った                    | `toHaveCount` は自動待ちで通った。`toHaveScreenshot` は `toHaveScreenshot() must be called during the test` で落ちた                                                                                                          |
| Playwright の JSON レポートの出力先を環境変数で渡せる             | `PLAYWRIGHT_JSON_OUTPUT_FILE=<パス> pnpm exec playwright test --reporter=json --list` を1回打った | 渡したパスに `config`・`suites`・`errors`・`stats` の JSON が書かれた。vitest の JSON（`testResults`・`numTotalTests`・`numFailedTests`）とは形が違う                                                                         |
| `check` は E2E の段に vitest の引数を渡し、vitest の JSON を読む  | `scripts/dev/check.ts` の `runBuffered`・`scripts/dev/lib/check-stage.ts` の `e2eStage`           | `--bail=3`・`--maxWorkers=<n>`・`--reporter=default --reporter=json --outputFile.json=<パス>` を `pnpm run test:e2e` に渡し、落ちたテスト・通ったテスト・落ちたファイル・総数を `check-failure.ts`・`stage-verdict.ts` が読む |
| 選び方と見張りの表はファイルのパスで決まり、ランナーに依らない    | `scripts/shared/e2e-selection-repository.ts` の `readE2eSelection`・`scripts/shared/e2e-watch.ts` | E2E ファイルは `test/e2e/<名前>.test.ts` の形のパスで数え、見張りの表の鍵も同じパス                                                                                                                                           |
| 全件の排他は `check` が段の外で取る                               | `scripts/dev/check.ts`・`scripts/dev/lib/e2e-exclusion-directory.ts`                              | `--full` の `test:e2e` の段を起こす前に `e2e-full-lock` を占有する。段の中のランナーには依らない                                                                                                                              |
| 片方のランナーの書き方をもう片方の下で読むと落ちる                | `describe`（vitest）と `test`（`@playwright/test`）を、それぞれのランナーの外で1回ずつ呼んだ      | どちらも例外で止まった（`Playwright Test did not expect test() to be called here` など）。ランナーの中で読んだときは確かめていない                                                                                            |

移行の障害になる結果は無かった。確かめていない前提（複数の worker・`E2E_UPDATE=1`・完全一致の比べ）は、基盤の切り替えと最初の分野の移行で確かめる（下の「置き換えの順」）。

## 決めたこと

### 1. 期待値の形と置き場（論点1）

- **期待値は今のまま `test/e2e/expected/<シナリオ>.dom.json`・`<シナリオ>.dom-pick.json`・`<シナリオ>.messages.json`（52 個）で、比べるのは `test/e2e/artifact.ts`（`matchArtifact`・`matchPickedArtifact`）のまま。** 名前も中身も変えない
- **撮り直しは今のまま `pnpm run test:e2e:update`（`--full`・ファイルの名指し）で、`scripts/dev/e2e-update.ts` が `E2E_UPDATE=1` を立てて `pnpm run test:e2e` を打つ。** Playwright の `--update-snapshots`・`toMatchSnapshot`・`toHaveScreenshot` は E2E の判定に使わず、`snapshotPathTemplate` も置かない
- **`pnpm run check` の `STAGE<TAB>expected-diff<TAB><行数>` は測り方を変えない**（`scripts/dev/lib/expected-diff.ts` が `test/e2e/expected/` の差分を数える。置き場が同じなので数も同じ）
- 失敗の保存（`/tmp/tsukumo-e2e/failures/<シナリオ>/`）と、落ちた it の trace（`test/e2e/output/<シナリオ>/trace.zip`。`openRoom` が始める）も今のまま
- `artifact.ts`・`test/e2e/readability-scan.ts` の `import { expect } from "vitest"` は、移す間はそのまま（試作で Playwright の下でも動いた）。撤去のときに `@playwright/test` の `expect` に替える

理由: 試作で、`artifact.ts` を呼ぶだけで期待値が既存と同じ中身で比べられ、足す足場は 0 行だった。`toMatchSnapshot` に移すと完全一致 15 件の改名と設定が要り、部分一致 37 件のために `artifact.ts` の中心（`matchPickedArtifact` と置換表）は結局残る。得るのは失敗の保存と差分の約 80 行の肩代わりだけ。

### 2. 並行期間の保ち方（論点2）

- **Playwright で流すファイルを決めるのは、`scripts/shared/` に新しく置く `e2e-runner.ts` の表 `PLAYWRIGHT_E2E_FILES`（`test/e2e/<シナリオ>.test.ts` の並び）1つだけ。** 新しく置く `playwright.config.ts`（リポジトリの根）の `testMatch` がこの表を読み、`vitest.e2e.config.ts` の `exclude` もこの表を読む。どのファイルも必ずどちらか一方だけで流れる
- **ファイルの名前と置き場は変えない（`test/e2e/<シナリオ>.test.ts` のまま）。** 選び方（`scripts/shared/e2e-selection.ts`）・見張りの表（`scripts/shared/e2e-watch.ts`）・期待値の持ち主（`scripts/shared/e2e-scenario.ts`）・参照の検査（`test/document/e2e-reference.test.ts`）・全件の門（`scripts/dev/lib/e2e-full-guard.ts` の `.test.ts` の判定）・`scripts/dev/e2e-update.ts` の名指しの判定は、手を入れずにそのまま効く。選び方の足場の根 `HARNESS_ROOTS` にだけ `playwright.config.ts` を足す（表のファイルは2つの設定から届くので、表を変えると全件が流れる）
- **入口 `pnpm run test:e2e`（`scripts/dev/e2e.ts`）が、渡されたファイルを表で2つに分け、vitest → Playwright の順に続けて流す。** ファイルを渡さない全件は、両方を全件で流す。片方に当たるファイルが無ければ、その片方は起こさない。終了コードは、どちらかが落ちれば 0 以外
- **`check` は今と同じ引数を `pnpm run test:e2e` に渡し、入口が Playwright 向けに写す。** `--bail=<n>` は `--max-failures=<n>`、`--maxWorkers=<n>` は `--workers=<n>`、`--outputFile.json=<パス>` は `PLAYWRIGHT_JSON_OUTPUT_FILE` に置いた一時のパスと `--reporter=list,json` にする。入口が知らない旗を渡されたら、終了コード 2 で止める（黙って片方にだけ効かせない）
- **入口は Playwright の JSON を vitest の JSON の形（`testResults[].name`・`status`・`assertionResults[].status`・`fullName`、`numTotalTests`・`numFailedTests`）に畳み、vitest の分と1つに合わせて `--outputFile.json` のパスへ書く**（`scripts/dev/lib/` に新しく置く `e2e-report.ts`）。`fullName` は describe と test の題を空白でつないだもの（vitest と同じ）。だから `scripts/dev/check.ts`・`check-failure.ts`・`stage-verdict.ts`・打ち直しの控え `.check-record.json`・flaky の台帳 `flaky-ledger.jsonl`・`tw verify` の段の読み方は変えない
- **移す単位は分野（下の5の4つ）。** 1つの分野の本を、試作から `test/e2e/` へ移す fixture（`room-fixture.ts`）の `test` で書き換えるのと、`PLAYWRIGHT_E2E_FILES` に足すのを、同じコミットに入れる。判定の中身（`it` の題・撮る口・期待値）は変えない
- **切り戻しは、その分野のコミットを戻すこと**（表から外れ、vitest 版が戻る）。並行期間のあいだ vitest 側の足場（`scenario-run.ts`・`chrome-launch.ts`・`test/e2e-chrome-setup.ts`）は消さない
- 移す間の `docs/architecture/testing/e2e-run.md` には、表と入口の分け方の段落だけを足す。正典の書き換えは撤去のときにまとめて行う

理由: 名前を `*.spec.ts` に変えてランナーを名前で分けると、選び方・見張りの表・全件の門・撮り直しの名指し・シナリオの一覧の文書が `.test.ts` を前提にしているため、移す間は両方の名前を受け、終わったら全部を書き換えることになる。表なら、移す間の仕組みは表と入口の分け方と JSON の畳み方の3つに収まり、撤去で表ごと消えて、終わった姿は今のファイルの並びと同じになる。表と中身が食い違ったときは、片方のランナーの書き方がもう片方の下で例外を出して落ちる見込み（ランナーの外では確かめた。ランナーの中では基盤の切り替えで確かめる）。

### 3. 排他・並列数・ブラウザの起こし方（論点3）

- **排他は変えない。** `check --full` は今のまま `test:e2e` の段を起こす前に `e2e-full-lock` を占有し、段の中で両方のランナーが流れる
- **並列数は `playwright.config.ts` の `workers: "40%"`**（vitest の `maxWorkers: "40%"` と同じ比）。`check` の worker の予算（`scripts/dev/lib/worker-budget.ts`）は `--maxWorkers=<n>` で渡り、入口が `--workers=<n>` に写す。移す間は2つのランナーを続けて流すので、予算を2倍に使わない
- **ブラウザは Playwright の worker ごとの `browser` fixture に任せる**（worker ごとに headless shell を1つ）。`globalSetup` の `chromium.launchServer` と `provide` で配る `wsEndpoint`・ファイルごとの `connect` は、vitest 側が無くなったら消す。1件ごとの部屋は今のまま `openRoom` が `browser.newContext` で開き、後始末は `room-fixture.ts` の teardown が積んだ順の逆に走らせる
- 設定のほかの値: `timeout: 60_000`・`expect.timeout: 15_000`（vitest の `testTimeout`・`expect.poll.timeout` と同じ）・`retries: 0`（打ち直しで通ったものは flaky の台帳が拾うので、ランナーでは打ち直さない）・`fullyParallel: false`（ファイルの中は順に流す。vitest と同じ）・`globalSetup: "./test/built-ui-setup.ts"`（組み立ての指紋の確かめ）・`trace` は既定（`off`）・`channel` は渡さない。`TZ=UTC` は入口が環境変数で渡す（vitest の設定の `env` と同じ値）
- レポーターは `list` だけで、`check` が JSON を求めたときに `json` を足す。HTML レポーターは置かない

理由: worker ごとのブラウザは Playwright の既定で、自前の起動・配り・接続（計 124 行）を消せる。ブラウザを1つにしている今の形の利点（起こす回数が少ない）が負荷に効いているかは測っていないので、撤去の前に全件を測って決め直す（下の「未決」）。

### 4. 撮影の道具（論点4）

- **撮影の道具（`capture-view.ts`・`capture-catalog.ts`・`compare-html.ts`）は CLI のまま、`playwright-core` でブラウザを起こす形を保つ。** `@playwright/test` からは `expect` の自動待ち（locator の待ち）だけを借りる
- 借りるのは2つ: 演出の終わりの待ち（`scripts/capture/lib/reveal-end.ts` の `waitForRevealEnd`）を `expect(locator).toHaveCount(0, { timeout })` に、件の `settle.kind` の `selector` の分岐（`capture-catalog.ts` の `settleScene` の `waitForSelector`）を `expect(locator)` の待ちに替える。上限を超えたときの今の振る舞いは待ちごとに保つ。`waitForRevealEnd` は上限を超えても例外を出さずに先へ進み（撮るかどうかは続く `settleStill` が決める）、`settleScene` の `selector` の分岐は上限を超えたら撮らずに落ちる。`expect` は上限で例外を出すので、`waitForRevealEnd` の側はその例外を捕まえて進む
- 残す: 画が止まるまで待つ `settleStill`（`capture-page.ts`）と `waitUntilStable`（`stable-sample.ts`）、`settleRender`（`render-settle.ts`）、場面の終わりの待ち（`scene-end.ts`）、時計を進める `revealPageAt` と打ち切りの `Escape`（`page.clock`・`page.keyboard` は両方で同じ API）、`compare-html.ts` の比べ（字数と紙の寸法で、画素ではない）

理由: 画が止まるまで待って撮る役は `toHaveScreenshot` にしか無く、`toHaveScreenshot` は runner の外で呼ぶと落ちる。道具を runner の上に載せると、`--only`・`--out`・`--scene` などの CLI の口が環境変数と `--grep` に変わり、`docs/architecture/testing/visual-check.md` とスキルが書く打ち方が全部変わる。基準画像と比べる `toHaveScreenshot` の意味（基準が無ければ書いて落ちる）も、毎回撮り直して人が見る道具の役と合わない。

### 5. 置き換えの順と後段の切り方（論点5）

分野は `docs/architecture/testing/e2e-scenario-*.md` の4つで、ファイルはその表に載る文書に割り振る（2つの文書に名前が出るものは、行の持ち主の文書）。

| 分野（文書）                                                  | 本数 | 基盤で移す本     | 分野の課題で移す本 | 試作で通していない完全一致の比べ |
| ------------------------------------------------------------- | ---- | ---------------- | ------------------ | -------------------------------- |
| 会話の画面の配置（`e2e-scenario-conversation-layout.md`）     | 7    | `inquiry`        | 6                  | 1（`conversation-tier`）         |
| 会話の状態（`e2e-scenario-conversation-state.md`）            | 8    | `target-size`    | 7                  | なし                             |
| タスク・雑談・設定（`e2e-scenario-task-chat-and-setting.md`） | 9    | `session-switch` | 8                  | 1（`chat-compact-boundary`）     |
| ターンと入力（`e2e-scenario-turn-and-input.md`）              | 13   | なし             | 13                 | 1（`turn-flow`）                 |

`it.each`（6本）と `expectReadable`（3本）は、試作の `inquiry`・`target-size` で通した（`it.each` は `for` に直した）。試作で通していないのは、完全一致の `settleAndMatch`・`settleAndMatchWithMessages` の3本だけ。

| 順            | 作業                                                                                                                                                                                                                                                                   | 難しさ | `loopable` |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------- |
| 1             | 基盤を切り替える: `playwright.config.ts`・表の `e2e-runner.ts`・入口の分け方と引数の写し・JSON を畳む `e2e-report.ts`・`HARNESS_ROOTS`、試作の `room-fixture.ts` を `test/e2e/` へ移し、試作で通した3本を移す。2 worker と `E2E_UPDATE=1` を Playwright の下で確かめる | sonnet | Y          |
| 2             | 会話の画面の配置の 6 本を移す（完全一致の比べを持つ分野のうち本数が最も少ないので先にする）                                                                                                                                                                            | sonnet | Y          |
| 3             | 会話の状態の 7 本を移す                                                                                                                                                                                                                                                | sonnet | Y          |
| 4             | タスク・雑談・設定の 8 本を移す                                                                                                                                                                                                                                        | sonnet | Y          |
| 5             | ターンと入力の 13 本を移す                                                                                                                                                                                                                                             | sonnet | Y          |
| 1〜5 と並べて | 撮影の道具の待ちを `expect` に替える（上の4）。前後で撮った画が変わらないことを確かめる                                                                                                                                                                                | sonnet | Y          |
| 6             | 全件を Playwright で2回測ってブラウザの起こし方を決め（下の「未決」）、vitest 側の E2E の足場・表・入口の分け方・試作の置き場 `test/playwright-trial/` を消し、E2E の正典を書き換える                                                                                  | sonnet | Y          |

順2〜5 は直列にする（どれも表 `PLAYWRIGHT_E2E_FILES` に行を足すので、並べると同じ行の近くでぶつかる）。各分野の課題は、移した本を10回続けて流して全部通ることを完了条件に持つ。撮影の道具の課題は E2E の基盤に依らないので、順1を待たない。

## 採らなかった案

- **期待値を `toMatchSnapshot` に移す**: 完全一致 15 件の改名と `snapshotPathTemplate` の設定が要り、部分一致 37 件は表せず `artifact.ts` の中心が残る（上の1）
- **37 本を1つの課題でまとめて移す**: 試作で通していないもの（完全一致の比べ・複数の worker・`E2E_UPDATE=1`）の揺れが、37 本の差分の中で一度に出る。分野ごとに10回ずつ流して確かめる
- **ファイルを1本ずつ移す**: 課題が 34 件に増え、揺れの確かめ（10回）を本の数だけ回すことになる。分野の文書と同じ切り方なら4件で済み、移した分野の正典を同じ課題で読み直せる
- **移したファイルを `*.spec.ts` に改名してランナーを名前で分ける**: 名前を前提にした選び方・見張りの表・全件の門・撮り直しの名指し・文書が、移す間は2つの名前を受け、終わったら全部書き換わる（上の2）
- **どちらのランナーかを、ファイルの import から決める**: 表が要らないが、2つの設定と入口がテストの本文を読むことになり、どこまで移ったかが1か所で読めない
- **並行期間を置かず、基盤の切り替えと同時に vitest 側を消す**: 切り戻しの道が無くなり、分野の課題が揺れたときに E2E 全体が止まる
- **`check` を Playwright の引数と JSON に合わせて書き換える**: 移す間は2つの形を読むことになり、打ち直しの控えと flaky の台帳にも手が入る。入口で1つの形に畳めば、ランナーの違いは入口に閉じる
- **ブラウザを1つにして `use.connectOptions` で全 worker から繋ぐ**: 今の形に近いが、自前の起動と配りが残る。負荷が悪くなったときの戻り先として残す（下の「未決」）
- **設定に `trace: "retain-on-failure"` を置き、`openRoom` の trace を外す**: 37 本が自前の trace の置き場（`test/e2e/output/<シナリオ>/trace.zip`）を前提にしており、移す間に2つの置き場ができる
- **撮影の道具を `@playwright/test` の上に載せ、`toHaveScreenshot` で止まるまで待つ**: CLI の口が変わり、基準画像の意味が道具の役と合わない（上の4）
- **`#design` の全面の画像の比べを E2E に足す**: E2E の判定は2つの JSON だけで、見た目は目視で確かめる（`docs/architecture/testing/visual-check.md`）。基準画像の置き場と、基準を書く回の打ち直しが決まっていない（下の「未決」）

## 未決

- **ブラウザの起こし方**: 順6で、全件を Playwright で2回流して、壁時計・最大プロセス数・1分の平均負荷を、vitest の全件（`docs/architecture/testing/e2e-run.md`「E2E 全件の所要」の 65 秒前後）と比べる。壁時計か平均負荷が2割を超えて悪くなったら、`globalSetup` で起こした1つのブラウザに `use.connectOptions` で繋ぐ形に替える
- **画像の比べを E2E の判定に入れるか**: `#design` の全面は止める手を入れて 10/10 だが、ほかの画面は確かめておらず、基準画像をリポジトリに置くかも決まっていない。この移行の範囲には入れない。入れるなら利用者が別に決める
- **trace の置き場**: `openRoom` の自前の trace を Playwright の `trace` の設定に寄せるかは、撤去のあとに決める
- **`toBeVisible` が検証結果の表を `hidden` と判定する原因**: 祖先の `display: contents` かどうか確かめていない。撮影の道具の `selector` の待ちを `toBeAttached` にするか `toBeVisible` にするかは、撮影の道具の課題で前後の画を比べて決める
