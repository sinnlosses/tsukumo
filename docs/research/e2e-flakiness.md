# E2E テストの揺れ（flaky test）を防ぐ実装方法（2026-09-27）

**この文書は調査メモであって正典ではない。** `docs/` の他ファイルにある「節の索引」はここには
作らない。tsukumo の E2E（Playwright の `playwright-core` でヘッドレス Chrome を操作し、
Vitest をランナーにして DOM の構造を JSON に落として期待値と比べる形）を安定させる実装方法を、
一次情報源（Playwright 公式ドキュメント・GitHub・Martin Fowler・Google Testing Blog）に
遡って調べた記録。会話の実物・利用者のデータは例に使っていない。

## 要約

揺れの原因は大きく9つの型に分かれ、それぞれに Playwright（または一般的なテスト実践）が
用意した「塞ぐ書き方」がある。共通する原則は Martin Fowler の記事が立てた「固定 sleep を
やめて、条件をポーリングで待つ」という1点に収束し、Playwright の auto-waiting・web-first
assertions・`page.clock`・ルーティング・`reducedMotion` はいずれもこの原則の具体化になっている。
tsukumo の足場（`test/e2e/scenario-run.ts`）は、この原則の多くを独自の `settledDom` /
`waitForEvent` / 時計の固定で既に実装しており、公式の道具（`expect.poll`・`toPass`・
`page.route`・`toMatchAriaSnapshot`・`--repeat-each`・`retain-on-failure`）に対応する自作の
仕組みを持つ形になっている。足りないのは主に「並列実行時の共有資源」「リトライで隠さない
という明文化」「揺れの検出を仕組みとして回す運用」の3点。

## 論点ごとの原因の型・塞ぐ書き方・出典

### 待ち方

**原因の型**: 固定時間の `sleep` は、実際に条件が満たされるまでの時間が環境（CI の負荷・
並列度）によって変わるのに、待つ時間を決め打ちにする。速い環境では無駄に遅く、遅い環境では
足りずに落ちる。Martin Fowler はこれを非決定性の主要因の1つに挙げ、次のように書く。

> "Never use bare sleeps to wait for asynchronous responses: use a callback or polling."
> — Martin Fowler, "Eradicating Non-Determinism in Tests"

**塞ぐ書き方**: 状態・イベント・DOM の条件をポーリングで待つ。Playwright はアクション実行前に
「actionability checks」を自動で行い、要素が visible・stable・enabled・receives events に
なるまで待ってから操作する。

> "Playwright performs a range of actionability checks on the elements before making actions
> to ensure these actions behave as expected. It auto-waits for all the relevant checks to
> pass and only then performs the requested action."
> — Playwright, "Actionability"（Introduction 節）

要素の安定判定は「連続する2フレームで同じ bounding box を保つこと」で決まる。

> "Element is considered stable when it has maintained the same bounding box for at least
> two consecutive animation frames."
> — Playwright, "Actionability"

アサーションも同様に再試行する。web-first assertion は既定 5 秒までポーリングし続ける。

> "Playwright will be re-testing the element with the test id of `status` until the fetched
> element has the `"Submitted"` text. It will re-fetch the element and check it over and
> over, until the condition is met or until the timeout is reached."
> "Most of the time, web pages show information asynchronously, and using non-retrying
> assertions can lead to a flaky test."
> — Playwright, "Assertions"

任意の条件を待つ口が `expect.poll`（値を返す関数をポーリング）と `expect.toPass`（コードの
ブロックを再試行。既定のタイムアウトは 0 で、`expect` の既定タイムアウトを継がない）。

**出典**: https://playwright.dev/docs/actionability（Introduction / Visible / Stable / Enabled
節）、https://playwright.dev/docs/test-assertions（Auto-retrying assertions / expect.poll /
expect.toPass 節）、https://martinfowler.com/articles/nonDeterminism.html（Asynchronous
Behavior 節）

### 時計

**原因の型**: システムクロックを直接読むコードは、走らせるたびに違う時刻を返すので、
「N 秒経過」「〜時に表示」のような時刻依存の表示が揺れる。Fowler はこれを時間依存の非決定性
として挙げ、時計をラップして差し替え可能にすることを勧める。

