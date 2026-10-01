# 新しい部品の置き場を計画の段で `test/architecture.test.ts` の置き場の規則に照らす（振り返り: GH-183）

- 札: 黄 診断違い（1回目）
- 根拠: GH-182 と GH-183 の2件続けて、計画が新しい部品を子部品の `components/` の下（孫部品）に置き、実装の途中で `test/architecture.test.ts` の「components/page/ の形」（入れ子は2段まで・部品のディレクトリの外から引いてよいのは `<部品>.tsx` だけ）に落とされて置き場を作り直した。規則自体は `docs/architecture.md`「ページの形」にあるが、計画を書く段で読まれていない
- 出し先: `docs/workflow.md` の委譲の注意に1行足す（新しい部品・フック・`domain/` を足すタスクの計画では、置き場を `docs/architecture.md`「ページの形」の表と入れ子の段数で確かめてから `## やること` に書く）
