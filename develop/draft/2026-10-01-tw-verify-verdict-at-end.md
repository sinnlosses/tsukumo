# `tw verify` が判定行を末尾にも出す（振り返り: GH-189）

- 札: 黄 道具（9回目）
- 根拠: 2026-10-01 の `/loop` で、委譲先が `tw verify` の出力を `tail` で切って先頭の判定行（`VERIFIED`・`VERIFY_NOT_PASSED`・`FOLDED`）を見落とし、検査全体を打ち直した報告が4件続いた（GH-187・GH-189・GH-195・GH-199 の friction log）。打ち直し1回で2〜3分。依頼文で「先頭の判定行も見る」と念押ししても止まらなかった
- 出し先: claude-skills の `task-workflow` の `task.py` の `verify`。判定行（と取り込んだときの `FOLDED`）を出力の末尾にもう一度出す。自己テストに、末尾の行だけを読んで判定が取れることを足す