> "Always wrap the system clock, so it can be easily substituted for testing."
> — Martin Fowler, "Eradicating Non-Determinism in Tests"

**塞ぐ書き方**: Playwright の `page.clock` は用途によって使う API が変わる。

- `setFixedTime()`: `Date.now()` と `new Date()` を固定値に固定する。タイマーは自然に動かし
  続ける、最も基本の道具として推奨される。
- `install()`: 他のすべてのクロック操作の前に呼ぶ必要がある初期化。
  > "the call _MUST_ occur before any other clock related calls."
- `pauseAt()`: 指定した時刻で時計とタイマーの両方を止める。
- `fastForward()`: 保留中のタイマーをすべて即時発火させながら時刻を進める。
- `runFor()`: 指定した時間だけ、タイマーを同期的に発火させながら進める。
- `setSystemTime()`: 高度な用途向けとされ、通常は推奨されない。

> "The recommended approach is to use `setFixedTime` to set the time to a specific value.
> If that doesn't work for your use case, you can use `install`."
> — Playwright, "Clock"

**出典**: https://playwright.dev/docs/clock（Deterministic time / setFixedTime / install /
pauseAt / fastForward / runFor 節）、https://martinfowler.com/articles/nonDeterminism.html
（Time 節）

### ネットワーク・非同期の取得

**原因の型**: 外部サービス・API 呼び出しはタイミングが読めず、応答の遅延や不調がそのまま
テストの揺れになる。Fowler はこれを「Remote Services」の非決定性として分類する。

> Test Double（本物の代わりに決定的に振る舞う代替）を使い、Contract Tests で本物との対応を
> 定期的に確かめる（同記事「Remote Services」節の趣旨）。

**塞ぐ書き方**: Playwright では2段構えになる。1つは「取得が届くのを待つ」ための
`page.waitForResponse()`（glob・正規表現・述語関数で対象を絞って1回だけ待つ）。もう1つは
「取得そのものを固定する」ための `page.route()` / `browserContext.route()` によるルーティング
で、実際のエンドポイントを叩かずに決まった応答を返す。

> "You can mock API endpoints via handling the network requests in your Playwright script."
> — Playwright, "Network"（Handle requests 節）

ルーティングで固定できないほど内部状態に依る場合は、取得中であることを DOM の印
（`aria-busy` など）で出し、テスト側はその印が消えるまで待つ、というのが Playwright の
公式ドキュメントには明示されていない tsukumo 独自の補完（後述）。

**出典**: https://playwright.dev/docs/network（Network events / Handle requests 節）、
https://martinfowler.com/articles/nonDeterminism.html（Remote Services 節）

### アニメーション・トランジション

**原因の型**: CSS アニメーション・トランジションは実行中の任意の時点で DOM やスクリーンショット
を捉えると値がフレームごとに変わり、同じ操作でも撮るたびに違う見た目・違う `bounding box` に
なる。

**塞ぐ書き方**: 2つの独立した道具がある。

- `page.screenshot()` / `expect(page).toHaveScreenshot()` の `animations` オプション。
  既定値 `"disabled"` は CSS アニメーション・トランジション・Web Animations をすべて止める。
  有限のアニメーションは完了状態まで早送りして `transitionend` を発火させ、無限のアニメーション
  は初期状態にキャンセルしてからスクリーンショットのあとに再生を戻す（Playwright v1.20 で
  導入。`playwright.dev` の `page.screenshot()` API リファレンス「animations」項の記述。
  一次のページ本文は取得時に切れたため、GitHub の変更履歴・複数の解説記事で内容を確認した
  二次確認つきの記載）。
- `browser.newContext()` の `reducedMotion` オプションは `prefers-reduced-motion` という
  別の CSS メディア特性をエミュレートするだけで、Playwright 自身がアニメーションを止める
  わけではない。
  > "Emulates `'prefers-reduced-motion'` media feature, supported values are `'reduce'`,
  > `'no-preference'`."
  > — Playwright, "Browser"（`newContext` の `reducedMotion` 項）
  > 効果があるかどうかは、対象のページが `prefers-reduced-motion: reduce` に反応する CSS を
  > 書いているかに依る（アプリ側の対応が要る）。

