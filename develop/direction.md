# 未対応の指示メモ（ここに書くと次のセッションが `/plan-tasks` でタスク化する。正典: `task-workflow` の `WORKFLOW.md`）

## ユーザーから

## エージェントのドラフト

- **背景のサブエージェントが呼んだ `report` を、`ReportReview` の新しい事実の判定から外す**（振り返り: T-721）
  - 根拠: `report` の handler は呼び出し元を見分けられず、メイン側に新しい事実が無いと、サブエージェントの `report` にも `REPORT_NOTHING_NEW_REJECTION_TEXT`（「何も書かずに終えてよい」）が返る。画面は変わらないが、委譲先の最終報告が短くなる恐れがある（委譲先の報告で指摘、未実測）
  - 出し先: タスク（handler で呼び出し元を判別できるかを確かめ、できればサブエージェントの呼び出しは判定しない。できなければ `## 注意` に残す）
- **同梱パックの `persona.md` が指す正典のパスを `src/server/report/core/report-notation.ts` に直す**（振り返り: T-721）
  - 根拠: 「締めのセリフの言い方」などが `src/server/core/report-notation.ts` と書いているが、実物は `src/server/report/core/` の下（委譲先の報告で指摘）
  - 出し先: タスク（同梱パックの `persona.md` のパスを直す。ホーム側 `~/.tsukumo/characters/` は人が直す）
