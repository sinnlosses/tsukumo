# capture-view で --hash で開いた画面の読み込みを --wait-for で待てるようにする（振り返り: GH-492）

- 観点: 黄 道具の経済
- 根拠: GH-492 の委譲先が `capture-view.ts --scene report --hash '#achievement'` で成果の画面を撮ろうとしたが、`--wait-for` が `--hash` より前に当たる順番（USAGE「5つは書いた順に、--wait-for のあと」）のため、hash で開いたあとの `bd` の読みを待てず「…」の画しか撮れなかった。疑似セッションを自分で起こし、URL の hash で開いて撮り直した（friction log の黄1件）
- 出し先: `scripts/capture-view.ts` で、準備の手（`--hash`・`--click` など）のあとにも待ちを置ける口（例: 手の並びの中で書いた位置で待つ `--wait-for`、または `--wait-after`）を足し、単体テストを1件足す
