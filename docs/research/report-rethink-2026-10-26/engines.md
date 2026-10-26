# 描画の器（記述言語とレンダラ）の先例 — 調査メモ

調査日: 2026-10-26。対象: LLM が書いた短い記述から、ブラウザが図・グラフ・表を描くための記述言語・レンダラ・レイアウトエンジンの先例と、LLM が記述を書くときの失敗の型。
数値はすべて出典 URL か、この日に `registry.npmjs.org` / `cdn.jsdelivr.net` から実測したもの。確かめられなかったものは **未確認** と書く。
比較対象となる tsukumo の現状（`report` の JSON 引数に `mermaid` / `graph` / `chart` / `svg` / `timeline` / `stats` / `dimension` / `image` の塊を積む）は、本文の「含意」で参照する。
この文書は調査の記録であって正典ではない。提案の全体は同じ置き場の `index.html`。

---

## 要点（7 つ）

1. **LLM に座標を書かせる器は、どれも「配置を直す往復」を前提にしている。** JSON Canvas（Obsidian）は全ノードに `x,y,width,height` が必須の手動配置で自動配置を持たず（https://jsoncanvas.org/spec/1.0/ ）、LLM に bounding box を書かせる DiagrammerGPT は planner–auditor の往復を要し（https://arxiv.org/abs/2310.12128 ）、VisEval では GPT-4 でも読みやすさの落ちは「text overflow / text overlap」が主因（https://arxiv.org/html/2407.00981v2 ）。tsukumo の `svg`（座標つき図形）はこの型に入る。
2. **「記述は宣言、配置はエンジン」の器なら、最小例は 10〜70 字で済む。** D2 `A -> B -> C` は 11 字、DOT `digraph{A->B->C}` 16 字、Mermaid flowchart 28 字、Mermaid `xychart` 38 字、Plotly の JSON 46 字、tsukumo の `chart` 67 字、Vega-Lite は `$schema` 込みで 230 字（この調査で `JSON.stringify` した最小棒グラフ。Vega-Lite の例は https://vega.github.io/vega-lite/tutorials/getting_started.html ）。
3. **ブラウザだけで動くレイアウトエンジンは、軽い順に dagre（gz 17 KB）・Cytoscape.js（137 KB）・ELK.js（472 KB）・Graphviz WASM（viz.js 588 KB / @hpcc-js 637 KB）。** dagre は `acyclicer: greedy` で戻り辺を反転し compound graph も持つが（https://github.com/dagrejs/dagre/wiki ）、D2 の文書は「dagre は祖先→子孫の辺（コンテナからその子へ）を扱えない」と明記する（https://d2lang.com/tour/layouts ）。ELK layered は cycle breaking を 9 戦略から選べ（https://eclipse.dev/elk/reference/options/org-eclipse-elk-layered-cycleBreaking-strategy.html ）、Graphviz dot だけが `compound=true` でクラスタ境界への辺を描ける（https://graphviz.org/docs/attrs/compound/ ）。
4. **Mermaid 12.2.0 は ELK を同梱して既定にし（v12.0.0 の CHANGELOG）、図は 30 種を超えるが、数のグラフは `xychart` の bar/line と `pie`・`sankey`・`quadrantChart` に限られ、`xychart` は「現在は bar と line の 2 種だけ」と文書が言う**（https://mermaid.js.org/syntax/xyChart.html ）。代償はサイズで `mermaid.min.js` は gz 1.58 MB（実測）。
5. **「少ない数（1〜5 個）を見せる最も軽い表現」について一次情報源は、文字と同じ行に収まるもの（Tufte の sparkline は "word-sized graphics with typographic resolution"、"embedded in a sentence, table, headline"）と、色相でなく濃淡 1 色・区間は最大 5・理想 3 の bullet graph（Few 2013）、精密な値の参照なら表（Few）を挙げる。**（https://www.edwardtufte.com/notebook/sparkline-theory-and-practice-edward-tufte/ 、https://www.perceptualedge.com/articles/misc/Bullet_Graph_Design_Spec.pdf ）
6. **LLM の生成精度は「文法の既知度」で桁が変わる。** Vega-Lite の妥当性は GPT-3.5-Turbo 19.10% に対し GPT-4-Turbo は 90% 超（https://www.arxiv.org/pdf/2401.11255 ）。VisEval で GPT-4 は matplotlib の invalid 3.29% が seaborn では 25.41% に跳ね、pass 率は 75.27%（https://arxiv.org/html/2407.00981v2 ）。独自記法（tsukumo の `graph`・`chart`）は学習済みの文法より不利な側に立つ。
7. **自動修復（実行→直す）は実行エラーをほぼ消すが、見た目は直さない。** Text2Chart31 で 3 回までの書き直しが実行エラー 14.13%→4.5%、ただし色覚対応を満たした図は 33.3%（ChartX は 7.2%）で、著者は「実行の成功はほぼ解けた。焦点を審美・意味・アクセシビリティへ」と結ぶ（https://arxiv.org/html/2506.06175 ）。Text2Vis は批評 1 往復で GPT-4o の pass 26%→42%（https://arxiv.org/html/2507.19969v1 ）。色と配置は LLM に書かせず器の既定に任せる根拠になる。

