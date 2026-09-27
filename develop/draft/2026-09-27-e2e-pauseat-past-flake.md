# E2E `final-report-label` の `page.clock.pauseAt` が「Cannot fast-forward to the past」で落ちる揺れを扱う（振り返り: T-670）

- 根拠: T-670 の委譲先の `pnpm run check` で、`final-report-label.test.ts` が `page.clock.pauseAt: Cannot fast-forward to the past` で1回落ちた（コードの変更なし。受け入れの `pnpm run check` では通過）。`settleAndMatch` の `pauseAt(FIXED_INSTANT + elapsedMs)` は、T-739 で入った `installFixedClock` の `pauseAt(fixed)` のあとで、ページの時計がすでに `FIXED_INSTANT + elapsedMs` を越えていると落ちる。既存の揺れのドラフト（`2026-09-27-e2e-context-usage-and-main-history-flake.md`）と T-776 は扱っていない
- 出し先: タスク（`final-report-label` で時計が `elapsedMs` を越える経路を特定し、`settleAndMatch` が時計の位置に依らず同じ瞬間へ揃うようにする。`pnpm run test:e2e` を続けて10回流して落ちないことを完了条件にする）
