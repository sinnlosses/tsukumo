# 単体テストの既定の `TSUKUMO_HOME` を一時ディレクトリに向け、本物の口のテストが利用者のホームへ書けないようにする（振り返り: GH-412）

- 札: 黄 構造の重さ（1回目）
- 根: tests-write-user-home
- 根拠: GH-412 で見張りの本物の口に「覚える口」を足しただけで、本物の口を使う既存の単体テスト2ファイル（`test/server/repository/adapter/task-summary.test.ts`・`fake-beads.test.ts`）が利用者の `~/.tsukumo/task-summary.json` にテスト用の一覧を書いた。テストを個別に直したが、`vitest.config.ts` の `env` は `TZ` などだけで `TSUKUMO_HOME` を向けておらず、次に本物の口へ書き込みを足したときも同じことが起きる
- 出し先: タスク1件。`vitest.config.ts` の `env`（か `globalSetup`）で単体テストの `TSUKUMO_HOME` を一時ディレクトリにし、`tsukumoHomeDir()` が利用者のホームを返すテストを機械で落とす