---

## 1. チャートの記述言語

### 事実

| 器                            | 版                                              | 描ける図                                                                                                                                                                                                                                                  | 最小例の字数（この調査で計測）          | 配置・ラベルの自動化                                                                                                                                                                      | ブラウザだけで動く | サイズ（jsdelivr 実測、min / gz）                      | ライセンス   |
| ----------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------ | ------------ |
| Vega-Lite + Vega + vega-embed | vega-lite 6.5.0 / vega 6.4.0 / vega-embed 7.3.0 | mark 14 種（primitive 11: area, bar, circle, line, point, rect, rule, square, text, tick, geoshape ＋ composite 3: boxplot, errorband, errorbar）。encoding channel 41                                                                                    | 230 字（`$schema` 無しで 170 字）       | 軸・目盛・凡例・スケールは自動。**ラベルの重なり回避は Vega の `label` transform（Vega 5.16 で追加）にあるが Vega-Lite は露出していない**（`label` channel の issue が 2021 年から open） | はい               | 60 + 521 + 258 KB → 計 839 KB / gz 計 284 KB           | BSD-3-Clause |
| Observable Plot               | 0.6.17                                          | Marks の文書の目次で 30 種（Area, Arrow, Auto, Axis, Bar, Bollinger, Box, Cell, Contour, Delaunay, Density, Difference, Dot, Frame, Geo, Grid, Hexgrid, Image, Line, Linear regression, Link, Raster, Rect, Rule, Text, Tick, Tip, Tree, Vector, Waffle） | 69 字（`Plot.barY(data,{x,y}).plot()`） | "Plot tries to provide good defaults for whatever you don't specify"。軸・凡例・軸ラベルは自動。`Plot.auto` はデータの型から mark を選ぶが「挙動が安定していることに頼るな」と明記        | はい               | 209 KB / gz 69 KB（UMD に d3 の必要分を同梱）          | ISC          |
| Chart.js                      | 4.6.1                                           | 9（Area, Bar, Bubble, Doughnut/Pie, Line, Mixed, Polar Area, Radar, Scatter）                                                                                                                                                                             | 76 字                                   | 軸・凡例は自動。canvas 描画                                                                                                                                                               | はい               | 210 KB / gz 71 KB                                      | MIT          |
| Apache ECharts                | 6.1.0                                           | `src/export/charts.ts` で 23 種（Line, Bar, Pie, Scatter, Radar, Map, Tree, Treemap, Graph, Chord, Gauge, Funnel, Parallel, Sankey, Boxplot, Candlestick, EffectScatter, Lines, Heatmap, PictorialBar, ThemeRiver, Sunburst, Custom）                     | 102 字                                  | 軸・凡例は自動。canvas / SVG。tree-shaking 可                                                                                                                                             | はい（SSR も可）   | 1,122 KB / gz 370 KB                                   | Apache-2.0   |
| Plotly.js                     | plotly.js-dist-min 4.1.2                        | 「40 種超」（公式）                                                                                                                                                                                                                                       | 46 字                                   | 軸・凡例は自動。SVG + WebGL                                                                                                                                                               | はい               | 4,834 KB / gz 1,491 KB                                 | MIT          |
| Mermaid（数のグラフ）         | 12.2.0                                          | `xychart`（bar と line のみ、複数系列と凡例あり）、`pie`、`sankey`（CSV 3 列、実験的）、`quadrantChart`、`timeline`、`gantt`、`radar`、`treemap`、`packet` ほか。図の総数は 30 を超える                                                                   | `xychart` 38 字、`pie` 30 字            | 配置は全自動で調整の口は少ない                                                                                                                                                            | はい               | 5,495 KB / gz 1,584 KB（ELK・cytoscape・katex を同梱） | MIT          |

出典:

- Vega-Lite mark: https://vega.github.io/vega-lite/docs/mark.html ／ encoding: https://vega.github.io/vega-lite/docs/encoding.html ／ 最小例: https://vega.github.io/vega-lite/tutorials/getting_started.html ／ Vega label transform: https://vega.github.io/vega/docs/transforms/label/ ／ Vega-Lite の label channel 未実装の例: https://github.com/vega/vega-lite/issues/7882
- Observable Plot: https://observablehq.com/plot/marks/auto （raw: https://raw.githubusercontent.com/observablehq/plot/main/docs/marks/auto.md ）、目次: https://raw.githubusercontent.com/observablehq/plot/main/docs/.vitepress/config.ts 、waffle（0.6.16 で追加、"subdivided into square cells that allow easier counting"）: https://raw.githubusercontent.com/observablehq/plot/main/docs/marks/waffle.md
- Chart.js: https://www.chartjs.org/docs/latest/charts/line.html （目次）、https://www.chartjs.org/docs/latest/
- ECharts: https://raw.githubusercontent.com/apache/echarts/master/src/export/charts.ts 、https://echarts.apache.org/en/feature.html
- Plotly: https://plotly.com/javascript/
- Mermaid: https://mermaid.js.org/intro/ 、https://mermaid.js.org/syntax/xyChart.html 、https://mermaid.js.org/syntax/sankey.html 、xychart の導入は v10.6.0（2023-10-25）: https://github.com/mermaid-js/mermaid/releases/tag/v10.6.0 、venn/ishikawa 11.13.0・wardley/treeview 11.14.0・eventmodeling 11.15.0・cynefin/swimlane 11.16.0・usecase 12.0.0: https://raw.githubusercontent.com/mermaid-js/mermaid/develop/packages/mermaid/CHANGELOG.md （timeline v10.0.1・quadrant v10.2.0・sankey v10.3.0 は二次情報のみで **一次は未確認**）
- 版・ライセンス: `registry.npmjs.org/<pkg>/latest` 実測。サイズ: `cdn.jsdelivr.net/npm/<pkg>/<dist file>` を `Accept-Encoding: gzip` あり/なしで実測。

