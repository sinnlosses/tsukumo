# `deny-sed-in-place` が `perl -0pi` のようにまとめた旗の `-i` を拾わず、作業ツリーのファイルを書き換えられる（振り返り: GH-331）

- 札: 赤 道具（24回目）
- 根: deny-hook-combined-flags
- 根拠: GH-331 の委譲先が `perl -0pi` と `cat > file` を1回の Bash に入れたところ、拒まれたと思っていた perl の編集が効いていた（委譲先の friction log）。受け入れでメインが `{"command":"perl -0pi -e s/a/b/ src/main.ts"}` を `node scripts/deny-sed-in-place.ts` に渡すと終了コード 0 で通った。
- 出し先: タスクにする。`scripts/lib/bash-write-denial.ts` の perl・sed の旗の読み方を、短い旗をまとめて書く形（`-0pi`・`-pie`・`-ni` など、`-i` を含む塊）でも `-i` を拾うようにし、`test/scripts/deny-sed-in-place.test.ts` の止める側の表に足す
