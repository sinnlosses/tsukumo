# テスト: E2E の走らせ方

ステータス: **正典**。入口は `docs/architecture/testing.md`（テストの全体）。

責務: E2E のランナーとブラウザ、置き場所、`pnpm run check` の段と選び方、起こし方と後始末、場面の流し方、負荷の抑え方。
読む時: E2E を走らせる・足場や `check` の段を直すとき。
直す時: E2E の走らせ方・選び方・負荷の抑え方を変えたとき。

## 節の索引

| 節                 | 中身                                                                                                                                          |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| ### E2E の走らせ方 | ランナー・置き場所・`check` の段と選び方・錠・起こし方・rAF・タイマーに頼る変更の計画での時計の裏取り・場面の流し方・`maxWorkers`・段の優先度 |

## テスト

### E2E の走らせ方

- **ランナーは Vitest**（単体テストとランナーを共有する）。ブラウザは `playwright-core` の `chromium`
  （`channel` を渡さない headless。Playwright 同梱の `chromium-headless-shell`を
  `pnpm exec playwright-core install chromium-headless-shell` で入れる）。**製品版の Google Chrome
  （`channel: "chrome"`）は使わない。起こすたびにデータ保護キーチェーンへ鍵（`com.google.Chrome.unexportable-keys`）を
  2〜5件足し、複数の tsukumo が回すと secd が高負荷になる**。**新しい外部コマンドは足さない**
- **置き場所は `test/e2e/<シナリオ>.test.ts`**（1ファイル = 1つの機能のまとまり。E2E は1つのファイルの
  振る舞いではないので、`src/` の写しの構成には従わない）
- **`pnpm run check` の中の別の段にする**（`pnpm run test` は既定の設定が `test/e2e/` を外し、E2E は
  `pnpm run test:e2e` が E2E 専用の設定で走らせる）。時間切れの既定を E2E の段だけ延ばし、単体テストを
  1ファイル走らせるときに Chrome を要らないままにするため。`pnpm run check` は軽い段（typecheck・lint・format:check・token-limit）と
  重い段（単体と E2E）を全部同時に起こし、1つが落ちると残りを止める。**`--full` でない `check` の単体の段は、変えた `src/`・`test/`・`scripts/` のファイルに関連するテスト
  （`vitest related`）と規約のテストだけ**（`vitest related` は引数を変えたファイルとして読みディレクトリを展開しないので、
  規約のテストのうち `test/architecture/` は中のテストファイルを1本ずつ名指しして渡す。設定だけの変更と `--full` は全件。`vitest.config.ts` の `globalSetup`・`setupFiles` に挙がるファイルはどのテストからも import されず辿れないので、変えたときも全件）。**`--full` の E2E の段だけ、作業ツリーをまたぐ錠を取ってから走らせる**
  （`scripts/dev/lib/e2e-full-lock.ts`。共有の git dir の `e2e-full-lock` に持ち主の pid を書き、
  持ち主が死んでいれば奪う。待っている間は1分ごとに1行出し、15 分を超えたら理由と錠のパスを出して落とす。単体や lint は待たせない）。
  全件が2つ重なると、単独や単体と並べたときには通る `chat-restored-history` が 6 回中 6 回落ちたため
  （2026-10-11 の測定。最大プロセスは 6〜8 から 12 に増え、1分の平均負荷は 11 から 13〜23 に上がった）。
  落ちた原因は、切り替え先が流し直す場面を撮る時点が、負荷で場面の途中に前後したこと。
  いまの `chat-restored-history` は、切り替え先の流し直しが終わる `turn-finished` まで待ってから撮る。
  引数なしの `check` が選ぶ少数の E2E は錠を取らない。
  **並べた段のどれかが落ちたら、まだ走っている段へ `SIGTERM` を送って止める**（自分が起こした子の pid だけ。
  落ちると分かっている段の待ちを延ばさないため。最後の行に「落ちた段」と「止めた段」を分けて出す）。
  **E2E の段には `--bail=3` を付ける**（揺れる E2E が整理されるまでの値）。撮り直し（`test:e2e:update`）には付けない。
  **ファイルを渡さない `pnpm run test:e2e` は全件なので、環境変数 `TSUKUMO_E2E_FULL=1` が無ければ終了コード 2 で止める**
  （入口は `scripts/dev/e2e.ts`。`check` と `test:e2e:update` が立てて通す。1本だけ流すときは
  `pnpm run test:e2e test/e2e/<ファイル>.test.ts` と書き、`--` を前に置かない。置くと絞り込みが効かず全件になる）。
  ひとつの実行の負荷は
  `maxWorkers` で抑える。E2E の1本は vitest のワーカーに加えて
  Chrome と `node src/cli.ts` を起こすので、実際に走るプロセスは `maxWorkers` の本数を大きく超える。
  E2E の設定は `maxWorkers: "40%"`、単体テスト（`vitest.config.ts`）も `"40%"` で、2つ合わせて
  コア数の 80% までに収める（10 コアで各 4、単体 98 秒・E2E 58 秒前後。手元の操作が重く感じたら
  下の `TSUKUMO_CHECK_WORKER_BUDGET` で予算を下げる）。
  単体の `node` project は `isolate: false` でファイルごとの隔離を外す（同じ予算で約 98 秒が約 52 秒）。
  ただし `vi.mock` を使うテストは、`vitest.config.ts` の `ISOLATED_FILES` に挙げて `node-isolated` project で隔離して走らせる（今は `closed-issue.test.ts` が `beads.ts` を、`beads-issues-reader.test.ts` が `git.ts` と `node:child_process` を差し替える）。挙げ忘れた `vi.mock(` のテストも、挙げた項目が `vi.mock` を使わなくなったときも `test/architecture/test-isolation.test.ts` が落とす（理由と書き方は `docs/coding-standards/test.md`「置き場所とモック」）。
  環境変数やグローバルを書き換えるテストは、自分で戻す。
  **`check` は重い段を起こす前に、共有の git dir の `check-running/` へ自分の pid の印を置き
  （`scripts/dev/lib/check-running.ts`。終了・`SIGTERM`・`SIGINT` で消し、死んだ pid の印は数えるときに消す）、
  走っている検証の本数で worker の予算を割って、単体と E2E の段に `--maxWorkers=<n>` を同じ数ずつ渡す**
  （`scripts/dev/lib/worker-budget.ts`。予算は 1 本のときの合計 `2 × max(1, round(コア数 × 0.40))`（`maxWorkers: "40%"` が 1 本のときに配る数と同じ。10 コアで 8）、
  環境変数 `TSUKUMO_CHECK_WORKER_BUDGET`（正の整数。例: `TSUKUMO_CHECK_WORKER_BUDGET=4 pnpm run check`）で上書きして下げられる。1 本あたりは `floor(予算 / 本数 / 2)`、最小 1。
  並列は止めない。途中から増えた検証は、その時点の本数で自分の分を決め、走っている検証の worker は変えない。
  本数が多く最小 1 に当たるときは予算を超えうる）。単体は `dom`・`node`・`node-isolated` の3つの project に分け、DOM のグローバルを借りる
  happy-dom の環境（`environment: "happy-dom"`）と `test/dom-setup.ts` は `dom`（`test/browser/` と、DOM を描くほかの置き場のファイル）にだけ掛ける。
  `vitest.config.ts` の `DOM_TEST_FILES` に無いファイルが DOM を要するようになったら、そこへ足す
