# サーバのテストの刈り込みで残した3件を片付ける（振り返り: GH-431）

- 札: 黄 見落とし（1回目）
- 根: server-test-campaign-leftovers
- 根拠: GH-431 の受け入れで申し送りとして残ったもの。(1) `src/server/config.ts` の `HOST_ENV_NAME`・`FIXED_CLOCK_ENV_NAME`・`CLAUDE_CONFIG_DIR_ENV_NAME` はどこからも使われていない export。(2) `test/server/repository/adapter/fake-beads.test.ts`「…疑似セッションの間隔で一覧に届く」は待ちの上限がふだんの間隔と同じ 5000ms で、疑似セッションの間隔を確かめ切れていない。(3) GH-429 で足した `task-summary.test.ts` の `waitForQuietPolls` のループに、`oxlint` が `no-unmodified-loop-condition` の警告を2件出している（終了コードは 0）
- 出し先: タスク1件（difficulty は sonnet 見込み）。3件を直し、(2) は間隔を変える退行を入れると落ちる形にする
