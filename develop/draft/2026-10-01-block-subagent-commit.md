# 委譲先のコミットを、事後に知らせるだけでなく起きる前に拒む（振り返り: GH-208）

- 札: 赤 制約違反（9回目）
- 根拠: GH-208 の委譲先（haiku）が、依頼文の「コミットしない」に反して作業を `GH-208:` の件名でコミットした（今回は報告に書いてあった）。T-730 でも haiku が同じことをしており、そのとき足した `tw done` の `COMMITS_SINCE_CLAIM` は事後に知らせるだけで、受け入れでは `tw verify-check` が `NOT_VERIFIED head` になり検証をもう1回打ち直した（約1分）
- 出し先: claude-skills の `task-workflow` に仕組みを足す。たとえば `tw claim` が作業ツリーに印を立てている間は、`tw done` を経ない `git commit` を pre-commit の検査で拒む（`tw done` のあとのメインのコミットは通す）
