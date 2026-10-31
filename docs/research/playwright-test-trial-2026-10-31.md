# `@playwright/test` の試作と計測（2026-10-31）

状態: 試作の結果。全面移行をするかは決めていない。

**この文書は調査メモであって正典ではない。** 見本帳（`#design`）の E2E と画像の比較を `@playwright/test` で2本だけ試作し、
いまの E2E（vitest + `playwright-core`）と同じ手順で測った記録。写したのは fake driver の架空の会話だけで、画像は `/tmp/tsukumo-playwright-trial/` に出し、リポジトリには置いていない。

## 要約

- DOM の判定（部品数・`aria-busy` が残らない）は、`@playwright/test` の `expect` の自動待ちだけで書けた。試作側の自前の足場は設定と fixture の 55 行で、10回連続 10/10 通過、所要は 1 回あたり 1.4〜2.1 秒（現状は 3.81〜5.54 秒）。
- 画像の比較は、最初の試作では `#design` の**全面**を撮れず、ヘッダを外した最初の1画面（`clip: { x: 0, y: 56, width: 1440, height: 844 }`）だけが通った。そのあと、ヘッダの揺れ3つ（ポート固定・作業状態が `idle` になるまで待つ・高さの安定待ち）と棒グラフの伸び止め（`Chart.defaults.animation = false`）を入れて `clip` を外した全面（1440x14718）で、基準を書いたあとの10回が 10/10（下の「全面の比較に残る課題」の測定）。
- 現状との行数の比べ方は、そろっていない。現状の 751 行は、この1本が通らない部分も含むファイル全体の行数で、試作の 55 行は最小の足場。削れる割合の根拠にはまだならない。

## 測った数

手順は両側で同じ。現状は `pnpm exec vitest run --config vitest.e2e.config.ts test/e2e/design-gallery.test.ts` を10回連続、試作は `pnpm exec playwright test -c test/playwright-trial/playwright.config.ts <ファイル名>` を10回連続。試作の画像は、基準を書いたあとの10回で数えた。

|                  | 現状（vitest・DOM の判定）                                                                                                                     | 試作 gallery（DOM の判定）                                                          | 試作 image（画像の比較。ヘッダを外した最初の1画面） |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------- |
| 自前の足場の行数 | 751（`scenario-run.ts` 68・`chrome-launch.ts` 34・`scenario-open.ts` 359・`fixed-clock.ts` 30・`dom-tree.ts` 260）。テスト本体 36 を足すと 787 | 55（`tsukumo-fixture.ts` 35・`playwright.config.ts` 20）。テスト本体 15 を足すと 70 | 55（同じ足場）。テスト本体 14 を足すと 69           |
| 所要（1回）      | vitest の Duration 3.81〜5.54 秒（壁時計 4〜6 秒）                                                                                             | playwright の表示 1.4〜2.1 秒（壁時計 1〜3 秒）                                     | playwright の表示 1.5〜1.8 秒（壁時計 1〜2 秒）     |
| 10回連続の通過   | 10/10                                                                                                                                          | 10/10                                                                               | 10/10（基準を書いたあと）                           |

- 現状の 751 行は、5ファイルの全体の行数。`design-gallery` が通らない部分（`scenario-open.ts` の他のシナリオ向けの口、`dom-tree.ts` の DOM の構造の読み出しなど）も含む。試作は、この1本が要る分だけを書いた最小の足場なので、並べた差をそのまま削減率とは読めない。
- 現状はこのほかに `test/e2e-chrome-setup.ts` 22 行・`test/built-ui-setup.ts` がある。名指しの `tsukumo-process.ts` と `fake-tsukumo-process.ts` は、試作も同じものを呼んでおり、どちらの行数にも入れていない。
- 全面に改めた image（上の表の画像の列は最初の1画面のときの数）: 基準を書いたあとの10回が 10/10、1回あたり 4.8〜6.2 秒（playwright の表示）。基準を書く1回目は不安定で、打ち直しが要る。同じ fixture の gallery は3回とも通った。足場は `tsukumo-fixture.ts` が 35 行から 44 行に増えた（ポートの固定。`spawnTsukumo` に省略できる `port` 引数を足して呼ぶ）。
- 試作の gallery は、現状の E2E のように疑似セッションの `turn-finished` を待たず、`#design` を直に開く。判定の3つは同じ。

