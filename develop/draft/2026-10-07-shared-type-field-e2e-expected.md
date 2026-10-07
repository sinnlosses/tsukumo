# 共有の型に欄を足すタスクの計画に、E2E の期待値の撮り直しを置くよう testing.md に指し先を足す（振り返り: GH-365）

- 観点: 黄 道案内
- 根拠: GH-365 で `TaskSummaryItem` に `waitingFor` を足したところ、`tw verify` の E2E が9件落ちた。原因は `test/e2e/expected/` の期待値が手続きの応答（messages）と DOM の写しを持っていることで、計画（`## やること`）に撮り直しの段が無かった（委譲先の friction log。撮り直して2回目で通った）
- 出し先: `docs/architecture/testing.md`「E2E の走らせ方」に、`shared` の型（手続きの応答に乗るもの）や DOM の構造を変えると期待値が変わるので、計画に `pnpm run test:e2e:update` と差分の確認の段を置く、と1行足す
