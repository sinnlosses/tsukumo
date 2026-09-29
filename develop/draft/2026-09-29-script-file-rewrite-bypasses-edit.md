# Python・perl の文字列置換によるファイルの書き換えも、hook で Edit に寄せる（振り返り: GH-106）

- 札: 黄 制約違反（4回目）
- 根拠: 依頼文で「Edit / Write で書き換え、Python・perl の置換を使わない」と書いても、GH-103 は Python の置換で書き換えて当たりを取り違え打ち直し、GH-106 も Python の置換を試みて auto mode の分類器に止められた。GH-105 の hook は `sed -i` だけを止めるので、この抜け道は残っている。あわせて GH-105 の hook は heredoc や引用符の中の `&& sed --in-place` という文字列でも止まる（受け入れで実際に当たった）
- 出し先: `scripts/deny-sed-in-place.ts` を広げるタスク。`python3 -`・`perl -pi` などでファイルへ書き戻す形も止め、引用符と heredoc の中身は判定から外す