スクリーンショット比較で消せない「値だけ変わる」領域（時刻・カウンタなど）には `mask` で
固定色を上塗りする道具もある（`toHaveScreenshot({ mask: [...] })`）。

**出典**: https://playwright.dev/docs/api/class-page（`screenshot()` の `animations`
オプション。GitHub Release Notes `microsoft/playwright` v1.20.0 でも同機能を確認）、
https://playwright.dev/docs/api/class-browser#browser-new-context-option-reduced-motion
（`reducedMotion` 項）、https://playwright.dev/docs/test-snapshots（Options 節、`mask` の
用途）

### 並列実行と負荷

**原因の型**: 複数のワーカーが同じファイル・同じポート・同じ一時ディレクトリのような
「テストの外にある状態」を共有すると、並列度や実行順序によって結果が変わる。

> "Flakiness comes from state that lives outside a single test."
> — Playwright, "Parallelism"

Fowler も「Lack of Isolation」として同種の問題を挙げる。

> "If one test creates some data in the database and leaves it lying around, it can corrupt
> the run of another test."
> — Martin Fowler, "Eradicating Non-Determinism in Tests"

**塞ぐ書き方**: Playwright はテストファイルをワーカー（別 OS プロセス）に分けて並列に走らせ、
1ワーカーには専用の `BrowserContext` を割り当てて cookie・storage・メモリ上のグローバルを
既定で分離する。

> "Playwright runs tests in separate worker processes, each with its own isolated
> BrowserContext, so cookies, storage and in-memory globals are already isolated."
> — Playwright, "Parallelism"

それでも共有資源（ファイル・ポート・外部プロセス）が残る場合は、`testInfo.testId` から
一意な識別子を作る・`testInfo.outputPath()` で書き込み先を分けることが推奨され、
「他のテストが先に走ったことに依存しない」ことが明文の指針になっている。

> "keep your tests isolated from one another" / 他のテストへの依存を避ける旨の記述
> — Playwright, "Parallelism"

失敗したワーカーはブラウザとプロセスをまるごと捨てて次のリトライに新しいワーカーを使うため、
汚れた状態を次のテストへ持ち込まない。

**出典**: https://playwright.dev/docs/test-parallel（Workers / Shard tests between multiple
machines 節）、https://martinfowler.com/articles/nonDeterminism.html（Lack of Isolation 節）

### スナップショット比較

**原因の型**: 画面まるごとのスクリーンショットや DOM の HTML 文字列比較は、見た目の直し
（色・クラス名・`id`）のたびに無関係な差分で落ちる。「不安定な属性」を期待値に含めると、
実装の詳細が変わるだけで揺れる。

**塞ぐ書き方**: Playwright は2種類の比較を用意する。

- 画像の `toHaveScreenshot()`: 初回実行で基準画像を生成し、以後はそれと比較する。
  `maxDiffPixels` で許容誤差を持たせる、`stylePath` で動的要素を上書きする CSS を当てて
  「決定性を上げる」ことができる。
- アクセシビリティツリーの `toMatchAriaSnapshot()`: ページのアクセシビリティツリーを
  role・属性・値・テキストだけの YAML 表現に落として比較する。CSS のクラス名やスタイルは
  そもそもツリーに含まれないため、見た目の直しによる無関係な差分が原理的に起きない。

> "a YAML representation of the accessibility tree of a page"
> — Playwright, "Aria snapshots"

期待値の更新はどちらも `--update-snapshots` フラグで行い、一致しなかった分だけ更新される。

> "Running tests with the `--update-snapshots` flag will update snapshots that did not
> match. Matching snapshots will not be updated."
> — Playwright, "Aria snapshots"

**出典**: https://playwright.dev/docs/test-snapshots（Introduction / Options / Updating
screenshots 節）、https://playwright.dev/docs/aria-snapshots（Aria snapshots / Updating
snapshots 節）

### リトライの扱い

**原因の型**: リトライは「テストが落ちた理由」を消さずに「落ちたという事実」だけを隠す。
Fowler は非決定的なテストへの対処として、まず隔離（quarantine）して早く直すことを勧め、
無条件に隠すことには触れていない。

> "Place any non-deterministic test in a quarantined area. (But fix quarantined tests
> quickly.)"
> — Martin Fowler, "Eradicating Non-Determinism in Tests"

