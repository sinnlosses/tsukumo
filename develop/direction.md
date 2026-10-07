# 未対応の指示メモ（ここに書くと次のセッションが `/plan-tasks` でタスク化する。エージェントのドラフトは `develop/draft/` に1件1ファイル。正典: `task-workflow` の `WORKFLOW.md`）

## ユーザーから

- 送る前の検証（`pnpm run check --full`。`tw ship` が付け替えたときに打つ）で、自分の差分（main との差）が文書だけなら E2E と単体テストの全件を流さず、文書の検査だけにしたい。`scripts/check.ts` は「タスク登録だけの変更は --full でも format:check と文書の検査だけ」をもう持つので、その判定を文書だけの差分へ広げる。付け替えで入った他人のコードはその人の送り出しで検証済み。GH-366（文書4本だけ）の受け入れ11分17秒のうち、付け替えのあとの `check --full` の全件 E2E が約2分を占めた（2026-10-07 実測。tw の flow の done 23:28:11 → ship 23:30:34）
- usage-review の「タスクにする」は、`tasks` の設定が無いとタスク運用なしとして扱う（`src/server/usage-review/core/usage-review-tool.ts`）。一覧は設定が無くても Beads を試し読みするので食い違う。設定が無くても `.beads` が読めればタスク運用ありとして扱い、`docs/requirements.md` の使い方の見直しの項（「起動先がタスク運用なし」）も合わせて直す
