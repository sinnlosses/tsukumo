# 委譲先が `pkill -f` でコマンド名だけを当てて止めるのを hook で拒み、PID か作業ツリーのパスで当てさせる（振り返り: GH-399）

- 札: 赤 操作の誤り（3回目）
- 根: broad-process-kill
- 根拠: GH-399 の段3で、委譲先が作業ツリーの外の写しで走らせた check を止めるために `pkill -f "check.ts --full"` を打った。同じ文字列はほかの作業ツリーの `tw ship` の送る前の検証にも当たり、別のセッションの全件検証を巻き込んだおそれがある（委譲先の friction log）。CLAUDE.md・`docs/workflow.md` にプロセスの止め方の規則は無く、`scripts/` の PreToolUse hook も `pkill` を見ていない
- 出し先: 検査。`scripts/` に PreToolUse hook を足し、`pkill`・`killall` でパターンにこの作業ツリーのパスを含まないもの（コマンド名や引数だけで当てるもの）を拒み、「`ps` で PID を確かめて `kill <PID>` で止める」と返す。次に背景のコマンドを止めるとき、ほかの作業ツリーの検証が落ちる事故が仕組みで起きなくなる