## 置き換えられた部分・残る部分

`@playwright/test` が肩代わりした部分:

- ブラウザの起動と接続（現状の `e2e-chrome-setup.ts`・`chrome-launch.ts`・`scenario-run.ts` の `beforeAll`/`afterAll`）。`page` は fixture として渡る。
- DOM の「落ち着くまで待つ」（現状の `settledDom`）。この判定は `expect(locator).toHaveCount(...)` の自動待ちで足りた。
- コンテキストの設定（viewport・`locale`・`timezoneId`・`reducedMotion`）。設定の `use` に書いた。
- 画像の基準の保存と比較（`toHaveScreenshot`）。基準が無い回は書いて失敗し、次の回から比べる。2枚連続で安定するまでの待ちも含む。
- 失敗時の trace とレポート（設定の `trace: "retain-on-failure"` と HTML レポーター）。

試作でも自前で残った部分:

- fake driver の tsukumo を起こして止め、一時のディレクトリを作って消す部分（fixture の 35 行）。`spawnTsukumo`・`stopTsukumo`・`waitForViewUrl` は現状の E2E と共用。
- サーバ側の時計の固定（`spawnTsukumo` が渡す `TSUKUMO_FIXED_CLOCK` と `TZ`）。
- cwd の固定名（`trial-project`）。ランダムな接尾辞がヘッダに写って画像がずれたので、fixture で固定した。

## 確かめて分かったこと

- 同じ headless shell で動いた。別の取得は要らなかった（`playwright-core` と `@playwright/test` は同じ 1.64.1）。
- `page.clock` は、gallery の判定にも、画像の clip にも要らなかった。画像側は、`installFixedClock`（ブラウザの時計を固定する現状の足場）を入れた回と外した回をそれぞれ10回連続で回し、どちらも 10/10 だった（外した回は基準を書き直した）。全面でも要らなかった（下の「全面の比較に残る課題」の表で、固定あり・なしの全案が 10/10）。
- 全面（1440x14718）の `toHaveScreenshot` は、安定した2枚が取れず 5 秒で Timeout した。最初の2枚は高さが 12338 から 14718 へ伸びていた。伸びたあとも、棒グラフ2か所を含む約 2% の画素が連続した2枚で違った。
- ヘッダの数値: 1画面分（ヘッダ込み）の画像は、cwd のランダムな名前を固定名にしても、回ごとに 155〜874 画素ほどずれた。回避は `clip` でヘッダを外すことだった。
  上端 56 画素以内の要素の本文と矩形を、起動を2回、うち各回は最初の読み込みと再読み込みの2回ずつ（計4回）採って突き合わせたところ、正体は次の3つだった。

  | 揺れ         | 要素・値                                                                                                                                 | 出どころ                                                                                                                                                        | 変わる理由                                                                                                                                                                                           |
  | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | ポート番号   | プロジェクト名の隣の `span.screen-nav-room-note` が `60886` や `60912`                                                                   | 表示は `screen-nav-session-tag.tsx:110`、値は `use-screen-nav.ts:290` の `currentRoomName()` が `window.location.port` を `roomName()`（`room.ts`）に渡して作る | 語彙の外のポートは番号のまま名乗る。`spawnTsukumo` が `port: 0`（OS 任せ）で起こすので起動ごとに違う。桁が同じでも文字幅が違い（46.17 と 43.45）、右の要素の x が約 2.7 画素動いてヘッダ全体が詰まる |
  | 作業状態の窓 | `[data-work-state]` の `idle` と `running`、状態の語（`依頼待ち` と `作業中`）、マーク（`○` と `●`）、`screen-nav-gate` の `is-disabled` | 場面の再生は `fake-driver.ts:190` の `firstViewer.then`、マークは `use-phone-head.ts:123`                                                                       | 最初のビューが繋がると場面を流し始め、接続から約 0.9〜2.5 秒だけ `running`、約 3.0 秒以降は `idle`。撮る瞬間が窓の内か外かで変わる                                                                   |
  | 高さの伸び   | ページ全体の高さ                                                                                                                         | `#design` のカタログの描画                                                                                                                                      | 約 1 秒で 12338 から 14718 へ伸びて安定する。伸びの途中で撮ると違う（ヘッダの要素そのものではない）                                                                                                  |

  最初の測りで差分画像に出た「タブの文字のあたり」は、作業状態の窓の語（`依頼待ち` と `作業中`）だと考えられる（差分画像と照らしてはいない）。
  ポートを固定して（`spawnFakeTsukumo` に `port: 47831`）別々の起動を2回採ると、場面が終わるまで 4 秒待ったあと、上端 56 画素以内の本文と矩形が一致した。待たない場合の一致は確かめていない。

