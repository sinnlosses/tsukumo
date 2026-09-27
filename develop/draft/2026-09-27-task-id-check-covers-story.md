# タスク番号の検査の範囲に `story/` を足す（振り返り: T-745）

- 札: 黄 制約違反（1回目）
- 根拠: 委譲先が `story/` の見本のコメントに `T-745` を2箇所書き、`pnpm run check` は通った。`test/task-id.test.ts` の検査が `src/`・`test/`・`scripts/`・`docs/` だけを見ていて `story/` を見ない。受け入れでメインが見つけて消した
- 出し先: `test/task-id.test.ts` の対象に `story/` を足すタスク
