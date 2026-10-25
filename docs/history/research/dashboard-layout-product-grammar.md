# ダッシュボードの部品の語彙と配置の文法 — Good Design の製品の公式文書から（2026-10-20）

`docs/history/research/dashboard-layout-vocabulary.md`（「〜を HTML にして」の紙面を塊で書けるか）の続きで、製品の調査と tsukumo の決定との照らし合わせを置く。
足す候補と道の比較は `docs/research/dashboard-layout-proposal.md`。**正典ではない。**

**出典の印**: 番号 `[n]` は末尾の出典一覧（`dashboard-layout-proposal.md` の `[n]` もこの一覧を指す）。無印は一次情報。**【推測】**は私の推定。確認日はすべて 2026-10-20。

## 節の索引

| 節                                         | 中身                                                                                                                      |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| ## 2. 製品の部品の語彙と配置の文法         | Observable・shadcn/ui・Geist・Stripe・Atlassian・Primer・Carbon・Grafana・Datadog・Linear・Apple HIG・Tremor の主張と出典 |
| ## 3. 共通の文法と、tsukumo の決定との関係 | 製品に共通する10の文法と、tsukumo のいまの決定が同じか・食い違うか                                                        |
| ## 出典一覧                                | 番号つきの出典                                                                                                            |

## 2. 製品の部品の語彙と配置の文法

### 2.1 部品の語彙

| 部品                    | 製品と主張（公式文書の要旨）                                                                                                                                                                                                                                                                                                                                                                                                                                                           | tsukumo のいま                                                                                        |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **数の札**（KPI）       | Grafana の stat は「最新値など関心のある1つの値を、任意の sparkline 付きで出す」。部品は値・題・背景のグラフ・色の付け方（None / Value / Background）・閾値で、閾値を超えた値を色で知らせる [13]。Linear の dashboard は chart・metric block・table の3形式だけを組み合わせる [16]。Datadog の Query Value [15]、Observable の card の中の `.big` [3]、Tremor の Spark Chart・Progress Bar [18]                                                                                        | `stats`（値・前・全体・推移・良い向き）。**補足の行と、閾値・状態の色が無い**                         |
| **区画**（card・panel） | Observable の `card` は「内容をまとめて区切る」もので地と罫を持ち、題と副題を `h2`・`h3` で書く。「多くは grid の中に置く」。表だけの card は余白を外す [3]。shadcn/ui の Card は Header（Title・Description）・**Action（見出しの右上に置くボタンやバッジ）**・Content・Footer [4]。Carbon の tile は「情報・案内・次の一手を載せる柔軟な器」で、Carbon 自身は card を持たず tile から組ませる [12]。Datadog は Group の widget で他の widget をまとめる [15]                         | 無し。節は見出しの罫だけで、最終レポートは箱を持たない                                                |
| **札**（badge・label）  | Geist の Badge は「注意の要る要素を目立たせるか、似た要素を分類する」ラベルで、**1行に1つまで・1〜2語・押せない**、色は「緑=健全・赤=異常・琥珀=警告・青=情報・灰=中立」[5]。Stripe の Badge は読み取り専用で、中立・情報・肯定・否定・警告・緊急の6種を「対応が要るか」で分ける [6]。Atlassian の Lozenge は「人が対象をどう理解し、優先し、扱うかに効く意味のある属性」に使い、**色だけに頼らず**、長さは 200px まで [8]。Primer の Label は「状態・分類などの文脈のメタデータ」[10] | 表のセルの状態・`options` の判定・`claims` の確度・`files` の変更の中だけ。書き手が節に付ける札は無い |
| **タブ**                | Atlassian は「同じページで似た情報をまとめ、離れずに見られる」もので、**同時に比べる必要がある内容には使わない**、ラベルは1〜2語、全タブに関わる情報はタブの線より上に、数は少なく [9]。Tremor にも Tabs がある [18]                                                                                                                                                                                                                                                                   | 無し（`fold` で1つずつ畳む）                                                                          |
| **割合・進捗の棒**      | Tremor の Progress Bar・Category Bar・Tracker（監視の状態の並び）[18]                                                                                                                                                                                                                                                                                                                                                                                                                  | `stats` の `total` の帯・`chart` の `share`・`progress`（段の位置）                                   |
| **注記の区画**          | Datadog の Notes and Links は「dashboard を見た目で構造化し注記する装飾の widget」[15]                                                                                                                                                                                                                                                                                                                                                                                                 | `note`・`aside`（余白の柱）                                                                           |
| **頭**                  | Stripe Apps の頭は「アプリ名・ビュー名・外へのリンク・利用者が取れる主な操作」を持つ [7]                                                                                                                                                                                                                                                                                                                                                                                               | 目録の行・結論・検証の総括行                                                                          |

