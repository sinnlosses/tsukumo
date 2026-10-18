# タスク運用: loopable の判定

入口は `docs/workflow.md`（このリポジトリでのタスク運用の上乗せ）。

責務: `loopable` を `"Y"` にしてよい範囲と、tsukumo を起こして確かめるときの作法・hook を持つ。
読む時: `loopable` を決める、tsukumo を起こして目視で確かめるとき。
直す時: `loopable` の判定や、起こすときの作法・hook を変えたとき。

## 節の索引

| 節                                      | 中身 |
| --------------------------------------- | ---- |
| ## `loopable` の判定（2026-09-15 決定） | 判定 |

## `loopable` の判定（2026-09-15 決定）

共通版は `"N"` の理由に「**対話的な検証が必要**: 実機での目視確認や、`checkCommand` で
判定できない受け入れ」を挙げている。**このリポジトリでは「実機での目視確認が要る」だけを理由に
`"N"` にしない。** tsukumo は自分の画面を自分で開いて確かめられるので、そこは「対話的」ではない。

**tsukumo 自身で確かめられること（＝ `"Y"` でよい）**:

| 道具                                                                                              | 何ができるか                                                                                                |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `TSUKUMO_DRIVER=fake` ＋ `test/fixture/fake-session.json`                                         | **`claude` を起こさずに**画面全体を出す（架空の疑似セッション。API を使わない）                             |
| `node scripts/capture/capture-view.ts <URL> --measure <selector>`                                 | 画像に撮り、指定した要素の位置と大きさを**数値で**出す                                                      |
| `node scripts/capture/capture-view.ts --scene <場面> --type <selector> <文字> --click <selector>` | 打つ・押す・触れる・hash を書くを並べた順に当ててから撮る（当たらなければ失敗）                             |
| `playwright-core`（devDependency）＋ headless shell                                               | ページを操作する（キーを打つ、タブを押す、`<select>` を変える）・`getComputedStyle` や `scrollWidth` を読む |
| 撮った画像を読む                                                                                  | **絵として見て事実を確かめる**（どの要素が出ているか、切れていないか、絵柄が入れ替わったか）                |

**`"N"` にするのは、人にしか決められないものが残るときだけ**:

- **見え方の好み**（色・間合い・強弱・どの案が気持ちよいか）
- **使ってみた感想が完了条件そのもの**になっているもの
- **複数案のどれを採るかをユーザーが決める**もの
- 元に戻せない操作・外部への反映・グローバル設定の書き換え

**判定の書き方**: `## 注意` の最後に理由を1行で書く。「目視確認が要るため `"N"`」は**理由に
ならない**（この節が否定した形）。書くなら「**どの判断を人に委ねるのか**」を書く。

**起こすときの作法**: `TSUKUMO_VIEW_PORT` を既定（7327）以外に変え、**止めるのは
`node scripts/runtime/stop.ts --port <ポート>`** にする（一覧は引数なし。名指しした1つにだけ
SIGTERM が行く）。`pkill` / `killall` で名前やパターンから止めようとすると、
**PreToolUse hook（`.claude/settings.json` → `scripts/hook/deny-broad-kill.ts`）が実行される前に
拒否する**——並べて動かした tsukumo はどれも `node src/cli.ts` に見えるので、
パターンでは利用者が使っている本体と区別できない。狙う語によらず、`bash -c`・`env`・`xargs`・`nice`・
`timeout`・`pnpm exec`・パス付き（`/usr/bin/pkill`）越しの `pkill` / `killall` と、
`kill $(pgrep …)`・`ps … | xargs kill` のように名前から引いた pid を渡す `kill`、全プロセスやプロセスグループを指す負の pid（`kill -9 -1`）も拒否する
（待受ポートで引いた `kill $(lsof -ti tcp:7398 -sTCP:LISTEN)` と pid の名指しは通す）。まれな形は直していない: 入れ子の `kill $(echo $(pgrep node))` と `xargs kill $(pgrep node)` は見落とし、`{ lsof …; } | xargs kill`・`cat <(lsof …) | xargs kill`・`echo $(lsof …) | xargs kill` は拒みすぎ、`env -S x pkill` は意味の上で誤って拒む。どれもまれな書き方で、直す費用が見合わない。判定を置き換えるときは、同じ入力を旧の実装に通した表（`test/scripts/hook/broad-kill.test.ts`・`background-verify.test.ts` の「旧実装が拒んでいた形」）を残す。`HOME` を一時ディレクトリに差し替えれば、
`~/.tsukumo/` に触るタスクでも利用者の設定を汚さない。**起動時に作られるもの（`speak` の
enum・キャラクターパックの読み込み）は起こし直さないと変わらない。** 起動とキャラクターの切り替えで起こすセッションは常に新規で、
前のセッションは切り替え画面から選んだとき（とモードを戻したとき）だけ戻る。