## 全面の比較に残る課題

- 棒グラフの伸び: アニメーション API に載らない動きで、`toHaveScreenshot` が止める CSS アニメーションの対象に入らない（撮影側の `settlePage` が別に「静止するまで待つ」のと同じ事情）。止める手を決める必要がある。
  - 伸びの源（`#design` を開いて 100ms おきに 10 秒採った 1 回の計測）: 棒グラフは `chart-block.tsx:37` の `new Chart(canvas, …)` が描く Chart.js の canvas で、`animation` オプションを渡していないため Chart.js の既定の rAF 駆動で伸びる。canvas は 2 枚、`Chart.getChart` が返すインスタンスも最初の標本（読み込みから 586ms）で 2 つ。2 枚の `toDataURL` の長さは約 1.03 秒（586ms から約 0.45 秒後）まで毎標本変わり、以降は止まった。
  - 「見えるまで描かない」仮説（`use-seen-once.ts`）は、この計測では当たらなかった。高さは最初の標本（586ms）で 14718 に達していて、以降動かない。12338 から 14718 への伸びは 586ms より前に終わる。
  - 作業状態の窓: `data-work-state` の変わり目は、読み込みから 111ms で `idle`、528ms で `running`、2688ms で `idle`（約 2.2 秒の窓）。前の表の「接続から約 0.9〜2.5 秒」とは起点が違う（読み込みからと接続から）ので、終わりの時刻の差は 0.5 秒未満に収まる。
  - 止め方の測定（全面 `fullPage: true`、基準を書いたあとの 10 回連続の通過数）。全案に共通の下ごしらえとして、ポートを 47831 に固定し、`data-work-state` が `running` を経て `idle` になるまで待ち、高さが 500ms 動かなくなるまで待つ。

    表の列「時計の固定」は、ブラウザ側の `installFixedClock`（`page.clock`）を入れたかどうか。サーバ側の時計（`TSUKUMO_FIXED_CLOCK`）は fixture がどちらの列でも渡している。

    | 案                                                                           | 時計の固定なし | 時計の固定あり |
    | ---------------------------------------------------------------------------- | -------------- | -------------- |
    | A 待つ（全 canvas の `toDataURL` が 400ms 動かない）                         | 10/10          | 10/10          |
    | B 初期化で止める（`window.Chart` の setter で `defaults.animation = false`） | 10/10          | 10/10          |
    | C 時計を進める（`page.clock.runFor(3000)`）                                  | 10/10          | 10/10          |
    | D マスク（canvas を `mask`）                                                 | 10/10          | 10/10          |
    | 対照: 下ごしらえだけ（棒グラフの手を入れない）                               | 9/10           | 10/10          |
    - 全 8 マスが 10/10。差が出たのは対照の「時計の固定なし」の 9/10 だけで、1 回の揺れの原因は調べていない。作業状態の窓（約 2.7 秒で `idle`）を待つ間に Chart.js の伸び（約 1 秒）は終わるので、棒グラフ専用の手が効いているのか、窓の待ちが効いているのかは、この測定では分けられない。
    - 基準が無い回の `toHaveScreenshot` は、連続した 2 枚が一致するまで撮り直す。A の初回に、この比べで約 22 万画素（約 2%）が違って 20 秒の上限で落ちた回があり、基準を書く回だけは 1〜3 回の打ち直しが要った。基準を書いたあとの比べは、案を問わず落ちなかった（既定の色の許容を使う）。
    - 全面での時計の固定の要否: 通過数は固定あり・なしの両方で 10/10（A・B・C・D）。固定は要らない。
    - 選ぶ案: B。本体を変えず、足場は `addInitScript` の数行で、待ちの長さに依らない。
