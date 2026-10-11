# 全件を並列で流すときだけ落ちる自己テスト test_tracker_project_items_per_issue を安定させる（振り返り: GH-486）

- 観点: 黄 機械の検査
- 根拠: GH-486 の `./check.sh` の1回目が、`test_tracker_project_items_per_issue` の「Status が変わった課題だけ1キー書き換わる」で `status_writes` が 0 になって落ち、打ち直しで通った。単独で2回流すと2回とも通った。落ちた確かめは `sync_all`（期限なし）の中で、GH-486 の差分の経路ではない
- 再発: GH-536 の最後の段で `tw verify` が2回続けて同じ確かめ（Status が変わった課題だけ1キー書き換わる）で落ち、3回目で通った。GH-536 は tracker に触れていない。落ちたログは `.tw/local/task-verify.failed-20261011T015056008271Z.log`（tsukumo-plugins の作業ツリー gh-536 の下。作業ツリーを消すと無くなる）。2タスクで出たので、次に落ちるのを待たずに調べる価値がある
- 出し先: tsukumo-plugins の `skills/task-workflow/scripts/selftest_beads.py`。並列で落ちる条件（共有の資源・待ちの長さ）を調べて直すタスク。再現しないなら、落ちたログを足がかりに次に落ちたときに調べる