同じ形で、作業ツリーの中のファイルへ書き込む Bash のコマンド（`sed -i`・`perl -i`、
リダイレクトと `tee`、作業ツリーの外からの `cp` / `mv`、Python・node のコードでの書き込み）も
PreToolUse hook（`scripts/hook/deny-sed-in-place.ts`）が拒否する。ファイルの書き換えは Edit / Write で行う。
`tw edit --body-file` に渡す下書きは、作業ツリーの外のパス（`/tmp/<名前>/plan.md`）に Write で書いて
`--body-file` でそのパスを渡すか、`--body-file -` へ heredoc を渡す。作業ツリーの中のパスには書かない。
`pnpm`・`git`・作業ツリーの中のスクリプトのように、ツールの中で書くものは止めない。
hook は書き込みの形を事前に列挙して拒む。Bash の前後の作業ツリーの差を見る事後の検査は、
同じ作業ツリーで並行する書き手（並列の段・背景のコマンド）の変更と区別できないので置かない。

委譲先（サブエージェント）が `tw verify`（検査の全段。3〜4分）を `run_in_background: true` で
打つと PreToolUse hook（`scripts/hook/deny-background-verify.ts`）が拒否し、前景で `timeout` 引数
（最大 600000）を付けて打つよう案内する。`nice`・`timeout`・`env`・`pnpm exec`・`bash -c`・パス付きの
`tw` 越しの `tw verify` も同じ。メインの呼び出し（`agent_id` が無い）は対象にしない。

段の確かめの単体は `pnpm run test <ファイル or ディレクトリ>` で流す（`pnpm exec vitest` を直に打たない。規約のテストが一緒に走る）。`test/architecture` は `tw step` が打つ `step_check` が段の返却の前に自動で流すので、置き場所や export の違反は段の終わりで落ちる（手で足さない）。

委譲先が E2E を流す呼び出しは、着手中の1件につき **6回まで**で、7回目は
E2E の入口（`scripts/dev/e2e.ts`）が vitest を起こさずに終了コード 2 で止める（検証は通常1〜3回で、残りは揺らぎの
確認と自分の検証の余裕）。コマンドの書き方では分類せず、実際に走る側で数える。
数えるのは `TSUKUMO_E2E_FULL=1` の付いた `pnpm run test:e2e` で、`pnpm run check` の E2E の段
（`--full` も、変えたファイルから選んだ分も。`tw verify` 越しを含む）と、ファイルを名指さない
`pnpm run test:e2e:update` がこれに当たる。組み立てが通ってから1回と数えるので、
起動に失敗した呼び出しと E2E を流さない `check`（文書だけの変更など）は数えない。
E2E のファイル単位の実行（`pnpm run test:e2e test/e2e/<ファイル>.test.ts`）は数えない。
`e2e.ts` を経ずにテストのファイルを名指さずに起こした vitest（`pnpm exec vitest run --config vitest.e2e.config.ts` など）は、
委譲先の Bash の中では E2E の設定の globalSetup（`test/e2e-entry-setup.ts`）が止める。
ファイルを名指した直の起動（`npx vitest run --config vitest.e2e.config.ts test/e2e/<シナリオ>.test.ts -t '<it>'`）は数えず、止めない。

数はその作業ツリー固有の git dir の `e2e-full-runs` に、開いている着手の印の `id:birthtimeMs` を鍵にして置く
（作業ツリーをまたいで混ざらない）。着手の印は tw と同じ順（`.tw/local/task-open-claims/` →
`.tw/` 直下 → git dir）で探し、無ければ数えない。**着手し直す（印が消えて作り直される）と0に戻る。**
委譲先の呼び出しかどうかは hook（`scripts/hook/mark-subagent-bash.ts`）が渡す。
入力に `agent_id` がある Bash の PreToolUse で git dir の `subagent-bash/<tool_use_id>` に印を置き、
PostToolUse・PostToolUseFailure で消す（背景の呼び出しは消さない）。10分より古い印は無いものとみなし、
印が1つも無ければ数えない（メインの呼び出しは対象にしない）。この印には2つの限界がある。
印は呼び出し元を区別しないので、委譲先の Bash と同時に走るメインの実行も数える。
PreToolUse を別の hook が拒んだときや許可が下りなかったときは Post が来ず、印が10分残る。

hook が拒むたびに、共有の git dir（`git rev-parse --git-common-dir`）の `hook-denials/<年-月>.jsonl` へ
時刻・hook の名前・規則のキー・呼び出し元（`main` / `subagent`）の1行を足す。
コマンドの全文・パスは入れない。書き込みに失敗しても hook の判定は変わらない。
`node scripts/hook/hook-denial-tally.ts [--days N]`（既定30）が、`.claude/settings.json` に
登録された hook を全部（0件も）規則のキーごとの回数で出し、各行に `（main n / subagent n / 不明 n）`
の内訳を添える（呼び手の欄が無い旧い行は `不明`。記録にあって登録に無い名前、たとえば tw の関門は
`（未登録）` を付けて続ける）。

**自分が直したコードを画面で確かめるときは、直した作業ツリーで起こす**（tsukumo は起こした
ディレクトリでそのまま動く。グローバルの `tsukumo` も、作業ツリーの中で打てばその作業ツリーの
`bin/tsukumo` へ委ねる）。ブラウザ側を直したなら、起こす前に `pnpm run build` を1回打つ
（成果物は作業ツリーごとに別）。
