# E2E を直に流したとき、組み立てが src より古ければ最初に止めて `pnpm run build` を促す（振り返り: GH-146）

- 札: 赤 道具（8回目）
- 根拠: GH-146 の委譲先は `src/shared/report/report-block.ts` に塊を足したあと、組み立てずに `vitest --config vitest.e2e.config.ts` を直に流し、`dist/browser/` が古いまま「白い画面で turn-finished が届かない」30秒のタイムアウトを2回踏んでから原因に気づいた。`pnpm run check` の `test:e2e` は先に `pnpm run build` を打つので落ちないが、委譲先は1件の E2E だけを直に流すことが多い（トランスクリプトの `npx vitest` 17回）
- 出し先: E2E の setup（`vitest.e2e.config.ts` の globalSetup）で、`dist/browser/` の組み立て時刻が `src/browser/`・`src/shared/` の最新の変更より古ければ、テストを走らせる前に「組み立てが古い。`pnpm run build` を打つ」で落とす。検査はテストで守る
