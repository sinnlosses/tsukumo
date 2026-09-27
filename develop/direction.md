# 未対応の指示メモ（ここに書くと次のセッションが `/plan-tasks` でタスク化する。エージェントのドラフトは `develop/draft/` に1件1ファイル。正典: `task-workflow` の `WORKFLOW.md`）

## ユーザーから

## エージェントのドラフト

- **`report` の `inputSchema` を縮める（`.readonly()` が出す `readOnly: true` と、8回繰り返す `fold` の説明）**（振り返り: T-705）
  - 根拠: T-705 で引数を `sections` に替えたら、実物の `tools/list` で `inputSchema` が 1198 → 5086 字、文面の縮み（−1565）と差し引きで +2323 字になり、提案書 9 章の見込み（+1〜2 千字）を超えた。委譲先の報告で、押し上げている箇所として上の2つが挙がった
  - 出し先: タスク（schema を組む側で `readOnly` を出さない・`fold` の説明を1か所に寄せ、`docs/display.md` 4.2 の測った値の表を取り直す）
- **委譲の依頼文に、新しく書くコメントの禁止事項（呼ぶ側・前例のファイル名・正典の要約と参照を並べない）を1行で渡す**（振り返り: T-706）
  - 根拠: T-706 の委譲先は新規ファイル3つの冒頭と型・関数の JSDoc に「呼ぶのは `session-manager`」「`ContextUsageLog` と同じ形」「`docs/coding-standards.md`「エラーハンドリング」」のような呼ぶ側・前例・規約の参照を並べ、受け入れでメインが7ファイルぶん刈り込んだ（`report-usage.ts` の冒頭9行 → 2行など）。CLAUDE.md の規約にある条だが、委譲先は前例の `context-usage-log.ts` の長いコメントを手本に写していた
  - 出し先: `next-task` 手順5の渡すものの並び（「コメントは CLAUDE.md のコメントの条に従い、前例のファイルのコメントの量を手本にしない」）。前例側の長いコメントは T-741〜T-743 の見直しで減る
- **`node scripts/capture-catalog.ts` が `src/shared/frame.ts:95` の初期化順（`Cannot access 'stampedEventSchema' before initialization`）で落ちるのを直す**（振り返り: T-684）
  - 根拠: T-684 の委譲先が目視の撮影で `node` から打つと落ち、`bun` で打って回避した。T-682 で scripts を Node へ移したあとも、目視の手順の口が Node では動いていない。T-684 は `frame.ts` に触れていない
  - 出し先: タスク（循環 import か宣言順を当て、`node` で `capture-catalog.ts --only notation` が撮れることを完了条件にする）
- **`bun run dev` の HMR で直したぶんが `dist/browser/` に乗らず、次の `tsukumo` の起動で「ソースのほうが新しい」と出る退行を扱う**（振り返り: T-685）
  - 根拠: T-685 で `ui-rebuild.ts` の見張り（保存のたびに `dist/browser/` へ組み立て直していた）を Vite の開発サーバに替えた。開発サーバはメモリで配るので、開発中に直したものを次の起動へ乗せるには `bun run build` を手で打つ必要が出た
  - 出し先: タスク（開発サーバを止めるときか保存が静まったときに `buildUiBundle` を起こすか、手で打つ運用のまま `docs/design.md` 11章に書くかを決める）
- **`docs/design.md` 冒頭の役割の宣言に、残した3つ（10章のテストの段取り・11章のビルドの仕組み・2章の `components/ui/` の variant の作法）が入っていない**（振り返り: T-698）
  - 根拠: T-698 の通読で見つかった。3つとも残すと決まっているか多数のコードが引くので中身は残し、宣言（2026-09-26 ユーザー承認）は書き換えなかった
  - 出し先: 判断の要るタスク（hold）。宣言を広げるか、ui の作法を `docs/coding-standards.md` へ移すかを決める
- **正典と実物のずれ2件（`src/shared/utils/` の import を見る検査が無い・`src/shared/session-state.ts` の tasks の「不明」表示が指す `docs/design.md` 4.1 に記述が無い）**（振り返り: T-698）
  - 根拠: T-698 の通読で見つかった。2章は「他の層に `utils/` を作るときも同じ検査を足す」と定めるが `src/shared/utils/optional-string.ts` に検査が無い。4.1 のずれは T-698 の前から
  - 出し先: タスク（検査を足し、コメントの指し先を正典の実在する句に張り替える）
