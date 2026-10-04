# `capture-view.ts --scene` に撮る前の操作（打つ・押す・接続を落とす）を渡せる口を足し、目視のたびに使い捨ての Playwright スクリプトを書かせない（振り返り: GH-333）

- 札: 黄 道具（23回目）
- 根: capture-adhoc-playwright
- 根拠: このループで描画を変えた5件のうち4件（GH-344 の切断の帯・GH-354 のキャラ作成と日記の再訪・GH-351 の長い文・GH-333 の `/clear` の帯）で、委譲先が scratchpad に使い捨ての撮影スクリプトを書いた。`capture-view.ts` は入力欄に打てず、`capture-catalog.ts` は件を足さないと操作を当てられない（GH-333 の friction log）。GH-351 では長い文の場面のために `fake-session.json` へ仮の場面を足して消す往復も出た
- 出し先: 2回目以上なので仕組みで塞ぐ。`scripts/capture-view.ts` に、`capture-catalog.ts` の `Preparation`（打つ・押す・送る・hash）と同じ語彙の操作を引数で並べて渡せる口を足し、`docs/architecture/testing.md`「手で確かめること」に1段落で書く。委譲の依頼文の「描画を変えるタスク」の項は、この口で撮るよう指す
