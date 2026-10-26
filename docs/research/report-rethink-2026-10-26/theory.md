# 表現形式（文・表・グラフ・図）を自動で選ぶことの理論と先例

調査日: 2026-10-26。対象は tsukumo の `report` ツール（塊 21 種・形の札 14 種・機械検査 44 条・`figure` 欄必須）の見直し。
一次情報源の本文を取得して照合した数値だけを書き、取得できなかったものは「未確認」と明記する。
本文を読めた PDF の抽出テキストは調査時の作業用の置き場（`/tmp`）にあり、ここには持ち込んでいない。
この文書は調査の記録であって正典ではない。提案の全体は同じ置き場の `index.html`。

## 要点（7 つ）

1. **自動選択の古典（APT 1986）は「入力＝関係のデータ型（nominal/ordinal/quantitative）と重要度順」「出力＝少数の原始言語の合成」「判定＝expressiveness で候補を絞り、effectiveness（知覚課題の精度順位）で並べる」の 3 段で、名前付きのチャート種を列挙しない。** 原始言語は 6 技法・十数個、合成演算子は 3 つ。Draco の記述では規則は約 200。
   https://courses.ischool.berkeley.edu/i247/f05/readings/Mackinlay_APT_TOG86.pdf / https://idl.cs.washington.edu/files/2019-Draco-InfoVis.pdf
2. **知識を「手続きの規則」ではなく「制約＋重み」にすると、同じ推薦を 1/20 以下の記述量で再現できる。** Draco は CompassQL（命令的コード 4,324 行、うち hard 制約 1,134 行・採点 786 行）を hard 70・soft 110 の制約で再実装し、CompassQL のテスト 17 件すべてで同じ最適解を返した。重みは知覚実験の約 1,100 対から RankSVM で学習し、手調整の 65% に対し 93% の正解率。
   https://idl.cs.washington.edu/files/2019-Draco-InfoVis.pdf
3. **「図を置くか」は個人差が最大の要因で、会話型 UI では 41% が文だけを選び、個人内で 82〜89% 一貫する。** 図を望む人は「直接の答え＋文脈（他の棒・差の注記）」を望む。設計上の推奨は「文脈つきの図を既定にし、個人設定で切れるようにする」。
   https://people.ischool.berkeley.edu/~hearst/papers/vis19wouldyoulikeachartfinal3.pdf
4. **文書では「文か図か」ではなく「図に文をどれだけ載せるか」が問いで、302 名の調査では注釈の最も多い図が最上位、文字のない図が最下位。** 文だけの版は TEXTUAL 群では図だけの版より上位。配置の指針は「統計値は点の近く、傾向はタイトル、軸の説明は軸の近く」。
   https://people.ischool.berkeley.edu/~hearst/papers/tvcg2022.pdf
5. **図が文より優れるのは情報量ではなく計算量（探索・認識・推論のコスト）であり、「任意の図が 1 万語に値するわけではない」。** 位置で情報を束ねて探索を省き、知覚的推論を直接支える図だけが有効（Larkin & Simon 1987）。
   https://mechanism.ucsd.edu/bill/teaching/F12/cs200/Readings/larkin.whyadiagramissometimesworth.1987.pdf
6. **「名前付きの塊」方式と「少数の原始の合成」方式は、表現力と検証のしやすさで逆の性質を持つ。** Vega-Lite は原始 mark 11＋合成 3 と encoding の組で広い範囲を表し、Observable Plot の `auto` は「x/y があるか・単調か・順序か・集約か・size があるか」だけで mark を決める数条の条件分岐で動く（ただし「発見的で変わり得る」と明記）。Slack Block Kit は 21 種のブロックで、tsukumo の 21 種と同じ規模。
   https://vega.github.io/vega-lite/docs/mark.html / https://github.com/observablehq/plot/pull/1238 / https://docs.slack.dev/reference/block-kit/blocks
7. **LLM は「型が決まった少数の選択」（4 種から chart type を選ぶ: zero-shot 79.3%、few-shot 85.7%）は得意だが、設計の好みは人間実験の指針から大きく外れ（DracoGPT）、誤りの 7 割はデータ側（絞り込み・軸の値）で、chart type そのものの誤りは 3 割に満たない。** 効いたのは「段階を分けて 1 つずつ決めさせる」（ChartGPT）と「少数の例」（LLM4Vis、VisEval の one-shot）で、長い規則の列挙が効いたという報告は見つからなかった。
   https://ar5iv.labs.arxiv.org/html/2310.07652 / https://idl.uw.edu/papers/dracogpt / https://arxiv.org/html/2404.17136v1 / https://arxiv.org/html/2311.01920v2

---

## 1. 表現形式の選択の形式理論

### 事実

**Mackinlay, APT（ACM TOG 5(2), 1986, pp.110–141）**
https://courses.ischool.berkeley.edu/i247/f05/readings/Mackinlay_APT_TOG86.pdf

