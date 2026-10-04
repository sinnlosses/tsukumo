# `deny-e2e-run-limit` が E2E を走らせない `tw verify` まで1回と数え、差し戻しの続いた委譲先が最後の検証を打てなくなる（振り返り: GH-319）

- 札: 赤 道具（23回目）
- 根: e2e-run-limit-counts-verify
- 根拠: GH-319 は scripts/ と test/scripts/ だけの変更で、差し戻しが4往復続いたあと、委譲先の `tw verify` が着手中1件の上限6回に当たって拒まれた（委譲先の friction log「E2E を使わない変更でも `tw verify` が E2E を1回と数える」）。メインが代わりに `tw verify` を打って通した。
- 出し先: タスクにする。`scripts/lib/e2e-run-limit.ts` の数え方を、`tw verify`・`pnpm run check` のうち実際に E2E を全件走らせるもの（`--full`、または変えたファイルから E2E が選ばれるとき）だけ数える形にするか、上限に当たったときの拒否の文に「メインに検証を頼む」案内を足す。どちらにするかはタスクの論点にする