- ヘッダの揺れ（正体は上の「ヘッダの数値」の3つ）を止める手の案。本体の `src/` は直していない。
  - テスト側: fixture が `TSUKUMO_VIEW_PORT` に固定の空きポートを渡す（または `.screen-nav-room-note` を `mask` する）。作業状態は、場面が終わって `data-work-state` が `idle` になるまで待ってから撮る。高さは `toHaveScreenshot` の安定待ちか明示の待ちで止める。
  - 本体の表示を変える案: 部屋の名前に出すポート番号を、比較する画面では固定の語にする。

## 撮影の待ちの置き換え

撮影の道具（`scripts/capture/`）の「落ち着くまで待つ」と演出の打ち切りを、`@playwright/test` の `expect` の自動待ちで置き換えられるかを、演出の掛かる場面で試した記録。撮影の道具は触っていない。試作は `test/playwright-trial/capture-reveal.trial.ts`（3 本）で、場面は疑似セッション `a2ui-reveal-sample`。

### 演出の掛かる場面

- 撮影の `report-checks` の場面（疑似セッション `report-tool`）には演出が掛からない。2 件目の `report` の前に `report-drafting` が入り、草稿として描いた `report` の確定版は演出の対象から外れる（`draft-reveal.ts` の `revealStepIdOf`）。`reducedMotion` を `reduce`・`no-preference` の両方にして 25 秒採っても `data-revealing` は 0 回だった。表が現れるのは読み込みから約 8.9 秒（2 回採って 8942ms・8949ms）。
- 演出が掛かって検証結果の表（`aria-label` が完全一致の「検証結果」）を含む場面は `a2ui-reveal-sample`。表は約 1.9 秒で現れ、`data-revealing` は約 11.9 秒まで立って約 12.0 秒に消える（採った 1 回の値）。`report-task-verdict`・`report-task-finished`・`report-blocks` では立たず、`notation` では立つ（検証結果の表は無い）。
- 試作の設定の `reducedMotion: "reduce"` のままでは演出が掛からない（`use-report-reveal.ts` が `prefersReducedMotion` で止める）。演出を試す側は `test.use({ reducedMotion: "no-preference" })` で上書きする。
- fixture は、場面名を取る option fixture `scene`（既定 `report-blocks`）を足した。

### 現状の待ち・打ち切りと置き換え

行数は `wc -l`（ファイル全体）と、関数の定義行から閉じ括弧までの行番号の差（関数）。

