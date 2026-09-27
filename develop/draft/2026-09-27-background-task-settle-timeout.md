# E2E `background-task` が「DOM が落ち着かない（5000ms）」で落ちる揺れを直す（T-801 の送り出しから）

- 札: 揺れ
- 根拠: T-801（タスクファイル1件を足しただけのコミット）の `task ship` の検証で、`test/e2e/background-task.test.ts` の「背景で走らせた直後は、ターンが終わっても背景のタスクが残る」が `settleAndMatch`（`test/e2e/scenario-run.ts:221`）の「DOM が落ち着かない（5000ms）」で落ちた。直後に同じ作業ツリーで `pnpm run check` を2回流すと2回とも通った。T-790 で `settledDom` が `aria-busy="true"` の消えるまで待つようになり、T-738 で E2E をファイル単位で3本並べたあとに出た形なので、取り直しが並列の負荷で5秒を超える・`aria-busy` が外れない、のどちらかの疑いがある（確かめていない）
- 出し先: 新しいタスク（落ちたときの DOM を控えて、`aria-busy` が残っていたのか DOM が動き続けていたのかを分け、原因に合わせて直す。`pnpm run check` を10回続けて流し、1度も落ちないことを確かめる）