### 2.2 配置の文法

| 文法                               | 製品と主張                                                                                                                                                                                                                                                                                           |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 大事なものを上・先頭に、大きく強く | Carbon:「重要度で優先し、最も大事なデータに最も高いコントラストと最も広い面積を」「F 字の型に沿って、最も大事なものを上に置き、残りを F 字で並べ、最も大事でないもので終える」[11]。Apple:「相対的な重要度で並べる。最も大事な項目を上と先頭の側に」[17]。Grafana:「大から小へ、一般から特定へ」[14] |
| 格子は器の幅で「全部か約数か1列」  | Observable の `grid` は既定1列、`grid-cols-2/3/4` で列を宣言し、「狭い窓では列数を自動で減らす。4列は2列か1列に、3列と2列は1列に」。`grid-colspan-*`・`grid-rowspan-*` で升目をまたぐ [3]。閾値の実測（器 640/720/1080px）は `report-page-geometry.md` 2章                                           |
| 行の高さを揃えるか、格子を割る     | Observable は既定で `grid-auto-rows: 1fr`（行の高さを揃える「律動」）。高さの差で空きが無駄になるなら、行の高さを自動にするか格子を2つに割る [3]                                                                                                                                                     |
| 区画は格子の升目に、入れ子は浅く   | Observable の card は grid の升目にだけ置く [3]。入れ子は1段まで（`report-page-geometry.md` 5章の Splunk・Genesys）                                                                                                                                                                                  |
| 群は余白・器の形・罫で言う         | Apple:「関連する項目をまとめる。余白・器の形・区切り線で、どれが関連しどれが関連しないかを示す」「揃えた項目は関連し、字下げした項目は従属と読まれる」[17]                                                                                                                                           |
| 段階的に開く                       | Apple:「中身と選択が多すぎると探すのが遅くなる。開閉・メニュー・入れ子のビューで最初に見せる量を減らす」[17]。Carbon:「要らない情報は要るときに」[11]                                                                                                                                                |
| タブは同時に比べないものだけ       | Atlassian [9]                                                                                                                                                                                                                                                                                        |
| 色は意味だけ、同じデータには同じ色 | Carbon:「dashboard の中で同じデータには常に同じ色」[11]。Geist の色の割り当て [5]。Atlassian「色だけに頼らない」[8]                                                                                                                                                                                  |
| 札は少なく、意味のある属性だけ     | Geist「1行に1つまで」[5]、Atlassian「意味のある属性だけ」[8]、Stripe「対応が要るかで種類を分ける」[6]                                                                                                                                                                                                |
| 同じ群の区画は同じ形に揃える       | Carbon:「群の中で tile の種類を揃えると見た目の一貫が保たれ、混ぜると階層が崩れる」[12]。探索型の dashboard は「どの図も同じ配置と余白で、凡例を同じ位置に」[11]                                                                                                                                     |

## 3. 共通の文法と、tsukumo の決定との関係

