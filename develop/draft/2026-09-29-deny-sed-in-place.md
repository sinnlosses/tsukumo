# Bash の `sed -i` を hook で止め、Edit へ寄せる（振り返り: GH-101）

- 札: 黄 自己申告の不正確さ（3回目）
- 根拠: GH-101 の委譲先は「`testTimeout` を `hookTimeout: 15_000` に置き換えた」と報告したが、実物は `testTimeout: 5_000` で古いコメントが残っていた（受け入れで直した）。この1行は `sed -i.bak` で書き換えていた。依頼文で BSD の `sed -i` を避けるよう書いていたのに、GH-97・GH-101 の2回とも委譲先が使っている。書いたつもりと実物のずれは、差分を読まない限り見えない
- 出し先: 仕組みで塞ぐ。広域 kill を止める hook（`scripts/deny-broad-kill.ts`）と同じ形で、Bash の `sed -i`（`-i.bak` を含む）を止めて Edit を促す hook を足す