**塞ぐ書き方**: Playwright はリトライを「隠す」のではなく「記録する」設計にしている。1回目で
落ち、リトライで通ったテストは `passed` / `failed` とは別の `flaky` という状態で報告される。

> "passed" - tests that passed on the first run / "flaky" - tests that failed on the first
> run, but passed when retried / "failed" - tests that failed on the first run and failed
> all retries
> — Playwright, "Retries"

Google のブログも、リトライの仕組みを「揺れていると分かっているテスト」に限定して使い、
無差別なリトライで隠さない運用を取っている（コメント欄含む一次情報の範囲での確認）。

> "Our rerun mechanism is only used for tests that are marked as flaky or when users
> specifically request it"
> — Google Testing Blog, "Flaky Tests at Google and How We Mitigate Them"

Google の別の調査では、post-submit で pass→fail に転じたテストのうち約 84% が実際の
リグレッションではなく揺れだったという報告もある（"De-Flake Your Tests" 論文の紹介ページの
記述。検索経由での確認で、論文本文までは遡っていない）。

**出典**: https://playwright.dev/docs/test-retries（Introduction / Reporting 節）、
https://martinfowler.com/articles/nonDeterminism.html（Quarantine 節）、
https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we.html

### 失敗時の成果物

**原因の型**: 揺れは再現性が低いので、落ちた瞬間の状態（DOM・ネットワーク・スクリーンショット）
を残さないと原因を追えないまま「打ち直したら通った」で終わってしまう。

**塞ぐ書き方**: Playwright は trace・screenshot・video のいずれも「毎回録るが、失敗した回だけ
残す」設定を持つ。

> `'retain-on-failure'` records a video on every run and keeps the video when that run
> failed（trace も同様の意味の `retain-on-failure`）
> — Playwright, "Test use options"（Recording options 節）

既定のテンプレートは `trace: 'on-first-retry'`（1回目のリトライでだけ trace を録る）を使い、
「揺れが疑われた時点」に絞って重い記録を残す設計になっている。

> "trace: 'on-first-retry', // record traces on first retry of each test"
> — Playwright 既定の `playwright.config` テンプレート

**出典**: https://playwright.dev/docs/test-use-options（Recording options 節）、
https://playwright.dev/docs/trace-viewer-intro（Recording a trace 節）

### 揺れの検出

**原因の型**: 揺れは1回流すだけでは見つからない。低頻度の揺れは、直した・足した直後の
1回の成功が「直った証拠」にならない。

**塞ぐ書き方**: Playwright CLI は同じテストを指定回数繰り返す `--repeat-each` を持つ。

> "Run each test `N` times (default: 1)."
> — Playwright, "Command line"（Run tests / All options 節）

Google はこれを「新しく足したテストを1週間ループで流して揺れがないか確かめる」運用として
持つ（ブログのコメント欄で言及される "Reservoir" の仕組み。一次記事本文までは遡れず、
コメント欄の記述に留まる）。

**出典**: https://playwright.dev/docs/test-cli（Run tests / All options 節）、
https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we.html

## tsukumo の今の形との対応

