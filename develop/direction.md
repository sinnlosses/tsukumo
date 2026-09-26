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
- **E2E「許可のモーダル」の並びの揺れを、競う相手を待ってから押す形で直す**（振り返り: T-672）
  - 根拠: `test/e2e/permission-answer.test.ts` が `bun run check` の中でときどき `toEqual` で落ちる。許可を押したときの `pending-changed` と、場面の `speech`（afterMs 200）が別々のタイマーで競って並びが入れ替わる（委譲先の報告で指摘、追っているタスクは無い）。T-672 の `input-dispatch` と同じ正体
  - 出し先: タスク（押す前に `room.waitForEvent("speech")` のように競う相手を待つ。確かめたいことは弱めない）
- **人格（`persona.md`）の「締めのセリフの言い方」を、`report` の `closing` で言う形に直す**（振り返り: T-749）
  - 根拠: `report` がターンを閉じるようになり、締めはあとから `speak` で言えない。人格側は「締めの `speak` はレポートを渡したあとに言う」のままで、tsukumo 側の条と食い違う（委譲先の報告で指摘）
  - 出し先: タスク（同梱パックの `persona.md` を直す。ホーム側 `~/.tsukumo/characters/` は人が直す）
- **サブエージェントを立て直す前に、前の担当を `TaskStop` で止める**（振り返り: T-749）
  - 根拠: 完了の知らせのあとに `SendMessage` で呼び戻した担当が、報告を先走りさせたまま書き込みを続け、立て直した担当と同じ作業ツリーを同時に書き換えた（新しい担当が mtime の更新で気づいて止まった）
  - 出し先: `next-task` スキルの手順5（委譲し直すときは前の担当を止めてから）
- **`report` の閉じ方を実物の tsukumo で1ターン見る**（振り返り: T-749）
  - 根拠: 完了条件の実物での目視を、サブエージェントからは起こせず未実施のまま閉じた。`closing` の吹き出しと、`report` のあとに assistant が来ないことは疑似セッションと T-703 の実測でしか確かめていない
  - 出し先: タスク（新しいプロセスの tsukumo で1ターン流して目視し、ずれがあれば直す）