### tsukumo への含意

- tsukumo の `chart`（labels + series）は最小例 67 字で、Chart.js（76）・Plotly（46）・Vega-Lite（230）と同じ桁にいる。**字数では独自記法の優位はない**。差は「LLM がその文法を学習済みか」（節 4 の数字）と「描ける図の幅」にある。
- 描ける図 7 種（bar/line/pie/arrow/slope/span/share）を自前の SVG で描く現状は、Chart.js の 9 種と同規模だが、軸の目盛・凡例・ラベル衝突の自動化を自分で持つ必要がある。Vega-Lite ですらラベル重なり回避を露出していないので、**この部分は「どの器でも誰かが書く」**。
- 1 枚の HTML に載せる前提で gz を見ると、Plot（69 KB）・Chart.js（71 KB）は現実的、Vega 一式（284 KB）は中、ECharts（370 KB）は重め、Plotly（1.5 MB）と Mermaid 全部入り（1.6 MB）は「既に Mermaid を積んでいるなら追加はゼロ」という見方になる。tsukumo は既に Mermaid を積んでいるので、`xychart`/`pie`/`sankey`/`quadrantChart` は **追加コストなしで今日から使える器** だが、bar/line 以外（slope・span・share のような少数の値の見せ方）は Mermaid には無い。
- Observable Plot の `Plot.auto` は「データの形から mark を選ぶ」唯一の一次実装だが、作者自身が「挙動が変わるので頼るな」と言う。「いつどれを描くか」をエンジンに任せる先例はこれ 1 つで、**判断の基準は器の外（節 3 の Few の 7 関係）に置く方が安定する**。

---

## 2. 図（ノード・エッジ）の記述言語とレイアウト

### 事実

**Mermaid flowchart（12.2.0）**

- v12.0.0 の CHANGELOG: "ELK is now bundled with mermaid and is the default layout algorithm."（https://raw.githubusercontent.com/mermaid-js/mermaid/develop/packages/mermaid/CHANGELOG.md ）。`defaultRenderer` は v12 で削除され、frontmatter の `config: { layout: elk | dagre }` で選ぶ（https://mermaid.js.org/syntax/flowchart.html ）。
- layout/look は flowchart, state, class, ER, requirement, use case, agentflow で有効。ELK の調整口は `mergeEdges`, `nodePlacementStrategy`（SIMPLE, NETWORK_SIMPLEX, LINEAR_SEGMENTS, BRANDES_KOEPF）, `nodePlacementAlignment`（https://mermaid.js.org/intro/syntax-reference.html ）。`@mermaid-js/layout-elk` は `elk.layered` のほか `elk.stress`, `elk.force`, `elk.mrtree`, `elk.sporeOverlap`, `elk.box`, `elk.rectpacking` を持ち、コンテナごとに `@{ algorithm: … }` で変えられる（https://raw.githubusercontent.com/mermaid-js/mermaid/develop/packages/mermaid-layout-elk/README.md ）。
- 入れ子 subgraph の制約: "If any of a subgraph's nodes are linked to the outside, subgraph direction will be ignored. Instead the subgraph will inherit the direction of the parent graph."（https://mermaid.js.org/syntax/flowchart.html ）。
- 最小例 `flowchart LR\n A-->B\n B-->C`（28 字）。

**D2**

- レイアウトは dagre（既定）・ELK・TALA。文書: "We write shims for Dagre and ELK, but some things are fundamental to the layout engines." dagre は「祖先から子孫への接続（コンテナからその子）」を扱えず、コンテナごとの方向指定は TALA だけ、コンテナの幅高は TALA と ELK のみ（https://d2lang.com/tour/layouts ）。
- TALA は closed-source の有償製品（評価は透かし付きで無料）。GitHub リポジトリは **2026-09-07 に archive（read-only）**。乱択ヒューリスティックで seed を変えると別の配置が出る（https://github.com/terrastruct/TALA ）。
- D2 はサーバ側（Go）で描く。ブラウザ単体の公式ビルドは **未確認**。

**Graphviz DOT の WASM**

