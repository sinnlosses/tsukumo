# 疑似セッションの `report` を MCP の `report` ツールの口に通し、差し戻しから描画までを撮れるようにする（振り返り: GH-532）

- 観点: 黄 機械の検査
- 根拠: GH-532 の完了条件6（割れる `sequenceDiagram` の `report` が1回差し戻され、直した `report` で図が描かれる）を確かめられなかった。fake driver は `SessionEvent` を直に流して `report` ツールの口（`ReportReview` の差し戻し）を通らないため。`capture-view.ts` を4回打ったが、差し戻しの画も描画の画も撮れなかった
- 出し先: タスク。fake driver の場面で `report` を `reportTool` の口に通す手（差し戻されたら次の手へ進む）を足し、`capture-view.ts --scene` で差し戻しから描画までを撮れるようにする。あわせて `docs/architecture/testing.md`「手で確かめること」にその場面を書く
