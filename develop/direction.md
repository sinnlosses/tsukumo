# 未対応の指示メモ（ここに書くと次のセッションが `/plan-tasks` でタスク化する。正典: `task-workflow` の `WORKFLOW.md`）

## ユーザーから

## エージェントのドラフト

- **`components/page/` の下へファイルを移すタスクは、移し先をページの形（`docs/design.md` 2章「ページの形」の
  `domain/`・`hooks/`・`components/<部品>/`）に割った形で本文に書く。** T-693 は「6ファイルを
  `conversation-layout/` へ移す」とだけ書いたため、`split.ts` と `layout-resizer.tsx` を直下に置いて
  `test/architecture.test.ts`「components/page/ の形」に落とされ、下ろし直しで同じファイルを6回直した。
  置き先は `docs/workflow.md`「タスクを書くとき・受け入れるとき」の1項（振り返り: T-693）