- `@hpcc-js/wasm` 2.36.0（Apache-2.0）は Graphviz v16.1.0 を包み、`graphviz.dot("digraph G { Hello -> World }")` で SVG 文字列を返す（https://github.com/hpcc-systems/hpcc-js-wasm ）。`dist/graphviz.umd.js` 821 KB / gz 637 KB（wasm 同梱、実測）。
- `@viz-js/viz` 3.31.0（MIT）: `instance().then(viz => viz.renderSVGElement(dot))`（https://github.com/mdaines/viz-js ）。`lib/viz-standalone.js` 1,405 KB / gz 588 KB（実測）。
- dot はクラスタ（`subgraph cluster_*`）を持ち、`compound=true` と `lhead`/`ltail` で「クラスタ境界で辺を切る」描画ができる。"dot only"（https://graphviz.org/docs/attrs/compound/ ）。

**ELK.js**

- 0.12.0、npm の license 欄は `EPL-2.0 OR GPL-3.0-or-later`。`elk.bundled.js` 1,610 KB / gz 472 KB（実測）。Web Worker を標準で支え、ポート（ノード縁の接続点）と入れ子を扱う（https://github.com/kieler/elkjs ）。
- layered の cycle breaking は GREEDY（既定）, DEPTH_FIRST, INTERACTIVE, MODEL_ORDER, GREEDY_MODEL_ORDER, SCC_CONNECTIVITY, SCC_NODE_TYPE, DFS_NODE_ORDER, BFS_NODE_ORDER の 9 つ。"Reversed edges will end up pointing to the opposite direction of regular edges"（https://eclipse.dev/elk/reference/options/org-eclipse-elk-layered-cycleBreaking-strategy.html ）。

**@dagrejs/dagre**

- 3.1.3、MIT。`dagre.min.js` 49 KB / gz 17 KB（実測）。Sugiyama 法（Gansner et al.）。`acyclicer: greedy` で back edge を反転して DAG にする。ranker は network-simplex（既定）・tight-tree・longest-path。compound graph は Sander の方式。「中規模のグラフで速度を優先」（https://github.com/dagrejs/dagre/wiki ）。

**Cytoscape.js**

- 3.34.4、MIT。`cytoscape.min.js` 436 KB / gz 137 KB（実測）。内蔵レイアウトは grid, circle, concentric, breadthfirst, CoSE。fCoSE, Cola, ELK, Dagre, Klay は拡張。compound node（`parent`）を標準で支える。canvas 描画（https://js.cytoscape.org/ ）。

**折り返し（長い主経路を段に畳む）**

- 上のどのエンジンも「主経路が n 節点を超えたら折り返す」操作を一次文書で持たない（dagre・ELK・dot は rank 方向に一直線、Cytoscape の breadthfirst は木）。**未確認**ではなく「文書に無い」。この用途は D2 の `grid` や ELK の `rectpacking` のような別アルゴリズムで近似するか、tsukumo のように自前で持つしかない。

### tsukumo への含意

- tsukumo の `graph`（1 行 1 辺 `A -> B: 語`）は D2 の `A -> B` と同じ文法族で、字数では最短の部類。問題は描く側で、**「主経路 6 節点以上なら自前の折り返し SVG」は、どのエンジンにも無い機能を自前で持つ選択**だと分かる。以前 D2 を外した理由「配置が一列に伸びる」は dagre/ELK/dot 共通の性質であり、エンジンを替えても解けない。
- 既に積んでいる Mermaid 12 には ELK が同梱済みなので、ELK の 9 つの cycle breaking と `mergeEdges`、コンテナごとの `elk.mrtree` などは **追加サイズゼロで使える**。tsukumo が flowchart を除外している理由は、この調査では読んでいない（`docs/` を確認のこと）。
- 入れ子（subgraph）と戻り辺を両方きれいに描く器は、ブラウザ単体では「Mermaid+ELK」か「Graphviz WASM（gz 約 600 KB）」の二択。dagre 単体は軽いが D2 が明記する「コンテナ→子の辺」の穴がある。
- TALA の archive と有償化は、「レイアウトの質」を外部の閉じたエンジンに賭けないという判断を裏づける。

---

## 3. 表と「数直線」など軽い表現

### 事実

