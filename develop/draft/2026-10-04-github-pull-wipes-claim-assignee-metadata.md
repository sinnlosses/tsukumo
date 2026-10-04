# 別の作業ツリーの `bd github pull` が着手中の課題の assignee と metadata を空にし、戻し処理も効かない件を直す（振り返り: GH-336）

- 札: 赤 道具（21回目）
- 根: beads-plan-mark-lost
- 根拠: `bd history gh-336 --events` で、10:13:09 の着手（actor `tsukumo-2`）の約2分後、10:14:56 に actor `fuji` の更新が assignee を空・metadata を null にしていた。actor が作業ツリー名でなく `fuji` になるのは `--actor` を渡さない `tracker.py` の `_bd_ok` 経由だけで、`_pull` の `bd github pull`（`tracker.py:231`）がこれに当たる。`_pull` の assignee の戻し（`tracker.py:238-241`）が走った履歴は無く、metadata を戻す処理はそもそも無い。結果として受け入れの直前に `NOT_OWNER`（`STALE:no-owner`）で止まり、`tw release --force` も `bd unclaim` が「not assigned」で落ちたため、人の了承を得て `bd update --assignee` で戻した。`tw plan-check` の `PLAN_NOT_FIRST unrecorded` も、`task_plan_base` が同じ書き込みで消えたためで、GH-330 が疑う読み取り側とは別の経路
- 出し先: GH-330 に、この書き込み側の経路（GitHub からの取り込みで metadata ごと消え、`was.assignee` が空のときや戻しが失敗したときに戻らない）を再現と修正の範囲として足す。足せないなら claude-skills の `task-workflow` の `tracker.py` の `_pull` が、取り込みの前の assignee と metadata（`task_*` の印）を取り込みのあとに戻し、戻せなかったら `TRACKER\tFAILED` で知らせる形にするタスク。`selftest_beads.py` に「取り込みで metadata が消えても戻る」場面を足す
