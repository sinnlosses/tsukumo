# `tw edit` に依存を足す・外す口を足す（振り返り: GH-232）

- 札: 黄 道具（15回目）
- 根拠: GH-232 の完了条件「後段のタスクの本文を設計に合わせて直す」で、申し送りの依存の追加8件（GH-234←237・238 など）を台帳に入れる口が `tw edit` に無く、本文の `## 注意` に1行書くだけになった。台帳の依存が増えないので、`tw status` の BLOCKED に出ず、別のセッションの `/next-task` は依存を無視して着手できる
- 出し先: claude-skills の `task-workflow`（`tw edit`）に `--add-deps` / `--remove-deps` を足し（Beads 方式は `bd dep add`、ファイル方式は front matter の `dependencies`）、循環と存在しない ID を拒む自己テストを付ける