- 2 つの基準。_Expressiveness_: 「言語の文が入力の情報を正確に（all the information and only the information）表せること。余計な情報を表すのは誤りになり得るので危険」。_Effectiveness_: 「出力媒体と人の視覚系の能力を活かすこと」。本論文は effectiveness を「正確に解釈できるか」に限定し、複数の相反する基準の扱いは対象外と明記。
- 入力は関係（relation）。各 domain set は nominal / ordinal / quantitative の 3 型で、入力の並び順が重要度順（Principle of Importance Ordering: 重要な情報ほど効果的に符号化する）。
- 出力は原始言語の合成。基底集合（Fig. 22）は 6 つの符号化技法に分類される: single-position（horizontal axis, vertical axis）、apposed-position（line chart, bar chart, plot chart）、retinal-list（color, shape, size, saturation, texture, orientation）、map（road map, topographic map）、connection（tree, acyclic graph, network）、misc（pie chart, Venn diagram, …）。合成演算子は 3 つ（double-axes, single-axis, mark composition）。
- 効果の順位（Fig. 14）は Cleveland & McGill の実験に基づく量的データの知覚課題の順位（position > length > angle/slope > area > volume > density/color saturation > color hue）。これを ordinal・nominal に拡張した Fig. 15 は「既存の心理物理学の結果と分析で作ったが、経験的には検証していない」と明記。
- 探索は partition → selection → composition の分割統治。「APT は深さ優先探索と単純なバックトラックを使う」。selection では expressiveness で候補を濾し、effectiveness で並べて第一候補を決める。規則の条件に基数が現れる（例: `Cardinality(r) < 20`）。
- 評価は生成例の提示で、利用者実験はない。実装では orientation・texture・line chart・map・misc が未実装。
- Draco 論文の記述: 「元の APT システムは宣言的な論理プログラミング言語で約 200 の規則から成る」。

**Bertin, Sémiologie graphique（1967）**（本文未取得。APT の Fig. 8 に要約が引用されている）

- マーク（点・線・面）と、位置（1-D/2-D/3-D）・時間（アニメーション）・網膜変数（color, shape, size, saturation, texture, orientation）という「符号化の語彙」。APT の原始言語はこの語彙から導かれる。

**Cleveland & McGill（JASA 79(387), 1984）**（一次 PDF は JSTOR のため未取得。追試で確認）

- Heer & Bostock（CHI 2010, pp.203–212）が Mechanical Turk で追試し、「判定の型の精度順位（T1–5）は保たれ」「位置は長さを有意に上回る」。角度（円グラフ）と円面積（バブル）の判定を追加し、さらに矩形面積（ツリーマップ）は「平均では円面積と同じ精度」で、縦横比 1 の矩形の比較が最も悪かった。
  https://homes.cs.washington.edu/~jheer/files/2010-MTurk-CHI.pdf

**Mackinlay, Hanrahan, Stolte, Show Me（IEEE TVCG 13(6), 2007, pp.1137–1144）**
https://www.tableau.com/research/publications/show-me-automatic-presentation-visual-analysis

- 抄録: Tableau に自動提示を組み込んだ「UI コマンドと既定値の統合セット」。VizQL を使い、複数ビューの表（small multiples）の自動生成に拡張。「mark type の自動選択」「1 フィールドを足すコマンド」「複数フィールドからビューを作る 2 つのコマンド」から成る。
- **mark 選択の規則表（フィールドの型と数 → text/bar/line/Gantt/shape …）は本文 PDF が 403 で取得できず、未確認。**
- CompassQL 論文の記述: 「Show Me Alternatives は基本的なチャート種の集合について、それぞれ 1 つの例だけを提示する」（冗長性の削減）。

**Wongsuphasawat et al., CompassQL（HILDA 2016）**
https://faculty.washington.edu/billhowe/publications/pdfs/wongsuphasawat16compass.pdf

- 推薦の流れを「enumerate（データ問い合わせと符号化のパラメータを列挙）→ choose（意図の部分指定と expressiveness 制約を満たすものを選ぶ）→ rank（符号化はフィールドの型×チャネルの知覚効果で、データ問い合わせは統計量で順位づけ）→ group（同じデータ問い合わせの候補を束ね、代表 1 つを出す）」と定式化。
- 入力は「部分指定（partial specification）」で、ワイルドカードが列挙制約になる。Voyager はこれで推薦を表す。
- 実装規模（Draco 論文より）: 命令的コード 4,324 行、うち hard 制約 1,134 行・採点ロジック 786 行。

**Moritz et al., Draco（IEEE TVCG / InfoVis 2019）**
https://idl.cs.washington.edu/files/2019-Draco-InfoVis.pdf