- **変えたファイルがすべて文書なら、`--full` でも段は `format:check`・`token-limit` と文書の検査（`pnpm run test:document`）だけになり、E2E は流れない。**
  選んだ段は `文書だけの変更のため…` の1行で出る（`scripts/dev/lib/check-stage.ts` の `planStages`）
- **引数なしの `pnpm run check` は、変えたファイルから選んだ E2E のファイルだけを流し**、選んだもの
  （または全件に倒した理由のパス）を1行で出す。**全件は `pnpm run check --full` で、main へ送る直前
  （`tw ship` の送る前の検証コマンドと `scripts/dev/ship.ts`）に1回だけ流す**。選び方（`scripts/shared/e2e-selection.ts`）は
  変えたファイル1件ごとに次の順で決め、1件でも全件なら全件にする（取りこぼすより遅いほうを選ぶ）
  - 文書・単体テスト・E2E から届かない `scripts/` などは選ばない。E2E ファイルはそれ自身、期待値は場面の
    名前を持つ E2E を選ぶ（場面の名前は E2E ファイルの構文木の文字列リテラルとテンプレートの頭から集める。
    `scenario:` に連結や呼び出しなど名前を決められない式を書いたファイルは、どの場面の持ち主にもなる）
  - import は構文木で読む（静的 import・`export … from`・`import("…")`・`require("…")`・
    `new URL("…", import.meta.url)`。`?raw` などのクエリは落として解決する）。式つきの `import()`・`require()`・
    `import.meta.glob`、クエリを落としても解決できない指定、構文エラーのファイルは、そこへ届く根からすべてのファイルに届くとみなす（以下の規則で全件や広い選び方に倒れる）
  - E2E の足場の根（`package.json`・`vitest.e2e.config.ts`・`scripts/dev/build-ui.ts` など）から import で
    届くファイルは全件。E2E ファイルから import で届くファイル（`test/e2e/scenario-run.ts` と、それが読む
    `scenario-open.ts`・`scenario-wait.ts`・`scenario-viewport.ts`、`test/e2e/task-room.ts`・`test/fixture/` など）は、届く元の E2E を選ぶ
  - `src/` は、サーバの入口 `src/cli.ts` から届けば全件（どの E2E もサーバ全体を起こす）。ブラウザだけが
    読むファイルは、見張りの表（`scripts/shared/e2e-watch.ts`）の領域の根から届くかで領域を決め、その領域を
    見ている E2E を選ぶ。どの根からも届かない（アプリや会話の画面の枠）なら全件
  - どれにも当たらないパスは全件。見張りの表に載せる E2E の領域が足りないと取りこぼすが、送る直前の全件で拾う。
    **E2E のファイルを足したら表に足す**（載っていないと単体テストが落ちる）
  - 期待値を撮り直す `pnpm run test:e2e:update` も既定は同じ選び方で、`--full` で全件、ファイルを渡せばそのファイルだけ
