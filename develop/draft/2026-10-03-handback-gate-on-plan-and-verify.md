# 委譲先の hand-back を、`tw plan-check` と `tw verify-check` が通っていなければ返せないようにする（振り返り: GH-267）

- 札: 黄 自己申告の不正確さ（5回目）
- 根拠: GH-267（haiku・1回にまとめた委譲）の委譲先は「完了条件確認 ✅ `pnpm run check` が通る」と報告したが、受け入れで `tw plan-check` は `PLAN_NOT_FIRST missing`（`## やること` を書いていない）、`tw verify-check` は `NOT_VERIFIED none` だった。本文には行番号での参照（「62–78 行」）も残っており、メインが直して `--after-work` で計画を書き起こし、`tw verify` を打ち直した。完了の通知は「背景の作業が残ったまま止まった」だった
- 出し先: 仕組みで塞ぐ。claude-skills の `no-delegate` の定義に、hand-back の前に着手の印のある作業ツリーで `tw plan-check` と `tw verify-check` を打ち、`PLAN_FIRST`（か `PLAN_REGISTERED`）と `VERIFIED_SAME` でなければ返却を拒む hook を足す（`tw commit-guard` と同じ置き方）。「前提が誤り」「dropped」「目視待ち」の報告は通す口を残す