- 入力: 「データセット・部分指定・タスク」。出力: Vega-Lite 仕様（コストの小さい順）。
- 知識は Answer Set Programming の **hard 制約（必ず満たす。例: shape は量的値を表せない）と soft 制約（好み。例: 時間は既定で x 軸）**。soft には重みがあり、「手で調整するか、順位づけされた対から学習する」。
- Draco-CQL は **hard 70・soft 110** で CompassQL のテスト 17 件すべてに同じ最適解を返す。
- 重みの学習: Kim & Heer の実験（1,920 名・185,000 応答）と Saket et al.（180 名）から有意差のある対を集めて約 1,100 対＋10 対。RankSVM で学習し、**テスト正解率 93%（手調整の Draco-CQL は 65%＝ほぼ偶然）**。訓練に要る対は 250 を下回ると性能が落ちる。全 56 条件（48＋8）で最上位の符号化を返す。
- タスクで答えが変わる例: 値の比較なら散布図、カテゴリごとの要約なら空間的に束ねる。

**Yang et al., Draco 2（IEEE VIS Short 2023）**
https://arxiv.org/abs/2308.14247 / https://ar5iv.labs.arxiv.org/html/2308.14247

- 既定の知識ベースは **soft 制約 147**。仕様を Vega-Lite から切り離した「entity と attribute」（mark, encoding, scale, view, task）で表す。全制約に単体テスト。Draco 1 と 100 対で比較し順位が 86% 一致。

| システム       | 入力                           | 出力の候補                                    | 規則の数                             | 評価                         |
| -------------- | ------------------------------ | --------------------------------------------- | ------------------------------------ | ---------------------------- |
| APT 1986       | 関係＋型 3 種＋重要度順        | 原始言語（6 技法）の合成を探索して最初の 1 つ | 約 200（Draco 論文の記述）           | 生成例の提示                 |
| Show Me 2007   | シェルフ上のフィールドの型と数 | 基本チャート種それぞれ 1 つ                   | 未確認                               | 未確認                       |
| CompassQL 2016 | 部分指定（ワイルドカード）     | 列挙→選択→順位→束ね                           | hard 1,134 行・採点 786 行（命令的） | Voyager の利用研究（別論文） |
| Draco 2019     | 部分指定＋データ＋タスク       | コスト順の Vega-Lite                          | hard 70・soft 110                    | 17 件の再現、93% の対の順位  |
| Draco 2 2023   | 同上（描画系に非依存）         | 同上                                          | soft 147                             | 単体テスト、86% 一致         |

### tsukumo への含意

- 古典〜最新のどの系統も、**判定の入力は「データの型・基数・タスク」で、出力は「符号化（mark × チャネル）」**。tsukumo の「形の札 14 種（cause/connection/position/…）」は入力を書き手の解釈（概念の種類）に置いていて、データの型から機械的に決まる APT/Draco の入力とは層が違う。札は書き手の主観で揺れ、同じデータに別の札が付く。
- 「第一候補・許す代替・許さない塊」の表は、Draco の **hard（許さない）/soft（好み）** にそのまま対応する。差は、Draco は soft に重みを持ち「全体で最小コスト」を解くのに対し、tsukumo の表は札ごとに独立で、札をまたいだ衝突の解き方がない。
- 規則の数の相場は「hard 数十・soft 100〜150」。tsukumo の機械検査 44 条は数としては小さいが、検査の対象が「字数・セル長・見出し」など**表現の形**に寄っていて、「データの型と符号化の対応」（expressiveness）を検査するものではない。
- APT が「余計な情報を表す図は誤りになり得る」と expressiveness を定義しているのは、figure 欄で「図を置かない理由」を言わせる現状の逆で、**置かない方が正しい場合を正当化する理論**になっている。

## 2. 「文か図か」の判断

### 事実

**Hearst & Tory, "Would You Like A Chart With That?"（IEEE VIS 2019 short）**
https://people.ischool.berkeley.edu/~hearst/papers/vis19wouldyoulikeachartfinal3.pdf

- Mechanical Turk で 2 研究。Study 1（比較の質問、48 名→有効 45）、Study 2（傾向と最上級の質問、50 名→有効 44）。携帯端末程度の画面を想定。
- 「文だけ」と「文＋図」に参加者が二分され（χ² 検定で有意）、**文だけが選ばれたのは全体で 41%**。個人内の一貫性は 89%（Study 1）、82%（Study 2）。
- 文を選ぶ人は「聞いたことに正確に答え、それ以上を出さない」ことを評価し、文の中では値を示す文（"Weightlifting has 15 events, compared to Taekwondo's 8."）が最も好まれた。直接の答えだけの文は「単純すぎ」、差まで計算した文は「分かりにくい」。
- 図を選ぶ人は、2 本の棒より多数の棒（文脈）を、さらに差を注記した図を好んだ（「数が近いので自分で計算したくない」）。人口の質問では 3 本の線（近隣国を含む）が 1 本の 2 倍選ばれた。
- 結論: 「図を含めるのが適切かは、他の要因より個人の好みで決まる」。設計への示唆は「文脈を含む図を既定にし、提示形式と情報量を個人設定・学習で変えられるようにする」。

**Setlur & Tory（CHI 2022）** https://arxiv.org/abs/2203.08420

