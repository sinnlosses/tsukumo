# sed -i を拒む hook を、作業ツリーの外で書き換えて cp で戻す回り道にも掛ける（振り返り: GH-239）

- 札: 黄 制約違反（11回目）
- 根拠: GH-239 の委譲先が作業ツリーのファイルを `sed -i` で2回・python で1回書き換えようとして `scripts/deny-sed-in-place.ts` に拒まれ、うち1回は scratchpad に書いてから `cp` で作業ツリーへ戻していた（委譲先の friction log の自己申告。`inquiry.tsx`）。hook の文言は「作業ツリーの外に置けば通る」と書いており、戻す手は塞いでいない
- 出し先: `scripts/deny-sed-in-place.ts` に、作業ツリーの外（scratchpad・/tmp）から作業ツリーへの `cp`・`mv`・`cat >` を拒む判定と、そのテストを足す。拒む文言は Edit / Write ツールへ寄せる
