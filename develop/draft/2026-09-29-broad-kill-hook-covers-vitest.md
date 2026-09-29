# 名前やパターンで止める hook（`scripts/deny-broad-kill.ts`）の対象に vitest を足し、引用符の中身は判定から外す（振り返り: GH-120）

- 札: 赤 制約違反（6回目）
- 根拠: GH-120 の委譲先が、再現用に起こした vitest を片付けるときに `pkill -9 -f "vitest run --reporter=dot"` を打った。同じマシンの別の作業ツリー（tsukumo-task）の vitest まで止めた可能性があり、利用者に確認を頼んだ。`docs/workflow.md`「起こすときの作法」はパターンで止めることを禁じているが、hook の `SHARED_PROCESS`（`pnpm|node|tsukumo|claude|cli\.ts|vite`）は `\bvite\b` なので `vitest` に当たらず、通ってしまった。逆に、受け入れでメインが打った `grep -rn 'pkill\|killall' .claude/ …` は、引用符の中の `\|killall` をコマンドの位置と読まれて止められた（GH-111 で `deny-sed-in-place.ts` から外したのと同じ形の誤検知）
- 出し先: 仕組みで塞ぐタスク1件。`scripts/deny-broad-kill.ts` の取り合う対象に `vitest`（と `playwright`・`chrome` など検証で並ぶもの）を足す。GH-111 で `deny-sed-in-place.ts` に入れた引用符・heredoc の除外を、2つの hook で共有して使う形にする。テストは `test/scripts/` に足す
