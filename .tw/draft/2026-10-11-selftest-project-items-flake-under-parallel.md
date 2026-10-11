# 全件を並列で流すときだけ落ちる自己テスト test_tracker_project_items_per_issue を安定させる（振り返り: GH-486）

- 観点: 黄 機械の検査
- 根拠: GH-486 の `./check.sh` の1回目が、`test_tracker_project_items_per_issue` の「Status が変わった課題だけ1キー書き換わる」で `status_writes` が 0 になって落ち、打ち直しで通った。単独で2回流すと2回とも通った。落ちた確かめは `sync_all`（期限なし）の中で、GH-486 の差分の経路ではない
- 出し先: tsukumo-plugins の `skills/task-workflow/scripts/selftest_beads.py`。並列で落ちる条件（共有の資源・待ちの長さ）を調べて直すタスク。再現しないなら、落ちたログを足がかりに次に落ちたときに調べる