- **Tufte（sparkline）**: "small intense, simple, word-sized graphics with typographic resolution"。"graphics are no longer cartoonish special occasions with captions and boxes, but rather sparkline graphics can be everywhere a word or number can be: embedded in a sentence, table, headline, map, spreadsheet, graphic." 縦横比は Cleveland の 45° banking（"hill-slopes averaging 45°"）。"approximately right rather than exactly wrong"（https://www.edwardtufte.com/notebook/sparkline-theory-and-practice-edward-tufte/ ）。
- **Few（bullet graph 仕様、2013-10-10 改訂）**: "developed to replace the meters and gauges that are often used on dashboards"。5 部品 = テキストラベル・1 本の線形スケール・featured measure（棒）・比較値（短い直交線、1〜2 本、任意）・定性区間（2〜5、任意）。"The number of qualitative ranges should be limited to a maximum of five and ideally to three." 色は "Rather than using distinct hues ... encode these ranges as distinct intensities from dark to light of a single hue"（2 区間なら 35%/10% black、3 区間なら 40/25/10%）。"Its linear design ... supports more efficient reading than radial meters."（https://www.perceptualedge.com/articles/misc/Bullet_Graph_Design_Spec.pdf ）
- **Few（表かグラフか）**: 表は個々の値の参照・精密な値が要るとき、グラフは形とパターンを見るとき。「選ぶ基準はメッセージの関係の型」で、時系列・順位・部分と全体・偏差・分布・相関・名義比較の 7 つ（https://www.perceptualedge.com/articles/ie/the_right_graph.pdf 。本文は PDF で全文抽出できず、要約と検索の二次情報で確認。"観測が 20 未満なら表" という数字は二次情報で **一次は未確認**）。
- **Goffin ほか 2014（word-scale visualizations）**: sparkline を一般化した「語の大きさの図」を本文の前後だけでなく行間・余白・重ねで置く設計空間を 6 変数で整理し、"a quantitative analysis that highlights the effect of different placements on readability and text disruption" を示す（要旨: https://vdl.sci.utah.edu/publications/2014_infovis_placement-wsv/ 、PDF: https://vis.cs.ucdavis.edu/vis2014papers/TVCG/papers/2291_20tvcg12-goffin-2346435.pdf 。6 変数の名前と数値は PDF を抽出できず **未確認**）。
- **Harvey balls**: 1970 年代 Booz Allen Hamilton の Harvey Poppel 発。定性比較の表で使う。Unicode の Geometric Shapes（○◔◑◕●、U+25CB/25D4/25D1/25D5/25CF）で書けるがフォント依存（https://en.wikipedia.org/wiki/Harvey_balls ）。
- **Unicode / テキストだけの図**: `spark` は 8 段の block 文字 `▁▂▃▄▅▆▇█` で `spark 0 30 55 80 33 150` → `▁▂▃▅▂▇`（6 字。https://github.com/holman/spark ）。`drawille` は Braille（U+2800 ブロック）で 1 文字 2×4 ドット（https://github.com/asciimoo/drawille ）。箱ひげの文字表現は一次情報源を **確認できず**。
- **waffle**: Observable Plot 0.6.16 で追加。"a waffle is subdivided into square cells that allow easier counting"、人数・日数のような少ない整数向き（https://raw.githubusercontent.com/observablehq/plot/main/docs/marks/waffle.md ）。
- **知覚の順位**: 位置（共通スケール）> 長さ > 角度 > 面積は Cleveland & McGill 1984 を Heer & Bostock 2010 が追試（https://idl.uw.edu/papers/crowdsourcing-graphical-perception ）。誤差の数値はこの調査では **未確認**。Few は円グラフを「角度と面積の比較を強いる」として棒を推す。
- **ブラウザでの軽い器**: HTML の `<table>`、`<meter>` / `<progress>`（ゲージ・レンジ）、CSS だけの横棒、インライン SVG。これらは追加サイズ 0。

### tsukumo への含意

- 「少ない数（1〜5 個）を見せる最も軽い表現」への一次情報源の答えは一貫している: **文字と同じ行に入るもの**。Tufte は sparkline を「語」として文に埋め、Few は radial gauge を捨てて 1 本の線形スケール（bullet）にし、Harvey balls と block 文字は Unicode 1 字で 1 値を表す。tsukumo の `stats`（数の札）と `chart` の `share`/`span` はこの層の表現だが、**別の塊（block）として本文の外に出している**。Tufte/Goffin の系譜なら、本文の行内に置く方が「どれを描くか」の判断が軽くなる（文が主、図は語）。
- Few の bullet graph 仕様は「色は LLM に書かせない」の設計側の先例として使える: 色相でなく 1 色の濃淡、区間は 3 が理想、featured measure は黒。これは **器の既定値として固定すべきもの** で、LLM の引数にする理由が無い。
- 「いつどれを描くか」の基準は Few の 7 関係（時系列・順位・部分と全体・偏差・分布・相関・名義比較）が最も論理的で、表の条件（精密な値・個々の参照）も同じ出典にある。tsukumo の chart `kind`（bar/line/pie/arrow/slope/span/share）を関係の型で言い直すと、LLM への説明が「形」でなく「関係」になり判断が安定する。
- block 文字の sparkline は 6 字で 1 系列を表せるので、`report` の本文（Markdown）に **器を足さずに** 埋められる。解像度が低いので傾向の提示にだけ向く。

---

## 4. LLM が記述を書くときの失敗の型と対策

### 事実

