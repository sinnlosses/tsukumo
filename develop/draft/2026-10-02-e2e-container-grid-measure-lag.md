# E2E で `container-type` の器の中の grid の列幅を測るときは描画を待つ、を「E2E の揺れを生まない書き方」に足す（振り返り: GH-226）

- 札: 赤 見えない前提（1回目）
- 根拠: 委譲先が `test/e2e/report-main-view.test.ts` を40回直し、`npx vitest` を41回打った。`container-type: inline-size` を持つ器の中で `grid-template-columns` を CSS 変数で動かすと、直後の `getBoundingClientRect()` が古い列幅を返し（次の描画で追いつく）、同期でレイアウトが確定するという前提で書いた検査が落ち続けた。最後は `waitForFunction` で追いつくのを待つ形にした
- 出し先: `docs/architecture/testing.md`「E2E の揺れを生まない書き方」に、ドラッグや CSS 変数で寸法を変えた直後に寸法を測るときは `waitForFunction` で待つ、を1項目足す
