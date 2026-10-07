# test-audit のキャンペーンの台帳は、宣言の一覧と件数をスクリプトで抜き出してから印を付ける手順にする（振り返り: GH-431）

- 札: 黄 道具（1回目）
- 根: campaign-ledger-hand-count
- 根拠: GH-431 で台帳の件数を手で数えて段2〜6で計5回外し、そのたびに `tw edit` と `tw step` を打ち直した（委譲先の friction log）。`grep -cE 'it(\.each)?\('` が `it.each<…>(` を拾わず数え違えた回もある。段6から `grep -cE '^\s*(it|test)(\.each)?[(<]'` で合計だけ機械で合わせたが、describe ごとの内訳はまた手で外した
- 出し先: claude-skills の `test-audit` CAMPAIGN.md の段3（台帳）。ファイルごと・describe ごとの宣言名と件数を出すスクリプトを同梱し、台帳はその出力に印と証拠を足して作る形にする
