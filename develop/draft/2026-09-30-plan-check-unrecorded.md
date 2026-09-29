# Beads 方式で、作業より先に `tw edit` で書いた `## やること` を `tw plan-check` が `unrecorded` と出す（振り返り: GH-134）

- 札: 黄 道具（5回目）
- 根拠: GH-119 と GH-134 の委譲先はどちらも「コードを変える前に `tw edit` で1回書き、`WORK_BEFORE_PLAN` は出なかった」と報告したが、受け入れの `tw plan-check` はどちらも `PLAN_NOT_FIRST unrecorded`（`tw edit` を通さずに書いた）を返した。一方、GH-131 で `WORK_BEFORE_PLAN` のあと `--after-work` で書き直した分は `after-work` と正しく記録された。`--after-work` を付けない初回の記入が、Beads 方式では書き込みの順の記録に残っていない疑いがある（未確認: `tw edit` の実装と記録の置き場は読んでいない）
- 出し先: 仕組みで塞ぐ。claude-skills の `task-workflow`（`tw edit` と `tw plan-check`）を直すタスク1件。Beads 方式で、作業前の `tw edit` が記録を残し、`plan-check` が `PLAN_FIRST` を返すことを自己テストで確かめる