- **同じ木で `pnpm run check` を打ち直すと（`--full` も）、前回通った段を1回だけ飛ばし、E2E は前回落ちたファイルだけを流す**
  （控えはリポジトリの根の `.check-record.json`。鍵は作業ツリーの木と段の引数で、飛ばした次の回は流す。`--bail=3` が発火した回は、打ち切られたファイルも「通った」と記録されるので絞らない）
- **ファイル単位の `pnpm run test:e2e <ファイル>` は、組み立てのあとに `tsc --noEmit` を通す**
  （E2E の本体は実ブラウザの中で動くので、型の誤りは実行時に現れず、`tw verify` の型検査まで見つからない。
  実測 3 秒前後〔2026-10-17〕）。全件の印を立てて入る `check` と `test:e2e:update` は、型検査の段が別にある
  （`check`）ので省く
- **`dist/browser/` は E2E の段が自分で組み立てる**（起動は古い成果物でも止まらずに配る〔`docs/architecture/build.md`〕ので、
  組み立てを前提にすると古い画面を確かめて通ってしまう）。`vitest` を直に流したときは E2E の設定の
  `globalSetup`（`test/built-ui-setup.ts`）が、組み立てたときの指紋が `src/browser/`・`src/shared/` の
  いまの指紋と違う（または指紋・組み立てが無い）とテストの前に落とす。黙って組み立て直さず、`pnpm run build` を打つ。**headless shell が無ければ前提不足で落ちる**
  （飛ばすと黙って守らなくなる）
- **ブラウザは E2E の実行全体で1つ、tsukumo は1件ごとに1つ起こす**。後始末は自分の pid だけに `SIGTERM` を
  送り、終わるのを待ってから一時のディレクトリを消す（広いパターンで止めない）。**ブラウザは
  `globalSetup`（`test/e2e-chrome-setup.ts`）が `chromium.launchServer` で1回起こし、`provide` で配った
  `wsEndpoint` に各ファイルが `beforeAll` で `connect` する**。ファイルの終わりは切断だけで、
  Chrome は実行の終わりに `globalSetup` の後始末が kill する（丁寧に閉じると最後のコンテキストを閉じてから
  約 10 秒待つため。kill しても一時のプロファイルは Playwright が消す）。**スクリーンショットは
  期待値と食い違って落ちた回（`failures/` の下）と `E2E_UPDATE=1` のときだけ撮る**
- **起こし方**: fake driver・空きポート・自動オープンなし・**`TSUKUMO_HOME`・`HOME`・cwd は1件ごとの
  一時ディレクトリ**（リポジトリで起こすと Beads の実データと git の履歴が画面に入る。`HOME` には使用状況の
  送信を止めた `bd` の設定だけを置く。タスクの一覧は `bd` を起こさない（「E2E のシナリオの一覧」のタスクの一覧の行）が、
  `bd` を起こしうるほかの機能のために残す）・
  `TZ=Asia/Tokyo`・下の固定の時計。**親の環境から `TSUKUMO_` で始まる変数は外してから渡す**。
  場面が指す手元の画像のように起こす前に cwd へ要るファイルは、`run.open` の `cwdFiles` で渡す（`open` のあとに書くと場面の手と競う）
- **`setTimeout`・`requestAnimationFrame` で束ねる・遅らせる表示を変える計画は、`## やること` の段1「前提の裏取り」に、E2E と撮影の偽の時計が rAF も止めることをどのファイルで確かめたかの1行を入れる**
  （本物のフレームで呼ぶ仕組みは `followFakeClock`。`docs/architecture/testing/e2e-artifact-and-expectation.md`「E2E の成果物と再現」の「時計の固定」）
