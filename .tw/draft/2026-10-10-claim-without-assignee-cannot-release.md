**担当者の消えた着手の印（`STALE:no-owner`）を `tw release --force` で外せるようにする（振り返り: GH-561）**

- 観点: 赤 道具の不具合
- 根拠: GH-561 の計画の回で、委譲先の `tw edit --body-file -`（標準入力）が約2分返らなかったあと、Beads が `in_progress` のまま assignee が空になった（`tw status` が `STALE:no-owner()`）。`tw release --force` は中の `bd unclaim --force` が `issue is not assigned` で落ち、`tw claim` は `TAKEN ? 41m`。人が本体で `bd update --status open` を打っても、GitHub に label `status::in_progress` が残っていたため取り込みで `in_progress` に戻り、label を手で外すまで取れなかった。label を外したあとは、取り込みが手放しとみなして印ごと落とした（`tw_claim.py` の `cmd_release`、`tracker.py` の着手の印を戻す関数）。応答が返らない件は GH-486 が覆う
- 出し先: tsukumo-plugins の task-workflow。`tw release --force` が assignee の無い `in_progress` を `bd update --status open` と GitHub の label `status::in_progress` の取り外しで畳む。selftest に「assignee の無い in_progress を release --force で外せる」場面を足す
