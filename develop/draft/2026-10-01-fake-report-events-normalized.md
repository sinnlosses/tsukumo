# 疑似セッションの `report` イベントも本物と同じ検証と既定値の補いを通す（振り返り: GH-147）

- 札: 黄 道具（1回目）
- 根拠: レポートの塊を足すタスクが2件続けて、疑似セッションのフィクスチャで同じ形のつまずきに当たった。GH-150 では `stats` の項目に `total` を書かないとブラウザが `trim` で落ち、GH-147 では `report` イベントに `favor`・`checks` が無いと `main-view.ts` が `undefined.map` で落ちて E2E が `turn-finished` を待って30秒で時間切れになった。本物の経路は `parseReportSections` が既定値を補うが、fake driver はフィクスチャをそのまま流すので、欄を1つ足すたびに全場面へ書き足す手間と落ちる危険が出る
- 出し先: タスク1件（fake driver が `report` の入力を本物と同じ検証（`parseReportSections` など）に通してから流す。フィクスチャから既定値の欄を省いても描けることを E2E で守る）