| 研究                                           | 器・文法                                             | 数字                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vega-Lite 生成の評価（arXiv 2401.11255）       | Vega-Lite JSON と Altair                             | 妥当な出力の割合: GPT-4-Turbo は 90% 超、GPT-3.5-Turbo は 19.10%。失敗は構文エラー・部分仕様違反・変数の未エンコード（https://www.arxiv.org/pdf/2401.11255 ）                                                                                                                                       |
| VisEval（IEEE VIS 2024 Best Paper）            | matplotlib / seaborn（Vega-Lite は未評価）           | 2,524 問・146 DB。pass 率 GPT-4 75.27%、GPT-3.5 61.79%、Gemini-Pro 51.59%、CodeLlama-7B 28.17%。GPT-4 の invalid は matplotlib 3.29% → seaborn 25.41%。読みやすさの落ちは "text overflow" "text overlap" と不自然なスケール（https://arxiv.org/html/2407.00981v2 ）                                 |
| nvBench（SIGMOD 2021）                         | VQL → Vega-Lite                                      | 25,750 組・105 領域・図 7 種（bar, pie, line, scatter, stacked bar, grouping line, grouping scatter）（https://github.com/TsinghuaDatabaseGroup/nvBench ）                                                                                                                                          |
| Text2Vis（2025）                               | Python 描画コード                                    | 1,985 問・20 種超。GPT-4o の pass 26% → actor-critic 1 往復で 42%。失敗の上位は実行エラー・データ処理・論理・ラベル欠落/軸/配色（https://arxiv.org/html/2507.19969v1 ）                                                                                                                             |
| "Does It Run and Is That Enough?"（2025）      | matplotlib、Text2Chart31（1,423 問・31 種）と ChartX | 書き直し最大 3 回で実行エラー 14.13% → 4.5%（1 回目が最大の効き、以後逓減）。色覚対応を満たす図は 33.3%（ChartX 7.2%）。手動審査 100 枚中 6 枚に幻覚。総実験費 約 $150（GPT-4o-mini）。結論: 実行の成功は「ほぼ解けた」、残るは審美・意味・アクセシビリティ（https://arxiv.org/html/2506.06175 ）   |
| LIDA（ACL 2023 demo）                          | 複数の grammar                                       | VER（描画エラー率）3.5%（Vega datasets 57 件×5 目標）。候補を多数生成→コンパイルしないものを捨てる→自己一貫性で選ぶ。後者 2 つは「複数回の forward pass が要り高価」と明記（https://arxiv.org/html/2303.02927 ）                                                                                    |
| MermaidSeqBench（NeurIPS 2025 ワークショップ） | Mermaid sequence diagram                             | 132 問。LLM-as-a-judge による Syntax 正答率: Qwen2.5-0.5B 58.90%、Llama3.2-1B 68.98%、Granite3.3-2B 75.27%、Qwen2.5-7B 91.29%、Llama3.1-8B 92.01%、Granite3.3-8B 86.97%（DeepSeek-V3 判定。GPT-OSS 判定では 39.60〜85.97%）。フロンティアモデルの数字は無い（https://arxiv.org/html/2511.14967v1 ） |
| DiagrammerGPT（2023）                          | LLM が entity・関係・bounding box を書く             | planner–auditor の往復で配置を直してから描く。「多数の物体が密に結ばれるときの細かい配置制御」が動機（https://arxiv.org/abs/2310.12128 ）                                                                                                                                                           |
| LayoutGPT（2023）                              | CSS 風の bounding box                                | text-to-image より 20–40% 良く「人間と同程度」。重なり・はみ出しの数値は要旨に無く **未確認**（https://arxiv.org/abs/2305.15393 ）                                                                                                                                                                  |
| SVGenius（2025）                               | SVG を直接書く                                       | 2,377 問・8 タスク・18 指標。「複雑さが上がるとすべてのモデルが系統的に劣化」（https://arxiv.org/abs/2506.03139v1 ）                                                                                                                                                                                |

「LLM に座標を書かせない」の先例: Vega-Lite / Plot / Mermaid / D2 / DOT はいずれも座標を持たない宣言で、配置はエンジン。逆に JSON Canvas は座標必須で自動配置が無い（https://jsoncanvas.org/spec/1.0/ ）。この環境の `tsukumo-figure:figure-capture` スキルも「座標を手で書かずに」を掲げる（スキル一覧の説明文）。
「LLM に色を書かせない」の先例: Few の bullet graph 仕様（1 色の濃淡）、Observable Plot / Vega-Lite の既定スキーム、上の 33.3% という色覚対応率、NL2Color（色を自然言語で直す研究、IEEE VIS 2023: https://content.ieeevis.org/year/2023/paper_v-full-1830.html ）。

### tsukumo への含意

- tsukumo の経験「描画役の別モデルに D2 を書かせると 1 枚 4〜5 分・約 5 万トークン」は、LIDA が「複数候補＋自己一貫性は高価」と書く構造と同じ。文献の対策は **1 往復に限る（Text2Vis）** か **コンパイルしない候補を捨てるだけ（LIDA）** で、tsukumo の `report` ツールが差し戻す仕組み（既に語の表で差し戻している）に parse エラーの差し戻しを足すのが最小の形。
- 失敗の型は 3 層に分かれる: (a) 構文（文法の既知度で 19%〜90% 超）、(b) 意味（軸の取り違え・順序）、(c) 見た目（overflow・overlap・色）。(a) は既知の文法を選べば減り、(c) は器の既定で消せる。**独自記法は (a) を自分で背負う** ので、残すなら「1 行 1 辺」のように LLM が誤りようのない形に限る根拠になる。
- 「execution success is largely solved」のあとに残る問題（色・はみ出し・幻覚）は、tsukumo で言えば `svg` 塊の座標と `chart` の色指定に当たる。この 2 つを LLM の引数から外すのが、文献の示す順序。

---

## 5. 文章の中に小さい図を埋める器

### 事実