- **`test/server/view-server/adapter/bundle.test.ts` が実物の `dist/browser/` を書き換え、並んで走る `test/cli.test.ts` の起動が成果物の対を読めずに落ちる揺れを直す**（振り返り: T-760）
  - 根拠: T-760 の委譲先が `pnpm run check` を数回回すうちに、`cli.test.ts` の1件がこの組み合わせで落ちた（単独では通る）。`bundle.test.ts` のコメントに副作用として書かれているが、それを扱うタスクは無い。Vitest に移って単体テストのファイルが並列に走るようになってから当たりやすくなっている見込み（確かめていない）
  - 出し先: タスク（`buildUiBundle` の出し先を引数で渡して一時ディレクトリに書くか、2つのファイルを直列にする。`pnpm run test` を10回回して落ちないことを完了条件にする）
- **`test/architecture.test.ts`「components/ui/ の部品の className」が単独でも 4.6 秒かかり、負荷が高いと 5 秒の締め切りで落ちる**（振り返り: T-724）
  - 根拠: T-724 の受け入れで `bun run check` を6回回し、負荷 35〜68 のもとでこの1件が4回タイムアウトした（単独では通る）。ファイル×部品ごとに `ownExternalProperties` と CSS を読み直している
  - 出し先: タスク（部品の property と CSS の読み取りを1回にまとめて速くする。締め切りを延ばすだけにしない）
- **`components/ui/` の外に残る `<button>`（約26件）を扱う後続を切る。最初の委譲先は `docs/design.md` 2章の「`Button` にしない」ものまで既存の variant に寄せ、見た目を変えていた**（振り返り: T-724）
  - 根拠: T-724 は15箇所で閉じた（9箇所を置き換え、6箇所は同じ節が除くもの）。残りは `ref`・`aria-expanded`/`aria-controls`・`disabled` の専用の見た目・`data-*`・`role` が要るもので、`Button` の props を広げるかどうかの判断が要る。1回目の委譲は受け入れで見た目の差が見つかり、ユーザー決定で opus でやり直した
  - 出し先: 判断の要るタスク（hold。`Button` に受け口を足すか `<button>` のまま残すかを種類ごとに決める）。置き換えのタスクの本文には「元の見た目を変えない」「2章の除外に当たるものは残す」を最初から書く
- **`test/server/achievement/adapter/main-history.test.ts` が `bun run check` の中でときどき `EPIPE`（`child.stdin.end` への書き込み）を出して落ちるのを直す**（振り返り: T-750）
  - 根拠: T-750 の受け入れで、2718 件すべて pass のまま「main ブランチが無いリポジトリでは「不明」」の直後に未処理の `EPIPE` が1件出て `bun run check` が落ち、打ち直すと通った。T-750 は `src/browser` だけを触っている。子プロセスが stdin を読む前に終わる経路で書き込みの失敗を拾っていないと見られる。既存の揺れのタスク（T-671・T-739）はこのファイルを扱っていない
  - 出し先: タスク（stdin の `error` を拾うか書き込みを待つ形にし、`bun run test` を続けて10回流して出ないことを完了条件にする）
- **`test/architecture.test.ts` が `pnpm run test` の並列実行で既定の5秒を超えて落ちることがある**（振り返り: T-751）
  - 根拠: T-750・T-751 の委譲先がどちらも、差分と無関係に `architecture.test.ts` の時間切れ（と character まわりのテストの競合）で1回目の検証を落とし、単体か `--no-file-parallelism` で流し直して通した。T-671 は `character-edit.test.tsx` の揺れだけを扱い、このファイルの時間切れを扱うタスクは無い
  - 出し先: タスク（ソースを全件読む検査の重さを測り、読み込みを1回にまとめるか時間の上限をこのファイルだけ上げ、`pnpm run test` を続けて10回流して落ちないことを完了条件にする）
