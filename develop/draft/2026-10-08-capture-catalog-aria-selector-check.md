# capture-catalog の role・aria-label のセレクタも src の実物と突き合わせる検査を足す（振り返り: GH-503）

- 観点: 黄 機械の検査
- 根拠: GH-503 の委譲先が撮影で `report-checks`・`report-verdict` が撮れないことに気づいた。`scripts/capture-catalog.ts` の `CHECKS_SELECTOR`（`aria-label="検証結果"` の完全一致で、問題のある表の `検証結果の問題` に当たらない）と `VERDICT_SELECTOR`（src に無い `検証とお願いの合図` の group）は、この作業の前から実物と合わず、件が黙って落ちていた（friction log の黄1件）。`test/scripts/capture-catalog-selector.test.ts` は CSS Modules の class 名だけを突き合わせ、role・aria-label の値は見ていない
- 出し先: `test/scripts/capture-catalog-selector.test.ts` に、`capture-catalog.ts` の待ちのセレクタのうち `aria-label` の値を持つものが、`src/` のどこかに同じ値（前方一致なら頭）で書かれているかを見る検査を足す
