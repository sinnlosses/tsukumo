# E2E の成果物で `protocolVersion` を印に置き換え、版を上げるたびに期待値が全件書き変わらないようにする（振り返り: GH-83）

- 札: 黄 道具（4回目）
- 根拠: GH-83 で `PROTOCOL_VERSION` を 24→25 に上げたら、`test/e2e/expected/*.messages.json` の57ファイルが `protocolVersion` の直書きで全部落ち、委譲先が sed で置き換えた。T-834 でも版を上げたときに同じ全件の書き換えが起きている（`git log -S'"protocolVersion": 24' -- test/e2e/expected`）
- 出し先: タスク。`test/e2e/scenario-run.ts` の「両方に共通の置き換え」（`docs/architecture/testing.md`「E2E の成果物と再現」）に `hello` の版を `<protocol-version>` のような印へ置き換える規則を足し、期待値を作り直す。版の一致は単体テスト側で守る
