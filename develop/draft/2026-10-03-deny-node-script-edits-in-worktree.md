# sed -i を拒む hook を、node のスクリプトで作業ツリーのファイルを書き換える手にも掛ける（振り返り: GH-254）

- 札: 黄 制約違反（12回目）
- 根拠: GH-254 の委譲先が、`chart.ts` の変数名の置換と `mermaid-block.tsx`・テストへの差し込みを、Edit ではなく scratchpad に置いた node スクリプトで作業ツリーのファイルへ直に書いた（委譲先の friction log の自己申告）。委譲の指示で「sed -i・python・作業ツリーの外で書き換えて cp で戻す回り道をしない」と名指していたが、node は名指していなかった。GH-239 の cp の回り道（`2026-10-03-deny-copy-back-into-worktree.md`）と同じ型で、手を名指して塞ぐやり方では追いつかない
- 出し先: `scripts/deny-sed-in-place.ts` の判定を、手（sed・perl・python）ではなく「作業ツリーの中のパスへ書き込む Bash のコマンド」で拒む形に寄せる（node・cp・mv・tee・リダイレクトを含める）。cp の回り道のドラフトと1つのタスクにまとめてよい
