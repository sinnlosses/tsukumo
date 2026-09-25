# 未対応の指示メモ（ここに書くと次のセッションが `/plan-tasks` でタスク化する。正典: `task-workflow` の `WORKFLOW.md`）

## ユーザーから

## エージェントのドラフト

- **`test-audit` のキャンペーンで消したテストの跡に「どこへ移したか」のコメントを残さない、と書く**（振り返り: T-620）
  - 根拠: T-620 で `session-socket.test.ts` の2件を消した跡に、keeper の在りかを説明する6行のコメントが残り、受け入れでメインが外した（コメントは今の制約だけを書く規約。keeper は報告と `## 結果` に置けば足りる）
  - 出し先: `~/.claude/skills/test-audit/CAMPAIGN.md` の切り替えの段（C/D を編集する段）に1行
- **日記を書く段（`DiaryStage`）が戻らないことを、畳み込みで守るようにする**（振り返り: T-622）
  - 根拠: T-622 の監査で、`src/shared/session-state.ts` の `withDiaryStage` が `writing` 中ならどの段にも上書きすると分かった。コメントと `docs/design.md` は「段は戻らない」としている。いまは戻す向きの `diary-stage` イベントが来ないので害は無い
  - 出し先: `withDiaryStage` で段の順を比べて、後ろの段への移動だけを受け付けるタスク（テストを1件添える）
