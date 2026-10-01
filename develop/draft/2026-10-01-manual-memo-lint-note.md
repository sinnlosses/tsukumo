# 「手でメモ化しない」に、lint が手のメモ化を拒む場合と、打鍵ごとに作り直される部品の確かめ方を足す（振り返り: GH-165）

- 札: 黄 正典の不備（1回目）
- 根拠: GH-165 で手のメモ化を5つ消したところ、React Compiler が `boardContent(...)` に渡す値を検索の文字と同じ単位で覚え、本文中のリンクの `<a>` が打鍵ごとに作り直された（組み立て版の probe で `connected: true → false`）。外れたときの戻し方として計画した `useCallback` は oxlint の `react(preserve-manual-memoization)` に拒まれた。`docs/coding-standards.md`「手でメモ化しない」には、この lint で手のメモ化が書けない場合のことも、作り直されても見た目と操作が変わらないことの確かめ方（組み立て版で要素に印を付けて残るかを見る）も書いていない
- 出し先: `docs/coding-standards.md`「React」節「手でメモ化しない」に2行足す（lint が拒むときは形を曲げず、作り直されても見た目と操作が変わらないかを組み立て版の probe で確かめて受け入れる・確かめ方）