- Wizard of Oz 30 名＋3 種のチャットボット（文＋図、音声＋図、音声のみ）30 名。Grice の 4 公理（量・質・関係・様態）を分析的会話に当て、「意図の解釈」「データ志向」「適切な応答による信頼」を示唆。

**Stokes & Hearst, "Why More Text is (Often) Better"（NLVIZ 2022）**
https://people.ischool.berkeley.edu/~hearst/papers/nlviz2022.pdf

- 2,000 件超の自由記述から 3 テーマ: (1) 情報を足す有用性と「ごちゃつき」の緊張。**冗長でなく文脈を足す情報は強く好まれる**。(2) 文には物語の構造があり、それを好む人は文の形式を選ぶ。(3) 一部の参加者が表示情報の偏りを自発的に指摘。

**Stokes, Setlur, Cogley, Satyanarayan, Hearst, "Striking a Balance"（IEEE TVCG 2023, DOI 10.1109/TVCG.2022.3209383）**
https://people.ischool.berkeley.edu/~hearst/papers/tvcg2022.pdf

- 302 名。1 変量の折れ線に載せる文の量を「文字なし」から「文だけの段落」まで変えて順位づけ。
- **注釈の最も多い図が最上位。文字のない図とタイトルだけの図が最下位。** TEXTUAL 群は文だけの版を図だけの版より上位に置いた。
- 指針 4 つ: (1) 最小主義を目指さず関連する文で注釈する。(2) 文の意味内容は伝えたいメッセージで決める（統計値の注記は統計の読み取りを増やす。軸の説明は増やさない）。(3) **配置は内容で決める: 軸と符号化の説明は軸の近く、統計値・数値は該当する点の近く、傾向やパターンはタイトル、外部の文脈は該当する点の近く。** (4) 単独で成立する文だけの版を用意する。

**Larkin & Simon, "Why a Diagram is (Sometimes) Worth Ten Thousand Words"（Cognitive Science 11, 1987, pp.65–100）**
https://mechanism.ucsd.edu/bill/teaching/F12/cs200/Readings/larkin.whyadiagramissometimesworth.1987.pdf

- 「2 つの表現は、一方の情報がすべて他方から推論でき、逆も成り立つとき**情報的に等価**。さらに、一方で容易・迅速に引ける推論が他方でも容易・迅速なら**計算的に等価**」。
- 文的表現はリストの位置で索引され、図的表現は平面上の位置で索引される。コストは search・recognition・inference の 3 つ。図は「一緒に使う情報を位置で束ねて探索を省く」「記号のラベル照合を省く」「人に容易な知覚的推論を支える」。
- 結論の但し書き: 「これらの点は、任意の図が 1 万語に値することを保証しない。有用であるには、図はこれらの特徴を活かすように構成されていなければならない」「図の利点は計算的なものであり、情報を多く含むからではない」。

**Tukey の 4 原則（Gelman & Unwin 2013, JCGS が引用）** https://stat243.berkeley.edu/fall-2024/units/graphics_files/gelmanUnwin2013.pdf

- 「図は定性的・記述的なもののためであり、**精密に定量的なもののためには決してない（表の方が得意）**」「図は比較のためであり、**個々の量へのアクセスのためではない**」。Gelman & Unwin は「数を調べるには表、という点は正しいが現代の計算環境では基本的に時代遅れ」と注釈し、「1 つの図に詰め込むより 2 枚以上に分ける」を勧める。

**Few, Show Me the Numbers（2004/2012）**（本文は未取得。複数の二次資料の要約で一致）

- 表: 個々の値を調べる・個々の値を比べる・精密な値が要る・単位が複数・要約と詳細を同時に見せる。図: 観測が多い（20 超）・全体の傾向や分布・変数間の関係（変化・差・類似・例外）。

**Tufte, VDQI**: 「20 個以下の小さなデータ集合では表が図を上回る」（p.56 とされる）は**二次資料でしか確認できず未確認**。別の二次資料は「100 個未満」と引く。

**FT Visual Vocabulary** https://github.com/Financial-Times/chart-doctor/blob/main/visual-vocabulary/README.md

- 9 カテゴリ: Deviation（固定の参照点からの ±）、Correlation（2 変数以上の関係）、Ranking（順位が値より重要）、Distribution（値と頻度）、Change over Time（傾向の強調）、Part-to-whole（構成要素への分解）、Magnitude（大きさの比較）、Spatial（位置が何より重要なときだけ）、Flow（状態間の移動の量）。チャート種は 60 種以上（数え方で異なる）。選び方は「見せたい関係」から入る。

**Abela, Chart Chooser（2006）**（原ページは消失。FlowingData 2009 の記述で構造を確認）https://flowingdata.com/2009/01/15/flow-chart-shows-you-what-chart-to-use/

- 中央の問い「何を見せたいか」→ comparison / distribution / composition / relationship の 4 つ → 変数の数・項目間か時間か・期間や項目の多少・静的か変化か、で枝分かれ。

**Amar, Eagan, Stasko（InfoVis 2005）** https://perso.telecom-paristech.fr/eagan/media/papers/amar05.pdf

