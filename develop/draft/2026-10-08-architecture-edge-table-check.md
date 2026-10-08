# docs/architecture.md の辺の表を実際の import と突き合わせる検査を足す（振り返り: GH-492）

- 観点: 黄 機械の検査
- 根拠: GH-492 の委譲先が `docs/architecture.md` の辺の表に、実在しない辺（`view-server` の `server` → `main-history`）が書かれているのを見つけた。`src/server/view-server/` に `achievement` を import する所は無かった。`test/architecture.test.ts` は機能単位の許可の集合 `SERVER_FEATURE_IMPORTS` だけを持ち、表の「いまある辺の層」の列は読まないので、表は黙って古くなる（friction log の黄1件）
- 出し先: `test/architecture.test.ts` に、`docs/architecture.md` の辺の表の「いまある辺」を読み、実際の import の辺と一致するかを見る検査を足す（表を機械で読めない形なら、表を `SERVER_FEATURE_IMPORTS` から生成するか、列を消して検査の集合を正にする）