| 現状の待ち・打ち切り                                                                           | 行数                                           | 役割                                                                               | `@playwright/test` で                                      | 理由・条件                                                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `capture-page.ts` `settleStill`                                                                | 29（134〜162）。ファイル 162                   | 本文の領域を 120ms 間隔で最大 42 回撮り、連続 2 回の一致を待つ                     | 置き換わる見込み（この場面で `toHaveScreenshot` が通った） | `toHaveScreenshot` が連続した 2 枚の一致まで撮り直す。この場面では領域全体を撮って 10 回連続 10/10。領域の縁の 4px を内側へ縮める扱いや、回る輪を止める `animations: "disabled"` は `toHaveScreenshot` の既定（`animations: "disabled"`）が肩代わりするが、縁の扱いは試していない |
| `stable-sample.ts` `waitUntilStable`                                                           | 17（7〜23）。ファイル 23                       | 見本が連続 2 回一致するまでの繰り返し                                              | 置き換わる見込み                                           | `settleStill` と同じ。`toHaveScreenshot` の内側の撮り直しが同じ役                                                                                                                                                                                                                 |
| `reveal-end.ts` `waitForRevealEnd`                                                             | 13（10〜22）。ファイル 22                      | `data-revealing` が消えるのを待つ（上限 30 秒、超えても throw しない）             | 置き換わる                                                 | `expect(locator).toHaveCount(0, { timeout })`。試作で約 12 秒の演出を待って 10 回連続通過。超えたときに throw せず進む挙動は `expect` では別に書く必要がある（`expect` は落ちる）                                                                                                 |
| `capture-page.ts` `revealPageAt`（時計を止めて進める）                                         | 9（50〜58）                                    | `data-revealing` が立つのを待ち、`page.clock.pauseAt`・`runFor` で途中の画へ進める | 置き換えではなく共用                                       | `page.clock` は `playwright-core` と `@playwright/test` で同じ API。試作で `page.clock.install()`・`pauseAt`・`runFor(30_000)` のあと `toHaveCount(0)` が通った。途中の画を撮る側は試していない                                                                                   |
| `capture-page.ts` `SKIP_REVEAL_KEY`（`Escape` で打ち切り）                                     | 1                                              | 演出を飛ばすキー                                                                   | 置き換えではなく共用                                       | `page.keyboard.press("Escape")` のあと 1 秒以内に `data-revealing` が消えた（10 回連続）                                                                                                                                                                                          |
| `capture-page.ts` `settlePage`                                                                 | 4（93〜96）                                    | `settleRender` → `settleStill`                                                     | `settleStill` の置き換え次第。`settleRender` は残る        | 下の `settleRender` の行                                                                                                                                                                                                                                                          |
| `render-settle.ts` `settleRender`                                                              | 36（16〜51）。ファイル 51                      | フォント・画像の decode・終わりのある動き・2 フレームを待つ                        | 残る（試していない）                                       | 試作の場面ではこの待ちを入れずに通った。`toHaveScreenshot` はフォントの読み込みを待つが、画像の decode・終わりのある動きの完了・2 フレームを同じ強さで待つかは試していない。要るかは場面ごとに測る                                                                                |
| `scene-end.ts` `watchSceneEvents`                                                              | 46（107〜152）。ファイル 164                   | WebSocket の `events` フレームを数えて場面の最後の手まで待つ                       | 試せなかった（今回は使わなかった）                         | 試作は `data-revealing` と表の `toBeAttached` を待つだけで通り、フレーム計数は使っていない。DOM の印が無い場面（最後の手が画面に印を残さない）では残る見込み                                                                                                                      |
| `scene-end.ts` `sceneEndTarget`・`settleSceneTarget`・`sceneWindowPlan`・`sceneEventTimeoutMs` | 13・9・8・11（23〜35・41〜49・57〜64・70〜80） | 場面の最後の手の種類・件数と上限時間の算出                                         | 試せなかった                                               | `watchSceneEvents` と対。`expect` の待ちに載せるなら、上限時間は `timeout` に相当する                                                                                                                                                                                             |
| `capture-catalog.ts` `settleScene`                                                             | 27（224〜250）。ファイル 278                   | `settle.kind` ごとに `waitForSelector`（上限 20 秒）か `watch.waitFor`             | `selector` の分岐は置き換わる。場面の終わりの分岐は残る    | `waitForSelector` は `expect(locator).toBeAttached`。表は `toBeVisible` が使えなかった（下の落とし穴）                                                                                                                                                                            |

