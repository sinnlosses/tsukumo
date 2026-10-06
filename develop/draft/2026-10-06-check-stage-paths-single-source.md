# claude-skills の段ごとの当たるパスを `check.sh` の判定だけに置き、README と冒頭コメントからは写しを消す（振り返り: GH-415）

- 札: 黄 文書の重さ（3回目）
- 根: check-stage-paths-restated
- 根拠: GH-415 で、段ごとの当たるパスを `check.sh` の判定・`check.sh` の冒頭コメント・`README.md` の「## 検証」の3か所に書いた。受け入れで README だけが `scripts/` まるごとと書いて判定（`scripts/links.sh`・`scripts/selftest_links.sh`）と食い違い、差し戻して `tw verify` を打ち直した（約13分）。委譲先の差分でも `README.md` を3回、`check.sh` を2回直していた
- 出し先: claude-skills の `README.md`「## 検証」と `check.sh` の冒頭コメントから当たるパスの列挙を消し、「流す段は `./check.sh --plan` で見る」とだけ書く。次に段の当たるパスを変えるときは `check.sh` の `stage` の呼び出し1か所だけを直せば済む