- **`test/cli.test.ts` と `test/server/view-server/adapter/bundle.test.ts` が並列実行で `dist/browser/` を取り合い、`task ship` の検証がときどき落ちる**（振り返り: T-751）
  - 根拠: T-750・T-751 の `task ship` がどちらも `cli.test.ts` の「ブラウザ側の成果物を読めない」で VERIFY_FAILED になり、直前の同じ作業ツリーでの `pnpm run check` は通っていた。`bundle.test.ts` は `buildUiBundle()` で本物の `dist/browser/` を出し直し、`vite.config.ts` の `emptyOutDir: true` で一度空にするので、その間に `cli.test.ts` が起動すると成果物が無く見える
  - 出し先: タスク（`bundle.test.ts` の組み立てを一時ディレクトリへ向けるか、`dist/browser/` を読むテストを同じファイルに寄せて並列から外し、`pnpm run test` を続けて10回流して落ちないことを完了条件にする）

- **参照の検査が、パスで行が終わり次の行が「 で始まる参照を拾えないのを直す**（振り返り: T-768）
  - 根拠: T-768 で旧 `docs/architecture.md` の句を引く参照のうち5件がこの形で、`section-reference.ts` もスクリプトの洗い出しも拾えず、`git grep` で手で見つけた。後段（T-769〜T-771）は数百件を張り替えるので、同じ漏れが迷子のまま残りうる
  - 出し先: タスク（`REFERENCE_HEAD` を行をまたいで照らす形にし、T-769 の前に入れる）
- **委譲の前に、作業ツリーが立ち上がっているか（`node_modules` と `dist/browser/`）をメインが確かめる**（振り返り: T-671）
  - 根拠: T-671 の委譲先は、作業ツリーに `vitest` が入っておらず `dist/browser/` も無いのを見つけ、CLAUDE.md が「人がやる」とする `pnpm install` と `pnpm run build` を自分で打って進めた。bun から pnpm へ移したあと、古い作業ツリーでは同じ状態が他でも起き得る。T-759 はホームや共有の環境を扱い、作業ツリーの立ち上げは扱っていない
  - 出し先: `next-task` 手順4と5の間（`node_modules/.bin/vitest` と `dist/browser/` が無ければ委譲せず、人に立ち上げを頼んで `task release` する）。`docs/workflow.md` の上乗せでもよい
- **Vitest で単体テストのファイルが並列に走るようになってから、`pnpm run check` の揺れが増えたのをまとめて扱う**（振り返り: T-686）
  - 根拠: T-686 の受け入れと送り出しで、文書とコメントしか変えていないのに `check` が3回落ちた。`test/architecture.test.ts` の className の検査が既定の 5000ms で時間切れ・`test/cli.test.ts` が `dist/browser/` の対を読めない（上の `bundle.test.ts` の項）・`main-history.test.ts` の実行中に unhandled error。どれも単独では通る
  - 出し先: タスク（重い検査の `testTimeout` を個別に伸ばすか、実物のファイルやプロセスに触るファイルを `poolOptions` などで直列にする。`pnpm run test` を10回回して落ちないことを完了条件にする）
- **`task ship` が `VERIFY_FAILED` で止まったあと打ち直すと、付け替え済みのため `verify=skipped` のまま送られる**（振り返り: T-686）
  - 根拠: T-686 で1回目の `ship` が付け替え後の検証で落ち、2回目は `rebased=no verify=skipped` で `SHIPPED` になった。送ったあとに手で `check` を回して通ることは確かめたが、検証に落ちた中身がそのまま main に入りうる
  - 出し先: `task-workflow` の `task.py`（`VERIFY_FAILED` の印を残し、次の `ship` で付け替えが無くても検証を走らせる）
- **T-764 の完了条件に、本物の GitHub・bd の設定で確かめていない3点を足す**（振り返り: T-762）
  - 根拠: T-762 は偽の `gh`・`bd github sync` でしか試していない。(1) actor（作業ツリー名）が Issue の assignee に送られて弾かれないか、(2) `gh project item-edit` と Project の JSON の形が偽物と合っているか（形は記憶から作った）、(3) 自己テストで `bd init --stealth` を並列に回した時間帯に `~/.config/bd/config.yaml` の `metrics.disabled` が `false` に変わっていた（戻し済み。`bd init` を1本ずつ打つことは WORKFLOW.md に書いた）
  - 出し先: T-764 の `## 完了条件`（移したあと `bd github sync --push-only` で Issue 1件と Status 欄が期待どおりになること、`bd init` のあと `bd metrics` が OFF のままであることを確かめる）