- 低レベルの分析タスク 10: Retrieve Value, Filter, Compute Derived Value, Find Extremum, Sort, Determine Range, Characterize Distribution, Find Anomalies, Cluster, Correlate。

### tsukumo への含意

- 「図を置かない理由」を enum（short-answer/no-shape/single-value/no-material）で必ず言わせる現状は、**実証では「置かない」が 4 割の人の既定**であることと噛み合わない。Hearst & Tory の推奨は「文脈つきの図を既定にし、利用者が切れる」で、書き手に毎回の正当化を要求する形ではない。tsukumo の利用者は 1 人なので、**figure 欄は利用者側の設定（図を好む/文を好む）に置き換え得る**。
- 文で答えるときの最適形は「値を含む 1 文」（Hearst & Tory）。tsukumo の `text` と `stats` の間に「値つきの短い答え」があれば、2 値の比較は図でなくそれで足りる。
- 図を置くなら「図だけ」は最下位（Stokes 2023）。**図＋点の近くの数値注記＋タイトルに傾向**が最上位で、tsukumo の `chart` に「注記（値・差）」と「タイトルに傾向の 1 文」を必須に近い既定として持たせる方が、chart 種を増やすより効く。
- Larkin & Simon の基準は「図を置く条件」を機械的に書ける: **(a) 読者が複数の要素を一緒に見比べる必要があり、(b) 文だと探索（スクロール・照合）が要り、(c) 知覚的推論（長さ・位置の比較）に置き換えられる**とき。1 値・2 値の比較は (a) を満たさないので文。
- Tukey/Few の線引き（精密な値→表、比較・傾向→図、少数→文）は tsukumo の現状の塊 (table 2066・text 1899・chart 330) の偏りと整合していて、**偏りは不具合ではなく理論どおり**である可能性が高い。レポートの中身（作業の結果・差分・判断）は「個々の値を正確に読む」場面が多い。

## 3. 文章と図の統合

### 事実

**Kong, Hearst, Agrawala（CHI 2014）** https://www2.eecs.berkeley.edu/Pubs/TechRpts/2013/EECS-2013-212.html（論文 PDF は証明書切れで未取得。博士論文の抄録と ACM の書誌で確認）

- クラウドワーカーに段落と図の対を与え、文の語句と図のマークを選ばせ、クラスタリングで統合して「文と図の参照」を抽出。応用は「文の語句を選ぶと図の該当マークが強調される」対話的文書。
- 配置そのものについての知見は未確認。

**Latif, Zhou, Kim, Beck, Kim, Kori（IEEE TVCG 28(1), 2022）** https://arxiv.org/abs/2108.04203 / https://ar5iv.labs.arxiv.org/html/2108.04203

- 動機: 「文と図をまたいで情報を統合するのは難しく、読者は注意を頻繁に移さねばならない」（split-attention）。
- 設計空間: 参照先は「個々のマーク／マークの集まり／傾向／軸や凡例」、参照の仕方は「明示の値／エンティティ名／傾向の語」。
- 77 記事・110 段落–図対から **676 の最小参照（点 366・複数点 294・区間 16）**。自動提案の F1 は 0.34（点 0.47）。11 名の研究で有用性の中央値 5/5、ただし**手で作る参照の方が自動提案より好まれた**。
- 配置の指針は示さず、対話的なリンクで注意の分断を減らす方針。

**Masson, Malacria, Casiez, Vogel, Charagraph（CHI 2023）** https://dl.acm.org/doi/10.1145/3544548.3581091（本文は 403。Semantic Scholar の抄録で確認）

- 「段落に詰め込まれた数は取り出し・比較・解釈が難しい」。文中の数値を選んで**その場（in situ）に対話的な図を生成**し、文と図を同期させる。参加者は Charagraph を使うと**文だけより正確に**データの質問に答えた。

**Stokes et al. 2023 の指針 3**（上記）: 統計値・数値は該当する点の近く、傾向はタイトル、軸の説明は軸の近く、外部の文脈は該当する点の近く。

### tsukumo への含意

- 研究が一致して指すのは「**図は、それを参照する文の直下（または文中）に置き、文の数値と図のマークを対応づける**」こと。Kori の 676 参照のうち 366 が「点」への参照で、文は図の個々の値を指して書かれる。tsukumo の節構造（text の後に figure）はこれに合うが、**本文の数値と図の値の一致**を検査する条はあっても、「どの文がどの図を参照しているか」の対応は持たない。
- Charagraph の結果は「数が段落にあるなら、その場で小さな図にすると正確さが上がる」で、本文中のインライン表現（数直線・小さな棒）が別立ての figure より理に合う場面があることを示す。
- 自動提案より手作りが好まれた（Kori）のは、LLM が書き手である tsukumo では「書き手自身が参照を明示する」形（文中の値に印を付け、図のマークと結ぶ）が最も自然であることを示す。

## 4. 意図ベースの文法と「名前付きの塊」

