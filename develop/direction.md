# 未対応の指示メモ（ここに書くと次のセッションが `/plan-tasks` でタスク化する。正典: `task-workflow` の `WORKFLOW.md`）

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
- **`test/server/achievement/adapter/main-history.test.ts` が `bun run check` の中でときどき `EPIPE`（`child.stdin.end` への書き込み）を出して落ちるのを直す**（振り返り: T-750）
  - 根拠: T-750 の受け入れで、2718 件すべて pass のまま「main ブランチが無いリポジトリでは「不明」」の直後に未処理の `EPIPE` が1件出て `bun run check` が落ち、打ち直すと通った。T-750 は `src/browser` だけを触っている。子プロセスが stdin を読む前に終わる経路で書き込みの失敗を拾っていないと見られる。既存の揺れのタスク（T-671・T-739）はこのファイルを扱っていない
  - 出し先: タスク（stdin の `error` を拾うか書き込みを待つ形にし、`bun run test` を続けて10回流して出ないことを完了条件にする）
- **`test/architecture.test.ts` が `pnpm run test` の並列実行で既定の5秒を超えて落ちることがある**（振り返り: T-751）
  - 根拠: T-750・T-751 の委譲先がどちらも、差分と無関係に `architecture.test.ts` の時間切れ（と character まわりのテストの競合）で1回目の検証を落とし、単体か `--no-file-parallelism` で流し直して通した。T-671 は `character-edit.test.tsx` の揺れだけを扱い、このファイルの時間切れを扱うタスクは無い
  - 出し先: タスク（ソースを全件読む検査の重さを測り、読み込みを1回にまとめるか時間の上限をこのファイルだけ上げ、`pnpm run test` を続けて10回流して落ちないことを完了条件にする）
- **`test/cli.test.ts` と `test/server/view-server/adapter/bundle.test.ts` が並列実行で `dist/browser/` を取り合い、`task ship` の検証がときどき落ちる**（振り返り: T-751）
  - 根拠: T-750・T-751 の `task ship` がどちらも `cli.test.ts` の「ブラウザ側の成果物を読めない」で VERIFY_FAILED になり、直前の同じ作業ツリーでの `pnpm run check` は通っていた。`bundle.test.ts` は `buildUiBundle()` で本物の `dist/browser/` を出し直し、`vite.config.ts` の `emptyOutDir: true` で一度空にするので、その間に `cli.test.ts` が起動すると成果物が無く見える
  - 出し先: タスク（`bundle.test.ts` の組み立てを一時ディレクトリへ向けるか、`dist/browser/` を読むテストを同じファイルに寄せて並列から外し、`pnpm run test` を続けて10回流して落ちないことを完了条件にする）