| 共通の文法                      | tsukumo のいまの決定                                                                                                                                    | 関係                                                                                                                                |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 大事なものを上・先頭に          | 判決の頭（目録・結論・検証の総括行）を最初の1画面に（`report-excellence-strategy.md` 3.1）                                                              | 同じ                                                                                                                                |
| 数の札を上に                    | `stats` は節のどこにでも置け、`figure` にも置ける                                                                                                       | 同じ向き。`figure` に `stats` を置けば頭の直下に来る                                                                                |
| 区画を2次元に並べる             | 「横に並べて Z 字に読ませない」（`rich-rendering.md`）・「本文の列は1本のまま（2段組にしない）」（`main-view.md`）・`report-excellence-strategy.md` 5章 | **衝突**。ただし決定の理由は読み物の走り読み（Eyetrack III で1列が勝つ）。板の型は Carbon が F 字の走査を前提にしており、目的が違う |
| 格子は器の幅で全部か約数か1列   | `stats`・`cols` の列数は全部か約数か1列、器の幅で畳む（`screen-design/layout.md`）                                                                      | 同じ。仕組みは既にある                                                                                                              |
| 区画は格子の升目に、入れ子は1段 | 中間レポートの箱の中は入れ子を1段（同じファイル）                                                                                                       | 同じ                                                                                                                                |
| 群は余白・器・罫で              | 最終レポートは箱を持たない・節は見出しの罫（2026-10-03）                                                                                                | 板の型では器（区画の枠）が要る。読み物の型は今のまま                                                                                |
| 段階的に開く                    | `fold`（0.4%）・通った検証は畳む                                                                                                                        | 同じ。ただし書き手はほぼ使わない                                                                                                    |
| タブは同時に比べないものだけ    | 無し                                                                                                                                                    | —                                                                                                                                   |
| 色は意味だけ                    | 13.1 の原則（色は状態とキャラクターの持ち物だけ）                                                                                                       | 同じ。見本の棒ごとの色は真似ない                                                                                                    |
| 札は少なく意味のある属性だけ    | `note` の種類を増やさない・`note` は1レポート2個まで                                                                                                    | 同じ向き。札を足すなら数の上限を同じように置く                                                                                      |

## 出典一覧

1. Zenn（lnest_knowledge）「Claude Code Artifacts を検証」 https://zenn.dev/lnest_knowledge/articles/claude-code-artifacts-verification
2. Claude Code Docs, "Share session output as artifacts"（組み込みのデザインのスキル・1枚の HTML・Agent SDK では既定で無効） https://code.claude.com/docs/en/artifacts
3. Observable Framework, "Markdown"（Grids・Cards の節。本文は https://github.com/observablehq/framework/blob/main/docs/markdown.md） https://observablehq.com/framework/markdown
4. shadcn/ui, "Card" https://ui.shadcn.com/docs/components/card
5. Vercel Geist, "Badge" https://vercel.com/geist/badge
6. Stripe Docs, Stripe Apps "Badge" https://docs.stripe.com/stripe-apps/components/badge
7. Stripe Docs, "Design your app"（Stripe Apps の頭・ビューの型） https://docs.stripe.com/stripe-apps/design
8. Atlassian Design System, "Lozenge — usage" https://atlassian.design/components/lozenge/usage
9. Atlassian Design System, "Tabs — usage" https://atlassian.design/components/tabs/usage
10. GitHub Primer, "Label" https://primer.style/product/components/label/
11. IBM Carbon, "Dashboards"（data visualization） https://carbondesignsystem.com/data-visualization/dashboards/
12. IBM Carbon, "Tile — usage" https://carbondesignsystem.com/components/tile/usage/
13. Grafana Docs, "Stat" https://grafana.com/docs/grafana/latest/panels-visualizations/visualizations/stat/
14. Grafana Docs, "Grafana dashboard best practices" https://grafana.com/docs/grafana/latest/dashboards/build-dashboards/best-practices/
15. Datadog Docs, "Widget types" https://docs.datadoghq.com/dashboards/widgets/types/
16. Linear Docs, "Dashboards" https://linear.app/docs/dashboards
17. Apple Human Interface Guidelines, "Layout" https://developer.apple.com/design/human-interface-guidelines/layout
18. Tremor, docs（Visualizations と UI の部品の一覧） https://www.tremor.so/docs/visualizations/tracker
