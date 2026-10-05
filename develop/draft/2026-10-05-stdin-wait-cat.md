# 標準入力を待つ `cat > /dev/null` を Bash の hook で拒み、委譲先が120秒の待ちで背景に回るのを防ぐ（振り返り: GH-329）

- 札: 黄 揺れ
- 根: stdin-wait-cat
- 根拠: GH-373 と GH-329 の委譲先が、それぞれ中身の無い `cat > /dev/null` を Bash に混ぜ、標準入力を待って120秒の上限で背景に回り、TaskStop で止めた（どちらも委譲先の friction log。GH-329 では差し戻しの往復ごとに同じ行を書き写している）。同じ日に2件で、手の誤りが仕組みで止まっていない
- 出し先: タスクにする。Bash の hook（`scripts/lib/bash-write-denial.ts` の並びか、別の deny の hook）で、入力を与えない `cat`（引数もパイプの入力も無い `cat`・`cat > <先>`）を拒み、拒む理由に「標準入力を待って止まる」を返す。hook の単体テストを足す
