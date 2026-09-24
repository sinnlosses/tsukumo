# 未対応の指示メモ（ここに書くと次のセッションが `/plan-tasks` でタスク化する。正典: `task-workflow` の `WORKFLOW.md`）

## ユーザーから

- 画面から effort を切り替えたい（例: Opus 5.5 の medium と high）。いまは `DEFAULT_EFFORT = "medium"` を起動時に渡すだけで、`docs/requirements.md` 4.1 に「effort を画面の要素にしない」と決めてある。根拠は「effort は外から観測できない」（2026-09-12 の実測。`docs/history/decision.md` 220行目）だが、SDK 0.3.280 の型には `applyFlagSettings({ effortLevel })`（途中で変える）・制御要求 `get_settings` の `applied.effort`（実際に送る値を読む）・hook の入力の `effort` がある。**まず実機でこの2つ（途中で変えて効くか、`query()` から読めるか）を確かめ**、通れば 4.1 の決定を覆して帯に切り替えの口を置く（モデルのドロップダウンに混ぜるか、別に置くかも決める）。既定を覚える歯車（`~/.tsukumo/state.json`）に effort も載せるかも併せて決める

## エージェントのドラフト

- **`src/` と `test/` のコメント・テスト名に新しくタスク番号（`develop/task/T-xxx.md` のパスを含む）が入ったら落とす検査を足す**（振り返り: T-553）
  - 根拠: T-553 のサブエージェントが CLAUDE.md の禁止を読んだうえで `develop/task/T-553.md` をコメントに4か所書き、`bun run check` は通った。受け入れでメインが消した。T-552 は既存の番号を消すだけで、再発を止める検査は持たない
  - 出し先: T-552 の完了条件に「再発を落とすテスト（`test/section-reference.test.ts` と同じ形で、データとしての `T-001` と `T-225` の例外は除く）」を足すか、T-552 のあとに続く1タスクにする
