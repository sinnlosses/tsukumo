# 未対応の指示メモ（ここに書くと次のセッションが `/plan-tasks` でタスク化する。エージェントのドラフトは `develop/draft/` に1件1ファイル。正典: `task-workflow` の `WORKFLOW.md`）

## ユーザーから

- `/loop /next-task` は文脈がしきい値を超えても止めずに回し続けたい。tsukumo の外（`mcp__tsukumo__` の送り直しのツールが無いとき）で `context_size.py` が `OVER` を返したら、`/loop` を止めずに次の1件へ進み、文脈は Claude Code の自動の要約（コンパクト）に任せる（claude-skills の `next-task` の続行判断の表）。tsukumo の中で `/clear` して送り直す形は今どおり