### 通過数と所要

- `capture-reveal.trial.ts` の 3 本（演出の終わりを待って本文の領域を比べる・`Escape` で打ち切る・`page.clock` で進める）を、基準を書いたあとの 10 回連続で打って 10/10 通過。1 回（3 本分）の所要は playwright の表示で 21.9〜24.8 秒。そのうち演出を待つ 1 本が約 13 秒。基準を書く 1 回目は `A snapshot doesn't exist ... writing actual` で失敗する（打ち直しが要る）。
- Chart.js の伸びの止めと、作業状態・高さの待ちは、この場面では要らなかった（棒グラフが無く、作業状態の窓も撮る位置に影響しなかった）。この場面だけの結果で、ほかの場面では未確認。

### 落とし穴

- 検証結果の表の locator は、`toBeVisible`・`toHaveScreenshot` が `hidden` と判定する（5 秒待っても変わらない）。表は `getBoundingClientRect` で 630x42.8、`visibility: visible`、`opacity: 1` だが、`checkVisibility()` が `false` を返し、祖先に `display: contents` の `<a2ui-react-report>` がある。Playwright の可視判定が `hidden` になる原因がこの祖先かどうかは未確認。撮影の道具の `waitForSelector`（既定は visible）が同じ表を通す理由も未確認。
  回避は、表を `toBeAttached` で待ち、画像を `[data-region="main"]` の locator で撮ること。
- 撮れる範囲は、本文の領域の見えている部分（下の画像は約 1037x514）で、レポート全体ではない。
- `Date` は lint が拒む（`no-restricted-globals`）。ページ内の時刻の読みは `Temporal.Now.instant().epochMilliseconds`。

### 基準画像

`/tmp/tsukumo-playwright-trial/snapshots/capture-reveal.trial.ts/` に `report-checks.png`（演出が終わってから）と `report-checks-skipped.png`（`Escape` で打ち切ってから）の 2 枚。リポジトリには置いていない。2 枚を開いて見比べると、どちらも左に「やり取り」の一覧、右に本文の上部（完了の表示・依頼・結論の一文・検証 1 件の行・「架空の比べ方」の節・注意の枠）が写り、違いは目では見つからなかった（画素の差は測っていない。同じ比べで 10 回通っているので、撮り直しの揺れは小さい）。打ち切りで途中の本文が欠けた様子は写っていない。

## 全面移行を検討する条件（案）

この試作の数だけでは移行の可否は決まらないので、利用者が別の課題で決めるときの物差しとして置く。しきい値は案で、実測の裏付けは無い。

DOM の判定（gallery 型）:

- 移行を検討してよい: 試作の2本目以降を同じ足場の上で10本ほど書き足し、どれも10回連続 10/10 で通り、1本あたりの所要が現状（3.81〜5.54 秒）を超えない場合。
- 見送る: 足場の 55 行が、本数を増やすたびに 2 倍以上に膨らむ場合（現状の 751 行に近づく場合）。

画像の比較（image 型）:

- 検討に入る前提: 全面（または利用者が決めた範囲）の `toHaveScreenshot` が、上の課題2つを止めたうえで10回連続 10/10 で通ること。`#design` の全面は、止める手を入れて 10/10 になった（足場は `design-image.trial.ts` 59 行・`tsukumo-fixture.ts` 44 行）。ほかの画面でも同じ手で足りるかは未確認。
- 見送る: 範囲を縮める・マスクする行が、撮る1枚あたり 3 行を超えて増え続ける場合（回避が足場より重くなる）。

全面移行の判断は、E2E 37 本・`test/e2e/expected/`（約 330KB）・`scripts/dev/e2e.ts`・`scripts/shared/e2e-watch.ts`・`tw verify` / `check --full` の段との結びつきも含めて、別の課題で行う。
