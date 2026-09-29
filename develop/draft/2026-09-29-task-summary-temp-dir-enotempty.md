# task-summary の見張りのテストで、一時ディレクトリの後片付けが ENOTEMPTY で落ちる揺れを塞ぐ（振り返り: GH-111）

- 札: 黄 揺れ（5回目）
- 根拠: GH-111 の受け入れの `tw verify` で、変更と無関係な `test/server/repository/adapter/task-summary.test.ts` の「main を動かさずに bd で閉じると、次の見回りで done に変わる」が `ENOTEMPTY, Directory not empty: '…/tsukumo-task-summary-…'` で1件だけ落ち（2857 pass / 1 fail）、打ち直したら 2858 件すべて通った。`test/fixture/temp-dir.ts` の `useTempDir` は `rmSync(dir, { recursive: true, force: true })` を再試行なしで打ち、`afterEach` の `watcher.close()` は見回りの途中で起こした `git` / `bd` の子プロセスを待たないので、消している最中に子が書き足している見込み（未確認）。同じ回に委譲先の `tw verify` でも `test/e2e/background-task.test.ts` の Chrome 起動待ちが 60 秒で1回落ちている
- 出し先: 仕組みで塞ぐタスク1件。見張りの `close` が走っている見回り（子プロセス）の終わりを待てる形にしてテストの `afterEach` で待つか、`useTempDir` の後片付けに `maxRetries` を付けるかを、原因を確かめてから決める
