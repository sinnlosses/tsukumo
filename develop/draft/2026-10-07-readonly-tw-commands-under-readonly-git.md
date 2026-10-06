# 読むだけの tw コマンド（verify-check・plan-check・status など）を、読み取り専用の .git の下でまとめて打つ自己テストを claude-skills に足す（振り返り: GH-423）

- 札: 赤 実装の誤り（5回目）
- 根: read-only-command-writes-git
- 根拠: GH-423 の段3の返却で、読むだけと定めた `verify-check` が、衝突の判定（`fold.folds_cleanly`）のときに `worktree_tree` の既定・`commit-tree`・`merge-tree --write-tree` で本物の `.git` に object を書いていた。委譲先の `tw verify` は通り、自己テストも書ける `.git` の場合しか見ていなかった。受け入れでメインと新しい目のレビューが見つけて、1往復差し戻した。`readonly_git` の手立ては自己テストにあったが、使っていたのは個々のテストだけで、読むだけのコマンドの一覧には掛かっていなかった
- 出し先: claude-skills の `skills/task-workflow/scripts/selftest_task.py` に、WORKFLOW.md「`tw` コマンドの参照」で「読むだけ」と書いたサブコマンドを、主ブランチが進んだ・衝突する・作業がある状態で `readonly_git` の下で打つテストを1本足すタスク。落ちず、`.git/objects` も増えないことを縛る
