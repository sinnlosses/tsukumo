# E2E がブラウザを起こす `beforeAll` が上限に当たったとき、起こしかけのヘッドレス Chrome を止めて残さない（振り返り: GH-373）

- 札: 黄 揺れ（12回目）
- 根: e2e-browser-launch-timeout
- 根拠: GH-373 の1回目の `tw verify` で、`test/e2e/final-report-label.test.ts` のブラウザを起こす `beforeAll` が 60 秒の上限に当たって落ち（`Hook timed out in 60000ms`）、打ち直しで通った。その回のヘッドレス Chrome は親を失って残り（pid 61909 と子）、委譲先が手で止めた。このループの初めから残っていた親の無いヘッドレス Chrome（pid 47012・47022）も同じ形とみられる
- 出し先: タスクにする。`test/e2e/scenario-run.ts`（または E2E がブラウザを起こす共有の口）で、起動が上限に当たる・`beforeAll` が落ちたときに起こしかけたブラウザのプロセスを必ず止める形にし、起動の上限と負荷の関係を `docs/architecture/testing.md`「E2E の揺れを生まない書き方」に1文足す