### 事実

**Vega-Lite（Satyanarayan, Moritz, Wongsuphasawat, Heer, IEEE TVCG/InfoVis 2017, Best Paper）** https://idl.uw.edu/papers/vega-lite / https://vega.github.io/vega-lite/

- 「仕様はデータからマークの性質への encoding の対応として可視化を記述する」「層・複数ビューへの合成（layer, facet, concat, repeat）と、selection による対話」。コンパイラが軸・凡例・スケールを自動生成。
- mark は **原始 11**（area, bar, circle, line, point, rect, rule, square, text, tick, geoshape）**＋合成 3**（boxplot, errorband, errorbar）。
  https://vega.github.io/vega-lite/docs/mark.html

**Observable Plot `auto`（PR #1238, 2023）** https://github.com/observablehq/plot/pull/1238 / https://raw.githubusercontent.com/observablehq/plot/main/src/marks/auto.js

- 「どの mark で見たいかではなく、データのどの次元を見たいかを指定する」shapeshifter。入力は x, y, fx, fy, color, size の 6 チャネル（値か reducer）。
- 実装の条件分岐: size があれば dot。集約（count などの zero-reducer や color の集約）があれば bar（軸の片方が順序なら barX/barY、両方順序なら cell、連続なら rect）。x と y が両方あり、どちらかが順序か両方非単調なら dot、そうでなければ line。片方だけなら rule。
- 「発見的手法は進化し、変わっても破壊的変更とは見なさない」「文書化しない」と明記。

**Slack Block Kit** https://docs.slack.dev/reference/block-kit/blocks

- ブロック種は **21**（Actions, Alert, Card, Carousel, Container, Context, Context actions, Data table, Data visualization, Divider, File, Header, Image, Input, Markdown, Plan, Rich text, Section, Table, Task card, Video）。1 メッセージ 50 ブロックまで。

**McNutt, "No Grammar to Rule Them All: A Survey of JSON-style DSLs for Visualization"（IEEE VIS 2022）** https://arxiv.org/abs/2207.07998

- 57 の JSON 系 DSL と 4,395 例を分析。設計の緊張として「形式的か口語的か」「利用者の多様性」「言語の合成」「**テンプレート（タスク特化の型）は単純さ、文法（合成）は柔軟さ**」を挙げる。

**Draco の記述量の比較**（1 節）: 同じ推薦を、命令的コード 4,324 行 → 制約 180 本。

### tsukumo への含意

- tsukumo の 21 種は Slack Block Kit と同じ「名前付きの塊」方式で、**学習は容易（名前を選ぶだけ）だが、表現力は列挙した分しかなく、検証は塊ごとに別条が要る**（44 条が塊別に増えてきた構図）。chart の 7 種も同じで、新しい形（例: 数直線）は塊を足すしかない。
- 合成方式（mark × encoding）なら、「bar/line/pie/arrow/slope/span/share」は **mark（bar, line, point, rule, arc）× encoding（x, y, color, x2）** の組で表せ、検査は「型 × チャネル」の expressiveness 規則（Draco の hard 制約相当、数十本）で済む。ただし JSON Schema は深くなり、LLM の出力の自由度が上がるぶん誤りの面も広がる（5 節）。
- 中間の形が Plot.auto: **書き手は「x に何・y に何・色に何・集約は何」だけを言い、mark は決定表で決まる**。tsukumo で言えば「札」を書き手に選ばせる代わりに、**データの列の型と基数を書かせて形は機械で決める**。Plot.auto の条件分岐は 10 行弱で、tsukumo の 14 札 × 3 列の表より小さい。
- Draco の経験則（hard 数十・soft 100 強で手続きの 1/20 の記述量）は、「44 条の機械検査」を**表現の形の検査から、型と符号化の整合の検査へ**置き換える方向を支持する。

## 5. LLM の「選択の判断」の精度（2023〜2026）

### 事実

**Vázquez, "Are LLMs ready for Visualization?"（IEEE PacificVis 2024）** https://arxiv.org/html/2403.06158v1

- 29 種のチャート × 3 ライブラリ（Plotly, Matplotlib, Altair）。ChatGPT-4 が約 79.17% を正しく生成（検索結果の要約の数値。本文は未取得）。
- 続報 **Ribalta-Albado & Vázquez, "Evaluating LLMs' abilities to create charts, a systematic approach"（Computers & Graphics 135, 2026, 104544）** https://upcommons.upc.edu/bitstreams/8affb1f2-df9f-4c5c-a0c9-6c0b1af20019/download（本文を取得）: 29 チャート × 3 ライブラリ × 5 回＝435 サンプルで平均成功率 64.7%（Plotly 最大 76.8%）。「最良のモデルでも 75% に届かない」「**グループ棒・積み上げ棒・積み上げ面は 26〜50%**」「ピクトグラムは約 12%」「ヒストグラムは全 LLM で約半分失敗」。一方「**視覚変数の設定（色・ラベルなど）はかなり良く機能する**」。誤りは API 誤用・存在しない引数・データと合わないラベルなど多様で「パターンがない」。GPT-4（Bing）と GPT-4o の差は「ほぼなし」。

