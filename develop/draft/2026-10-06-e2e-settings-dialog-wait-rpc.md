# E2E の設定のダイアログを待つヘルパが、凍らせた時計を回数で進めず、下書きの応答が届くのを待ってから進める（振り返り: GH-420）

- 札: 赤 揺れ（15回目）
- 根: e2e-frozen-clock-wakeup
- 根拠: GH-420 の `tw verify` の2回目（load 11.3→9.4）で、`test/e2e/task-list.test.ts` の「「使わない」と書いたプロジェクトでは…」が `projectSettingsDialog` の `field.waitFor()` で30秒のタイムアウトになった。単独で流し直すと23件とも通った（load 7.4）。このヘルパは凍らせた時計を 50ms×20 回だけ進めて欄が出るのを待つので、`/rpc` の下書きの応答がその20回より実時間で遅れて届くと、欄はもう描かれない。同じ根に打った手 GH-329 のあとに再発した
- 根拠（続き）: 送る前の `tw ship` の検証でも同じ件が落ちた（4回中2回）。GH-420 の受け入れで、`task-list.test.ts` のヘルパを `openProjectSettingsDialog` に改め、下書きの応答を `page.waitForResponse` で待ってから時計を進める形にした
- 出し先: タスクにする。GH-329 は描き直しの合図を store に持たせ、時計を止めた E2E でも描けるようにした。ただし、待つ側が「時計を何回進めるか」に頼る形は残ったので、負荷で応答が遅れると外れる。種類の違う手として、同じ形の待ち（`welcome.test.ts` の `advanceUntil`・`session-switch.test.ts` の `revealDigest`・`chat-compact-boundary.test.ts`）を、待つ実時間の出来事（応答・知らせ）を先に待つ形に揃え、回数だけで待つ書き方を `scenario-run.ts` の共有の口に寄せる
