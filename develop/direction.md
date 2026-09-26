# 未対応の指示メモ（ここに書くと次のセッションが `/plan-tasks` でタスク化する。正典: `task-workflow` の `WORKFLOW.md`）

## ユーザーから

## エージェントのドラフト

- **背景のサブエージェントが呼んだ `report` を、`ReportReview` の新しい事実の判定から外す**（振り返り: T-721）
  - 根拠: `report` の handler は呼び出し元を見分けられず、メイン側に新しい事実が無いと、サブエージェントの `report` にも `REPORT_NOTHING_NEW_REJECTION_TEXT`（「何も書かずに終えてよい」）が返る。画面は変わらないが、委譲先の最終報告が短くなる恐れがある（委譲先の報告で指摘、未実測）
  - 出し先: タスク（handler で呼び出し元を判別できるかを確かめ、できればサブエージェントの呼び出しは判定しない。できなければ `## 注意` に残す）
- **同梱パックの `persona.md` が指す正典のパスを `src/server/report/core/report-notation.ts` に直す**（振り返り: T-721）
  - 根拠: 「締めのセリフの言い方」などが `src/server/core/report-notation.ts` と書いているが、実物は `src/server/report/core/` の下（委譲先の報告で指摘）
  - 出し先: タスク（同梱パックの `persona.md` のパスを直す。ホーム側 `~/.tsukumo/characters/` は人が直す）
- **`/next-task` の委譲の指示に「`git stash` を使わない（stash は作業ツリーの間で共有され、別のセッションの退避を取り違える）」を足す**（振り返り: T-697）
  - 根拠: T-697 のサブエージェントが、削除の前後で迷子の参照を見比べるために `git stash` を4回打った。今回は置き去りが無かったが、並行する tsukumo-N の作業ツリーが同じ stash の山を使っている。CLAUDE.md・`docs/workflow.md`・`next-task` の手順5のどれにも stash の決まりが無い
  - 出し先: `~/.claude/skills/next-task/SKILL.md` の手順5の箇条（委譲先に渡す禁止事項の並び）。前後の比べ方は「一時コミットか `git show HEAD:<path>` で見る」と添える
