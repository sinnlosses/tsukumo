# 置き場を切り替えるタスクは、消し終えた状態で検証コマンドを打つ（振り返り: T-763）

- 札: 黄 実装の誤り（1回目）
- 根拠: T-764 は `develop/task/` の最後の1件（T-764.md）を残したまま `pnpm run check --full` を打った。その1件は完了の記録を先にコミットするために残していて、消したのは検証のあと。そのため、ディレクトリが無いと `test/task-id.test.ts` が ENOENT で落ちることを見逃したまま main へ送った（送り出しは `verify=skipped`）。T-763 の委譲先が HEAD で落ちるのに気づき、`scripts/lib/task-id-repository.ts` を直した
- 出し先: task-workflow の WORKFLOW.md「旧形式からの移行」か「Beads 方式」の切り替えの手順に、「`develop/task/` を消すコミットは、消したあとの木で検証コマンドを打ってから送る」の1行を足す