- **名指しの場面も `opening` も、ページが繋がってから流れ始める**（起こした直後に流すと、繋がる前の
  ぶんが `hello` に畳まれてメッセージの列が揃わない）。**`open` は、`opening` と名指しの場面の予定の
  最初の静かな区切り（次の手まで 500ms 以上空く時点。予定が尽きた時点を含む）までの手が届いてから
  部屋を渡す**（予定は fake driver の `startupSteps` を足場も読む。区切りは予定の時刻だけから決まり、
  走らせる速さに依らない）。そこから先は**場面が流れ終わるのを時間で待たず**、届いたイベントを待つ。長い場面は途中のイベントで止めて撮る。**場面を速く流す口は足さない**（ブラウザ側の
  間合いとの比が変わる）。`afterMs` は場面の始まり（`opening` は開いた時点、名指しの場面は `opening` の最後の手の続きから）からの経過で、前の手からの差ではない。手の並びの順に単調に増え（同じ値は可）、減る場面は読み込みで場面名と手の位置つきで拒まれる。**テストが答えるまで先へ進めたくない場面は、その手に `waitForAnswer: true` を付ける**（積まれた答え待ちがすべて答えられるまで流さず、その手と続く手の `afterMs` は答えが届いた時点からの経過になり、単調の検査もここで数え直す。時刻で流すと答えが遅れた分だけ手が入れ替わる。足場の間合いの検査は、次の手がこの手なら無限大として扱う）。必要な瞬間が遅い場面は、短い場面を疑似セッションに足す（名前に `-quick` を付け、元の場面と同じ手を `afterMs` だけ詰める。**最終まで流して撮るテストだけがこれを使い**、途中で止めて撮る側は元の場面のまま。詰めても、`report` が差し戻される場面は最初の静かな区切りが差し戻される `report` より前に残るようにする）
- **途中のイベントで止めて撮る（`waitForEvent` のあと `settleAndMatch`）ときは、待った手から疑似セッションの
  予定の次の手までの間合いを `scene-schedule.ts` の足場が検査する**（`MIN_NEXT_STEP_GAP_MS` 未満なら落ちる。
  次の手が撮り終える前に届くと messages に1件多く載って食い違うため）。間合いが足りない場面は、名前に
  `-hold` などを付けて最初の静かな区切りで打ち切った版を別に足す（元の場面は書き換えない）
- **起動時の切り替え先の一覧は `hello` に含まれて届くので `sessions-changed` を待たない**；`sessions-changed` を待つのは、場面が一覧を流すときと、起こし直した代が一覧を流し直すときだけ
- `maxWorkers` は所要時間ではなく check の間に手元が重くならないことを優先して決める（値は単体テストの
  `vitest.config.ts` と合わせてコア数に対する比率で決める）。所要時間が延びること自体は受け入れる
- **`pnpm run check` の段の子は、`taskpolicy` があれば `taskpolicy -c utility` で起こし、検証を効率コアへ寄せて
  性能コアを手元の操作に空ける**（`scripts/dev/lib/stage-priority.ts`。clamp も `nice` も段の子孫に受け継がれる）。
  掛けるのは軽い段と単体で、**E2E の段だけは clamp の外の `nice` で起こす**（clamp を掛けた回では
  `conversation-tier` の狭い画面のボトムシートの場面が4回中2回、活動の行が届く前に撮られて落ちたため）。
  `taskpolicy` が無い環境（macOS 以外・`PATH` に無い）では全段を `nice` で起こし、検証は止めない。
  `nice` は同じ QoS の中の順番を下げるだけで、性能コアを取り合う。
  測定（2026-10-17、Apple M4・性能コア 4・効率コア 6、ほかのセッションの負荷あり。`--full` 相当を各2回）:

  | 方式         | 経過（`tw verify`） | E2E の落ち | 手元の固定の CPU 仕事（中央値。検証なしで 3.2s） |
  | ------------ | ------------------- | ---------- | ------------------------------------------------ |
  | `nice`       | 242s・169s          | 0・0       | 9.1s・5.0s                                       |
  | `utility`    | 258s・172s          | 1・0       | 4.0s・3.2s                                       |
  | `background` | 346s・291s          | 0・1       | 3.8s・3.6s                                       |

  `background` は `utility` と手元の空きが同じで経過が長いので、`utility` を選んだ。
  E2E の段だけを外に出したいまの形は、E2E 全件の回数の上限に当たって測れていない
