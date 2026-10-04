# Beads 方式で着手のあとに `tw edit` で書いた `## やること` の「先に書いた」印が残らない件を、selftest で再現して直す（振り返り: GH-326）

- 札: 黄 道具（20回目）
- 根: beads-plan-mark-lost
- 根拠: GH-326 は着手時に `PLAN_STALE` で、委譲先が作業の前に `tw edit --section 'やること'` で計画を書き `EDITED` を受けたが、受け入れの `tw plan-check` は `PLAN_NOT_FIRST unrecorded` を返し、`tw handback-guard` も1度返却を拒んだ。`task.py` の Beads 方式の edit は、着手の印の持ち主（`tsukumo-2`）が一致していても `task_plan` の metadata を書いていない。原因は確かめていない（claim の `--unset-metadata` とその後の `tw sync` の取り込みの順、か `plan_changed` の判定が候補）
- 出し先: claude-skills の `task-workflow/scripts/selftest_beads.py` に「登録時の計画が古い（`PLAN_STALE`）タスクを claim → 作業の前に `tw edit --section 'やること'` → `tw plan-check` が `PLAN_FIRST`」の場面を足して落ちることを確かめ、`task.py` の Beads 方式の edit を直すタスク