**VisEval（Chen et al., IEEE VIS 2024）** https://arxiv.org/html/2407.00981v2

- 2,524 問・146 DB・7 チャート種。評価軸は validity（実行できる）・legality（データ・チャート種・並び順が指示どおり）・readability（重なり・スケール）。
- 合格率: **GPT-4 75.27%、GPT-3.5 61.79%、Gemini-Pro 51.59%、CodeLlama-7B 28.17%**。失敗の類型: 実行不能、データ変換（結合・集約）、対応づけ（チャート種・凡例）、並び順、可読性（文字のはみ出し・不自然なスケール）。
- プロンプト: タスク説明＋表の要約＋**one-shot の例**を含む構成が最良。

**LLM4Vis（Wang et al., EMNLP 2023 Industry）** https://ar5iv.labs.arxiv.org/html/2310.07652

- VizML から 4 種（line, scatter, bar, box）の選択。テスト 100 対。**zero-shot Hits@2 79.3%、few-shot（例を動的に取得）85.7%**。Random Forest 78.7%、Decision Tree 68.3%、MLP 78.7%（5,000 例で学習）。box plot の予測が手法により 24.0〜97.2% と不安定、scatter は 86〜100%。

**NL2VIS の探索的研究（arXiv 2404.17136, 2024）** https://arxiv.org/html/2404.17136v1

- nvBench（25,750 対、bar/pie/line/scatter の 4 種）。領域外で GPT-4 は厳密一致 61%・実行一致 72%。**誤りの 73.8% はデータ側（絞り込み 35.6%、y 軸の指定）、視覚側は 26.2%**。Chain-of-Thought で実行一致 +9.3%、役割の指定 +12.8%、自己修復（GPT-4）+13.3%。例示は多様な DB からの例で 45%→49%。

**ChartGPT（Tian et al., IEEE TVCG 2024）** https://arxiv.org/html/2311.01920v2

- 抽象的な発話からの生成を **6 段（列の選択→行の絞り込み→集約→チャート種→符号化→並び順・色）に分解**し、各段を微調整したモデルで解く。1,916 組のデータ。「段ごとに出力を限定することで幻覚を抑える」。

**DracoGPT（Wang, Gordon, Battle, Heer, IEEE TVCG / VIS 2025）** https://idl.uw.edu/papers/dracogpt

- LLM に符号化の順位づけ・推薦をさせ、Draco の制約で好みをモデル化。**順位づけと推薦は互いに中程度しか一致せず、どちらも人間実験から導かれた指針から大きく外れる**（特に要約・集約を伴うタスク）。「LLM を設計の助言者として信頼するには注意が要る」。

**推薦器の学習データの偏り（arXiv 2203.04937, 2022）** https://arxiv.org/pdf/2203.04937

- VizML の訓練データ（Plotly の公開フィード）は少数のチャート種に偏り、「カテゴリデータはほぼ常に棒グラフ」で、残りの 12 種はほとんど推薦されない。

### tsukumo への含意

- LLM が得意なのは **「型の決まった少数の選択肢から 1 つ選ぶ」**（4 種で 80〜86%）と **「視覚変数の設定」**。不得意なのは **データの整形（絞り込み・集約・軸の値）と、積み上げ・グループなど構造のある図**。tsukumo で chart 330 件に対し timeline 9・svg 67 と偏るのは、構造のある図を避ける LLM の性質と一致する。
- 「ルールで縛る」と「例で示す」のどちらが効いたか: 本調査の範囲で、**長い規則の列挙が精度を上げたという報告は見つからなかった**。効いたのは (a) 段階の分解（ChartGPT）、(b) 少数で多様な例（LLM4Vis、VisEval、nvBench 研究）、(c) 自己修復（+13.3%）。tsukumo の「44 条で差し戻す」は (c) に相当し、差し戻し率 805/4652 ≈ 17% は自己修復の経路として機能している。一方 22,000 字の Schema と 14 札の表は (a)(b) のどちらでもない。
- DracoGPT の結果は、**「どの形が良いか」の判断を LLM の好みに任せると人間実験の指針から外れる**ことを示す。判断は機械の決定表（データの型・基数→形）に置き、LLM には「データの型・基数・比べたい軸」を申告させる方が、理論（1 節）とも LLM の得手（型の決まった選択）とも合う。
- 誤りの 7 割がデータ側なら、検査の重心は「本文の数値と図の値の一致」「集約の単位」「軸の型」に置くべきで、字数やセル長の条より効く。

---

## 判断基準の候補: データの形 → 表現 の決定表

理論から組んだ案（APT の expressiveness で候補を絞り、Cleveland & McGill/Heer & Bostock の順位で第一候補を決め、Hearst & Tory・Stokes・Tukey/Few の実証で「文か表か図か」の境を引く）。
入力は書き手が申告する **列の型（N: 名義 / O: 順序 / T: 時間 / Q: 量）・基数（値の数）・比べたい関係（Amar の 10 タスクから）** の 3 つで、札は使わない。
各行の「必須の注記」は Stokes 2023 の指針 3 による。

