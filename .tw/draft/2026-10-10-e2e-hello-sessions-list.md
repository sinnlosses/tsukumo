# E2E で起動時の切り替え先の一覧は hello に含まれて届き `sessions-changed` は来ないことを、testing.md の E2E の節に書く（振り返り: GH-574）

- 観点: 黄 道案内
- 根拠: GH-574 の委譲先が `test/e2e/session-resume.test.ts` で `room.waitForEvent("sessions-changed")` を待ち、30秒の時間切れで1回落ちた。既存の `session-switch`・`welcome` の E2E は場面から流す一覧を `sessions-changed` で待っており、それを真似ると、一覧から起動時に作られた場面で同じように落ちる
- 出し先: `docs/architecture/testing.md`「E2E の走らせ方」に1行。起動時の一覧は hello の状態に含まれて届くので待たない。`sessions-changed` を待つのは、場面が一覧を流し直すときだけ
