# テストの `report` イベントを1つの組み立て関数から作り、直書きを検査で落とす（振り返り: GH-404）

- 札: 黄 構造の重さ（5回目）
- 根: session-event-shape-ripple
- 根拠: `report` イベントに欄を1つ（`workPlanClosing`）足しただけで、イベントをその場で書き下す単体テスト16ファイルに `workPlanClosing: "none"` を手で足した（`kind: "report"` を直書きする `test/` の `.ts` は17ファイル）。E2E も `messages` の期待値26ファイルを撮り直し、うち24ファイルは既定値の1行が増えただけだった
- 出し先: タスクにする。テストの `report` イベントと `ReportDraft` を既定値つきの組み立て関数1つから作り、`test/architecture.test.ts` で `kind: "report"` の直書きを落とす。E2E の `messages` の比較で、既定値（`none`）の欄を落としてから比べられないかも同じタスクで測る