| #   | データの形（型・基数）                | 読者の課題                | 第一候補                            | 代替                       | 置かない形  | 必須の注記                      |
| --- | ------------------------------------- | ------------------------- | ----------------------------------- | -------------------------- | ----------- | ------------------------------- |
| 1   | Q 1 値                                | Retrieve Value            | 値つきの 1 文                       | stats（1 枡）              | chart       | 単位                            |
| 2   | N 2 × Q 1（2 値の比較）               | 比較                      | 値つきの 1 文（両方の値）           | 棒 2 本（差を注記）        | pie         | 差                              |
| 3   | N 3〜7 × Q 1                          | 比較・Find Extremum       | 棒（位置で比較）                    | 表                         | pie, 面積   | 最大・最小の値                  |
| 4   | N 8〜20 × Q 1                         | Sort・Rank                | 並べ替えた棒                        | 表（並べ替え）             | pie, 折れ線 | 上位の値                        |
| 5   | N 20 超 × Q 1                         | Characterize Distribution | ヒストグラム/箱ひげ                 | 表（要約統計）             | 棒（全件）  | 中央値・範囲                    |
| 6   | N × Q 1（全体に対する割合、部分 ≤ 5） | Part-to-whole             | 積み上げ棒 1 本 または 割合つきの表 | pie（部分 ≤ 3）            | 多数の pie  | 各部分の %                      |
| 7   | T（単調）× Q 1、点 ≥ 5                | 傾向                      | 折れ線                              | 表（点 < 5 なら表）        | 棒、pie     | タイトルに傾向の 1 文、終点の値 |
| 8   | T × Q 1、点 2（前後）                 | 変化                      | 値つきの 1 文（前→後、差）          | 矢印/slope                 | 折れ線      | 差と %                          |
| 9   | N 2〜4 × T × Q 1                      | 傾向の比較                | 複数系列の折れ線（系列 ≤ 4）        | small multiples            | 積み上げ面  | 系列名を線の端に                |
| 10  | Q × Q（2 変数の関係）                 | Correlate・Find Anomalies | 散布図                              | 表（点 < 10）              | 折れ線      | 外れ値の名                      |
| 11  | N × N × Q（2 軸のカテゴリ）           | 照合                      | 表（matrix）                        | ヒートマップ（セル ≥ 30）  | 棒の群      | 最大セルの値                    |
| 12  | 項目 × 属性（複数の単位）             | Retrieve Value・Compare   | 表                                  | —                          | chart       | 単位を列見出しに                |
| 13  | 節点と辺（依存・流れ）                | 構造の把握                | 図（連結: tree/graph）              | 入れ子リスト（節点 ≤ 7）   | 表          | 節点名                          |
| 14  | 順序のある手順（T を持たない O）      | Order                     | 番号つきリスト                      | timeline（時刻があるとき） | chart       | —                               |
| 15  | 区間 × 項目（開始・終了）             | 重なり・順序              | span（ガント）                      | 表（項目 ≤ 3）             | 折れ線      | 期間の長さ                      |

補足:

- 「文」を第一候補にする行（1・2・8）は Hearst & Tory（値を含む文が最も好まれ、41% は図を望まない）と Tukey（個々の量へのアクセスは表・文）に基づく。基数の境（3・5・7・20）は Few の「20 超は図」、APT の規則に現れる `< 20`、pie の部分数の慣例に基づく目安で、**実証された閾値ではない**。
- 「置かない形」は expressiveness の違反（順序のない N に折れ線、Q に面積、部分が多い pie）で、Draco の hard 制約に相当し、機械検査の対象にできる。
- どの行でも「図だけ」は不可（Stokes 2023 で最下位）。注記の列を必須にすれば、現状の「figure 欄で置かない理由を言わせる」は不要になる。
- 利用者の既定（図を好む/文を好む）を 1 つ持ち、第一候補が「文」の行では図を出さず、「図」の行では利用者が文派なら代替の表・文に落とす。これが Hearst & Tory の「個人設定」の最小の実装になる。

## 取得できなかった一次情報源（未確認の項目）

- Show Me 論文本文（mark 選択規則の表）: tableau.com が 403。
- Cleveland & McGill 1984 本文: JSTOR。Heer & Bostock 2010 の追試で順位を確認。
- Tufte VDQI の「20 個以下は表」: 二次資料のみ。
- Few, Show Me the Numbers の原文: 二次資料の要約で一致を確認。
- Kong et al. 2014 の論文本文（利用者研究の結果）: PDF サーバの証明書切れ。博士論文の抄録で代替。
- Charagraph 本文: ACM が 403。Semantic Scholar の抄録で代替。
- Abela 2006 の原ページ: 消失。FlowingData の記述で構造を確認。
