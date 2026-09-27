# E2E `report-main-view` の「DOM が落ち着かない」揺れを扱う（振り返り: T-732）

- 根拠: 黄 揺れ: T-732 の委譲先の1回目の `pnpm run check` で `test/e2e/report-main-view.test.ts` が `settledDom` の「DOM が落ち着かない」で落ち、単独の再実行と2回目の check では通った（T-732 は import のパスを移しただけで振る舞いは変えていない。受け入れの check は1回で通過）。委譲先はこれを friction log に書かず「なし」と報告した（黄 自己申告の不正確さ）
- 出し先: タスク（`report-main-view` で DOM が落ち着かない原因を、T-793 が残す成果物で特定して直す。`pnpm run test:e2e` を続けて10回流して落ちないことを完了条件にする）。あわせて `/next-task` の依頼文に「検証の打ち直しで通ったことも friction log に `揺れ` で書く」と一言足すかを決める
