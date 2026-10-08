# capture-view で最終レポートを撮るときの待ち先を testing.md に書く（振り返り: GH-483）

- 観点: 黄 道案内
- 根拠: GH-483 の委譲先が `node scripts/capture-view.ts --scene work-plan-stopped` を `report-head` や `--advance` で待って撮り、中間レポートや作業中の画しか撮れなかった。`scripts/capture-catalog.ts` の `WORK_PLAN_FINAL_SELECTOR` を見つけて `--wait-for '[class*="is-final_"]'` に直すまで撮り直した（friction log の黄1件）
- 出し先: `docs/architecture/testing.md` の疑似セッションの場面を撮る段落に、最終レポートまで待つときの `--wait-for` の値（`WORK_PLAN_FINAL_SELECTOR` と同じもの）を1行で足す。GH-484（`--until-step` を足す）と同じ段落に触るなら、そちらへ寄せてよい