| 調べた書き方                                                       | 判定                                 | 根拠                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 固定 sleep をやめてポーリングで待つ                                | 足場が既にやっている                 | `test/e2e/scenario-run.ts` の `settledDom`（DOM が2回続けて同じ文字列になるまで待つ）と `waitForEvent`（イベントの到着を待つ）。`docs/design.md` 10章「E2E の走らせ方」が「場面を速く流す口は足さない」「届いたイベントを待つ」と明文化                                                                                                                                                                 |
| web-first assertions（`expect.poll`・`toPass`）                    | 足りない                             | `settledDom` は独自実装で `expect.poll` 相当だが、Playwright の `expect(locator).toHaveText()` 等の自動再試行は使っていない（DOM を丸ごと JSON に落として `toEqual` で比べる方式のため、要素単位の web-first assertion とは別系統）。差分は無い設計判断だが、条として明文化はされていない                                                                                                               |
| 偽の時計（`install`・`pauseAt`・`setFixedTime`）                   | 既に正典にある／足場が既にやっている | `docs/design.md` 10章「時計の固定」が `installFixedClock`（`page.clock.install` → `pauseAt`）を明記。サーバ側は `TSUKUMO_FIXED_CLOCK` で別に凍らせる方式                                                                                                                                                                                                                                                |
| 非同期の取得を待つ（`waitForResponse`・ルーティング・`aria-busy`） | 足場が既にやっている                 | `docs/design.md` 10章「E2E の揺れを生まない書き方」2. が `aria-busy="true"` の印を `settledDom` が見る設計を明文化。ネットワークは fake driver が担うので `waitForResponse` / `page.route` に相当する処理は不要（境界がサーバ内に無い）                                                                                                                                                                 |
| アニメーション停止（`animations: disabled`・`reducedMotion`）      | 足場が既にやっている                 | `docs/design.md` 10章が `reducedMotion: "reduce"` を明記。ただし判定は DOM の構造だけで画素を見ないため、`animations: "disabled"` のようなスクリーンショット専用の停止は使っていない（目視は別に「色・崩れは目視」と分離済み）                                                                                                                                                                          |
| 並列実行時の共有資源の隔離                                         | 足りない                             | `docs/design.md` 10章は「ブラウザは1ファイルに1つ、tsukumo は1件ごとに1つ」「一時のディレクトリ」「起こし方」で個別の資源分離は明記されているが、Playwright の "keep your tests isolated from one another / don't depend on another test having run first" にあたる一般原則としての条は無い。ポート選定・一時ディレクトリの命名が競合しない根拠（`testInfo.testId` 相当の一意性）が正典に書かれていない |
| スナップショット比較で不安定な属性を落とす                         | 既に正典にある                       | `docs/design.md` 10章「E2E の成果物と再現」が「落とすのは `class`・`style`・`id`・描かれていない要素・図とグラフの中身・属性を1つも持たない `div`/`span`」を明記。`toMatchAriaSnapshot` 相当（role・属性・文字だけを残す）を独自の DOM 抜き出しで実現している                                                                                                                                           |
| リトライで隠さず、揺れを記録する                                   | 足場が既にやっている                 | `matchArtifact` が食い違いを `/tmp/tsukumo-e2e/failures/` へ自動保存し、`docs/coding-standards.md`「E2E の差分をレビューするとき」が「打ち直す前に控えた it の名前と成果物」をレビュー観点にしている。Playwright の `flaky` ステータスに相当する自動分類（1回目落ち・リトライ通過を区別する仕組み）は無い                                                                                               |
| 失敗時だけ成果物を残す（`retain-on-failure`）                      | 足場が既にやっている                 | `matchArtifact` は食い違った回だけ `/tmp/tsukumo-e2e/failures/<シナリオ>/` に残す（シナリオごと直近5回）設計で、`retain-on-failure` と同じ効果を自作している                                                                                                                                                                                                                                            |
| 揺れの検出（繰り返し実行）                                         | 足りない                             | `docs/coding-standards.md`「E2E の差分をレビューするとき」に「続けて回して確かめた回数」を書く条はあるが、`--repeat-each` に相当する仕組み的な繰り返し実行（CI で自動的に新規シナリオを複数回流す）は無く、人が手で連続実行して回数を記録する運用に留まる                                                                                                                                               |

### 足りないものの条の案

- 「並列実行時の共有資源」: 「E2E のポート・一時ディレクトリ・pid は、シナリオ名や実行のたびに
  変わる値から作り、他のシナリオ・他の作業ツリーの実行と衝突しない値であることを確かめる」
- 「リトライで隠さない」: 「E2E は `pnpm run check` の中で1回だけ走らせ、失敗したら打ち直す前に
  `matchArtifact` の控えを見る。CI 相当の場でも自動リトライで揺れを隠さない」
- 「揺れの検出を仕組みにする」: 「新しいシナリオ・待ち方を直した差分は、コミット前に
  対象ファイルだけを決めた回数繰り返す（Vitest 5 には Playwright の `--repeat-each` に相当する
  CLI のフラグが無い。`it` のオプション `repeats` はあるが、コードに残るので、シェルのループで
  同じ `vitest run` を N 回呼ぶ）ことを機械的に行い、
  `## 結果` にコマンドと回数を書く」
