# E2E の期待値・疑似セッションの場面・部分木の口が、どのシナリオからも引かれずに残ったら検査で落とす（振り返り: GH-428）

- 札: 黄 構造の重さ（6回目）
- 根: e2e-unreferenced-fixture
- 根拠: GH-428 で E2E を173件から55件に刈り込んだとき、引かれなくなったものを人の照合で消したため、受け入れのレビューで2往復の差し戻しになった。1回目は期待値3組（`report-task-verdict`・`session-ended`・`turn-history`）と `DOM_ROOT_SELECTORS` の口2つ（`project-settings`・`speech-log`）。2回目は消したシナリオ名を指す文字列の定数 `COMMAND_CATALOG_SCENARIO`。担当は場面の名前で照らしていて、シナリオ名と文字列の定数は照らしていなかった（friction log の 青 構造 2件）。`test/fixture/fake-session.json` は Edit を18回打って直した。
- 出し先: `test/architecture.test.ts` か E2E の足場の単体に検査を足す。`test/e2e/expected/` のファイル名の組が、残った E2E の渡すシナリオ名（テンプレートの展開と `open…Room` の引数を含む）にちょうど対応すること、`DOM_ROOT_SELECTORS` の各キーをどれかの E2E が `domRoots` に渡していること、`fake-session.json` の `turns` の各場面を E2E・`scripts/`・文書のどれかが引いていること、を機械で確かめる（次に E2E を刈り込む・足すとき、消し残しが人の照合なしに落ちる）