| 器                                 | 図の置き方                                                                                                                                                                                                | 単位                               | 出典                                                                                                                                                                                                                                     |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub Markdown                    | ` ```mermaid ` / `geojson` / `topojson` / `stl` のフェンス付きブロック。数式だけ `$…$` のインライン（MathJax）と `$$…$$` のブロック                                                                       | ブロック（数式のみインラインあり） | https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-diagrams 、https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/writing-mathematical-expressions |
| MyST                               | `{figure}` 指示子（番号・キャプション・相互参照・サブ図）、`{mermaid}` 指示子。いずれもブロック                                                                                                           | ブロック                           | https://mystmd.org/guide/figures 、https://mystmd.org/guide/diagrams                                                                                                                                                                     |
| Quarto                             | `{mermaid}` / `{dot}` の実行セル。HTML は JS で描き、PDF/DOCX は Chrome/Edge で PNG 化                                                                                                                    | ブロック（セル）                   | https://quarto.org/docs/authoring/diagrams.html                                                                                                                                                                                          |
| Typst                              | `figure`（image/table/raw を自動判別、kind ごとに番号）。`placement: none` で本文の流れに留まるがブロック                                                                                                 | ブロック                           | https://typst.app/docs/reference/model/figure/                                                                                                                                                                                           |
| Jupyter（nbformat）                | セル = markdown / code / raw。code の出力は `display_data` / `execute_result` の MIME bundle（text/plain, image/png, application/json …）                                                                 | セル（ブロック）                   | https://nbformat.readthedocs.io/en/latest/format_description.html                                                                                                                                                                        |
| Observable notebook                | セルが単位で出力はコードの上に出る。Markdown セル内の `${…}` 補間は文書で **未確認**（取得が 429 で失敗）                                                                                                 | セル                               | https://observablehq.com/documentation/cells/ （未取得）                                                                                                                                                                                 |
| Obsidian Canvas（JSON Canvas 1.0） | ノード = text / file / link / group、全ノードに `x,y,width,height` 必須、辺は `fromNode/toNode` と任意の side。自動配置なし                                                                               | 自由配置（手動）                   | https://jsoncanvas.org/spec/1.0/                                                                                                                                                                                                         |
| Notion                             | inline database は他のブロックと並ぶ 1 ブロックで "Controls and menus for your inline database are hidden until you hover over it"。views は table / list / board / calendar / gallery / timeline / chart | ブロック                           | https://www.notion.com/help/intro-to-databases                                                                                                                                                                                           |
| Tufte / Goffin                     | sparkline・word-scale は「語」として文中に置く。Goffin は行間・余白・重ねの配置を比較し読みやすさと本文の乱れを定量化                                                                                     | インライン                         | 節 3 の出典                                                                                                                                                                                                                              |

読み手への効果について一次情報源が言うこと:

- Tufte: 図を "cartoonish special occasions with captions and boxes" にせず、語や数のある場所ならどこにでも置けると、図が文の一部になる（節 3 の出典）。
- Goffin 2014: 配置は読みやすさと本文の乱れ（text disruption）に影響し、その量は配置の 6 変数で決まる（数値は未確認）。
- Few: 表は精密な値の参照、グラフはパターン。どちらを置くかは読み手の問いで決まる（節 3 の出典）。
- Quarto / MyST / Typst / Jupyter のような「本文の塊の列」は、図に番号とキャプションを与えて **参照できる単位** にする側に立つ。GitHub はインライン描画を数式にしか認めない。

### tsukumo への含意

- tsukumo の `report` は「本文の塊の列（block sequence）」の器で、Jupyter / Quarto / Notion と同じ側にいる。これは書き手（LLM）が「文か図か」をセルごとに決める形で、判断の粒度が粗い代わりに失敗が局所化する。
- 一方、節 3 の一次情報源が「少ない数には語の大きさの図」と言うのは、インラインの器を 1 つ持つことを勧めている。GitHub が数式だけインラインにしたように、**インラインは種類を絞れば成り立つ**（例: sparkline と Harvey ball と bullet の 3 つだけ）。
- 自由配置（JSON Canvas）は人が手で置く前提の器で、LLM に書かせる器としては節 4 の失敗の型にそのまま当たる。`svg` 塊はこの層に属し、残すなら「図形の種類と並びだけを書き、座標は器が決める」に寄せるのが先例に沿う。

---

## 器の比較表

字数は「C/D/E の 3 値の棒グラフ」または「A→B→C」の最小例をこの調査で `JSON.stringify` / 文字列長で計測。サイズは 2026-10-26 に jsdelivr で実測した配布ファイルの gz 後。精度の列は節 4 の出典（該当する直接の測定が無いものは「未確認」）。

| 候補                                                                              | LLM が書く量（最小例の字数）      | 描ける図の種類数                            | レイアウト自動化                                                             | ブラウザだけで動く               | サイズ（gz KB）           | ライセンス                    | LLM の生成精度の目安（出典）                                               |
| --------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------- | ------------------------- | ----------------------------- | -------------------------------------------------------------------------- |
| Vega-Lite（+Vega+vega-embed）                                                     | 230（`$schema` 無しで 170）       | mark 14・channel 41                         | 軸・凡例・スケール自動。ラベル衝突回避は未露出                               | はい                             | 284                       | BSD-3-Clause                  | 妥当率 GPT-4-Turbo >90% / GPT-3.5 19.1%（arXiv 2401.11255）                |
| Observable Plot                                                                   | 69                                | 30 mark                                     | 軸・凡例自動、`Plot.auto` で mark 選択（不安定と明記）                       | はい                             | 69                        | ISC                           | 未確認                                                                     |
| Chart.js                                                                          | 76                                | 9                                           | 軸・凡例自動                                                                 | はい                             | 71                        | MIT                           | 未確認                                                                     |
| Apache ECharts                                                                    | 102                               | 23                                          | 軸・凡例自動                                                                 | はい                             | 370                       | Apache-2.0                    | 未確認                                                                     |
| Plotly.js                                                                         | 46                                | 40 超                                       | 軸・凡例自動                                                                 | はい                             | 1,491                     | MIT                           | 未確認（Text2Vis の Python コードには plotly も含むが分離した数字なし）    |
| Mermaid 数のグラフ（`xychart`/`pie`/`sankey`/`quadrantChart`/`timeline`/`gantt`） | 30–38                             | xychart は bar/line の 2 種。図全体で 30 超 | 全自動、調整口は少ない                                                       | はい                             | 1,584（flowchart と共用） | MIT                           | 未確認（sequence 図の Syntax 59–92%、小型オープンモデル、MermaidSeqBench） |
| Mermaid flowchart（dagre / ELK 同梱）                                             | 28                                | 1（+ subgraph・形・線種）                   | dagre か ELK layered（cycle breaking 9 戦略、mergeEdges）                    | はい                             | 1,584                     | MIT                           | 同上                                                                       |
| D2（dagre / ELK / TALA）                                                          | 11                                | 1 系（+ コンテナ・形・grid）                | dagre は祖先→子孫の辺不可、TALA は有償・closed・リポ archive                 | いいえ（Go。ブラウザ版は未確認） | —                         | MPL-2.0（**未確認**。npm 外） | 未確認（tsukumo の実測: 別モデルで 1 枚 4〜5 分・約 5 万トークン）         |
| Graphviz DOT（`@viz-js/viz` / `@hpcc-js/wasm`）                                   | 16                                | 1 系（dot/neato/fdp/… のレイアウト族）      | dot は戻り辺の反転・クラスタ・`compound` 辺                                  | はい（WASM）                     | 588 / 637                 | MIT / Apache-2.0              | 未確認                                                                     |
| ELK.js（素のエンジン）                                                            | （JSON グラフ、字数は書き方次第） | —                                           | layered・stress・force・mrtree・radial・rectpacking、ポート・入れ子          | はい（Web Worker）               | 472                       | EPL-2.0 OR GPL-3.0-or-later   | —                                                                          |
| @dagrejs/dagre（素のエンジン）                                                    | （JS API）                        | —                                           | layered、`acyclicer: greedy`、compound（限定）                               | はい                             | 17                        | MIT                           | —                                                                          |
| Cytoscape.js                                                                      | （JSON 要素）                     | —                                           | grid/circle/concentric/breadthfirst/CoSE（dagre・ELK は拡張）、compound node | はい（canvas）                   | 137                       | MIT                           | 未確認                                                                     |
| Unicode だけ（block 文字 sparkline・Harvey balls・Braille）                       | 6（`▁▂▃▅▂▇`）                     | 3 種程度                                    | 不要（1 字 1 値）                                                            | はい（フォント依存）             | 0                         | —                             | 未確認（構文が無いので構文エラーは起きない）                               |
| HTML `<table>` / `<meter>` / `<progress>` / CSS 横棒                              | Markdown の表なら 1 行 1 件       | 表・ゲージ・レンジ                          | ブラウザが折り返す                                                           | はい                             | 0                         | —                             | Markdown 表の生成精度は未確認                                              |
| tsukumo 現状 `chart`（labels+series JSON）                                        | 67                                | 7 kind                                      | 自前 SVG（目盛・ラベル衝突は自前）                                           | はい                             | 自前                      | —                             | 未測定                                                                     |
| tsukumo 現状 `graph`（`A -> B: 語`）                                              | 11 と同等                         | 1                                           | mermaid flowchart か、6 節点以上で自前の折り返し                             | はい                             | 自前                      | —                             | 未測定                                                                     |
| tsukumo 現状 `svg`（座標つき図形）                                                | 図形数×座標                       | 任意                                        | なし（LLM が座標を書く）                                                     | はい                             | 0                         | —                             | 未測定。節 4 の「座標を書かせる器」の失敗型に該当                          |

### 確かめられなかったもの（まとめ）

- D2 のライセンスとブラウザ版、Observable notebook の Markdown 内補間、Goffin 2014 の 6 変数の名と数値、Few の「20 未満なら表」、Heer & Bostock の誤差の数値、Mermaid の timeline/quadrant/sankey の導入版（一次）、箱ひげの文字表現の一次情報源、フロンティアモデルでの Mermaid 構文エラー率。
