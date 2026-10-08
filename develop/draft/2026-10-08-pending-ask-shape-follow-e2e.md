# 答え待ちの形に欄を足したら E2E の期待値と疑似セッションの場面の引き先も直す、と testing.md に書く（振り返り: GH-504）

- 観点: 黄 道案内
- 根拠: GH-504 で `PendingAsk` に `briefs` を足したとき、計画に無かった `test/e2e/expected/*.messages.json` の書き直しと、場面を足したときの `test/e2e-reference.test.ts:121` の引き先が、`tw verify` と単体で初めて落ちた
- 出し先: `docs/architecture/testing.md`「E2E の走らせ方」（shared の形を変えたら期待値の書き直しが要る旨と、場面を足したら正典から引く旨の1行）
