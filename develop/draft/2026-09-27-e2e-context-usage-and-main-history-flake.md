# E2E `background-task` のコンテキスト使用量が「取得中…」のまま止まる揺れと、`main-history.test.ts` の通算250件の時間切れを扱う（振り返り: T-739）

- 根拠: T-739 の委譲先の `pnpm run check` で、`background-task.test.ts` のコンテキスト使用量（`61%`）が「取得中…」のまま止まる揺れが1回出た（単独では3回とも通過）。受け入れの `pnpm run check` では `main-history.test.ts`「タスクの節目: 通算250件目」が 5000ms で時間切れになった（load average 9 前後、単独では通過）。どちらも T-739 の差分とは無関係で、既存の揺れのタスク（T-774 の `dist/browser/` の取り合い・T-776 の `architecture.test.ts` の時間切れ）は扱っていない
- 出し先: タスク（`useContextUsage` の取得を E2E で待てる形にする／250件のコミットを作るテストの時間を測って `testTimeout` を個別に伸ばすか件数の作り方を軽くする。`pnpm run check` を続けて10回流して落ちないことを完了条件にする）
