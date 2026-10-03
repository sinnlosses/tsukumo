# CI の単体テストが `bd` の無い ubuntu-latest で落ちないよう、`bd` を起こす単体テストの扱いを決める（振り返り: GH-299）

- 札: 黄 正典の不備（13回目）
- 根拠: GH-299 で置いた `.github/workflows/ci.yml` は `pnpm run test` を走らせるが、`test/fixture/beads-repository.ts` が `bd init` を打ち、`test/server/repository/adapter/task-summary.test.ts` と `test/server/achievement/adapter/main-history.test.ts` がそれを使う。`bd` が無いときに skip する仕組みは無く、タスク本文は CI の環境に無い外部コマンドに触れていなかった。初回の push で CI が赤くなる公算が大きい（未 push のため未確認）
- 出し先: 検査。`bd` を起こす単体テストを、`bd` が無いときは skip する1つの口（fixture の側）に寄せるか、CI に `bd` を入れる（外部コマンドの依存が増えるので利用者の承認が要る）かを決めるタスク。どちらでも、外部コマンドを起こすテストの一覧を `test/architecture.test.ts` で数え、CI の段に載せる前に落とす検査を足す
