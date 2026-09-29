# ソースのコメントに日付（YYYY-MM-DD）を書いたら検査で落とす（振り返り: GH-132）

- 札: 黄 制約違反（7回目）
- 根拠: GH-132 の委譲先が `report-notation.module.css` の `progress` のコメントに「（2026-09-30 デザイン「進み具合 案A」）」と経緯を書き、受け入れでメインが削った。同じ回に `notation.tsx` の docstring にも `...rest` の働きを言い直す句（「`aria-label` はそのまま通す」）があった。CLAUDE.md は「経緯・採らなかった案は正典へ」と定めているが、依頼文で念を押しても出る。いま `src/` のコメントの日付は見本のパスの中の1か所だけで、日付を経緯の目印として機械的に拾える
- 出し先: 仕組みで塞ぐタスク1件。`src/` の `.ts` / `.tsx` / `.css` のコメントに `\d{4}-\d{2}-\d{2}` があれば `pnpm run check` で落とす検査（`test/architecture.test.ts` か `scripts/` の検査）を足す。`docs/history/mockup/` のパスの中の日付は除く
