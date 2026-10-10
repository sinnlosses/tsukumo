# E2E の `room.resize` が、窓より高いページで30秒詰まらないようにする（振り返り: GH-591）

- 観点: 黄 機械の検査
- 根拠: GH-591 の段3で、詳細を開いた札が窓より高くなる場面（`inquiry` の添え書き付き）に `room.resize` を使うと、「ページが窓に収まる」待ち（`scrollHeight === height`）が30秒で時間切れになった。担当は `page.setViewportSize` を直に使って避けたが、同じ罠は窓を縮める統合をする次の人も踏む（`test/e2e/scenario-run.ts:402`）
- 出し先: `test/e2e/scenario-run.ts` の `resize` の待ちを、窓より高い場面でも詰まらない条件にするタスク。直さない（窓を縮めるときは `setViewportSize` を使う）なら、`docs/architecture/testing.md`「E2E の走らせ方」にその使い分けを1行足す
