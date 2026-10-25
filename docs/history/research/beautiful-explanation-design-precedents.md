# 美しく分かりやすい説明・報告の意匠の先例と、その具体値（2026-10-17）

**この文書は調査の記録であって正典ではない。** `docs/` の他ファイルにある「節の索引」はここには作らない。
画面の値と色の正典は `docs/architecture/screen-design.md` と `src/browser/styles/theme.css`、表示物の仕様の正典は
`docs/architecture/display.md` で、**採用が決まるまでコードは1行も変わらない**。

**主題**: 読み物・説明として美しく分かりやすいと広く参照される先例が、何の寸法と規則で「読みやすさ・美しさ」を作っているか。
既存の調査（`report-structure-for-skimming-readers.md` の NN/g・Tufte・Butterick、`japanese-screen-typography.md` の JLReq・デジタル庁の字、
`dark-ui-color-and-status-semantics.md` の APCA・状態色、`agent-report-ui-patterns.md` のエージェント製品）の中身は重ねず、その先の層
（字の段と余白の体系・図と文の統合・暗い面の実物の値）を取る。

**出典の印**: 無印は一次情報（原典・公式のページ・公式の配布物）に当たったもの。**【実測】**は実物の配布 CSS を 2026-10-17 に読んだ値、または
headless Chromium（1400×900）で計算済みスタイルを測った値。**【二次】**は二次情報しか見つからなかったもの。**【換算】**は私の計算
（コントラスト比は WCAG 2 の式、字数は 1 全角 ≒ 1em ≒ 半角 2 字）で、原典には無い。

## 要点（10行以内）

1. 美しいと参照される読み物は、どれも**本文を先に決め、残りをその比で決める**（iA・Bringhurst・Butterick）。本文の値は狭い帯に収まる: 欧文の製品で 15〜17px・行間 1.5〜1.75・列 600〜700px（Linear 17/27.2px・606px、Observable 17px/1.5・640px、Tailwind prose 16/28px・65ch）、和文の読み物で 16〜18px・行間 1.75〜1.8・全角 34〜38 字（note・日経・NHK）。tsukumo の 15px/1.75・42 字はこの帯の中にある
2. 先例と tsukumo の差は値の大小より**段の作り方**にある。Linear・Tailwind・Stripe docs は**本文を見出し・太字より一段暗い字にし、拾わせる字だけを最も明るくする**（Linear は本文 13.6:1・見出しと太字 18.7:1【換算】）。tsukumo は本文 12.8:1・見出し 12.6:1 で、見出しのほうがわずかに暗い
3. 余白は「近いものは近く」の1則で決まる。見出しの上のあきは下の **2.7〜4.7 倍**（Linear 56/12px・note 54/18px・Tailwind の h3 32/12px）。行送りとあきは 4px か行送りの整数倍に揃える（M3・Geist の行送りはほぼすべて 4 の倍数、Bringhurst 2.2.2「測った間隔で足し引きする」）
4. 静かな暗い面の罫は **1.3:1 前後**（Linear 1.30・Obsidian 1.35【換算】）。tsukumo の表の行罫 `--rule` は 2.54:1 で倍近い。表の1列目は**左の余白を 0 にして本文の左端に揃える**（Observable・Tailwind・Linear）
5. 図の題は**主張の1文＋何をどう測ったか**の2段（Datawrapper の title と description、SWD の takeaway title、Nature の legend は「短い題の1文で始め 300 語未満」）。題は左揃え（Datawrapper「中央揃えを避ける」・Linear・Observable）。凡例より直接ラベル
6. 図と文の統合の頂点は Distill と Tufte の**余白の柱**: 本文の列の外に 12〜16px の注と題を置き、本文の流れを切らない。tsukumo の 1400×900 では本文の右に約 377px が空いている【換算】
7. 操作に意味を置かない。Victor「対話は information software の本質的に負の側面」、ONS「対話の機能はたいてい触られない」、NYT の Tse「tooltip は誰も見ないと思え」【二次】
8. 密度は**空間と時間あたりに読み手が得る価値**（Ström）。詰めるか空けるかではなく、1画面・1秒あたりに得るもので測る

## 1. 知見: 読み物として美しいと評価される説明の設計

### 1.1 Distill（`template.v2.js` に埋め込まれた CSS を読んだ【実測】）

- **格子**: 幅 1180px 以上で 60px×12 列・溝 32px。本文の列（text）は 8 列で **704px**、右の 2 列（gutter）は **152px** で注・脚注・小さな図に使う。1000〜1179px は 50px・溝 16px（本文 512px）、768〜999px は 45px・溝 16px（本文 472px）。図は本文より広い段（middle 888px・page 1072px・screen 全幅）を選べる
- **本文**: 幅 1024px 以上で 1.06rem（≈17px）・行間 1.7em、字は `rgba(0,0,0,.8)`。段落と箇条のあきは 1em、**箇条の項目どうしも 1em**、箇条の字下げ 24px
- **見出し**: h2 は 36px・600・行間 1.25、上 2rem・下 1.5rem、**下に 1px の罫（黒 10%）と 1rem の余白**。h3 は 20px・700、上 2em・下 1em。節（section）の上下は 60px
- **注と題**: 余白の柱の aside は 12px・行間 1.6em・字は黒 60%。figcaption は 12px（1024px 以上で 13px）・行間 1.5em・黒 60%、**題の中の太字だけ黒 100%・600**（先頭の太字が題の名前になる）
- **表**: 15px・セル余白 2px 8px。**縦罫なし**、見出し行の下は黒 20%、データ行の下は**黒 5%**、最終行は罫なし。リンクは下線の代わりに 1px の下罫（黒 40%、hover で 80%）
- 公式ガイドは配置の段（l-body / l-middle / l-page / l-screen、gutter は "For marginalia, asides, and footnotes. It does not interrupt the normal flow"）を定めるが、題の書き方の条は持たない

### 1.2 Tufte CSS（`tufte.css` を読んだ【実測】）

- 根の字 15px、本文 1.4rem（**21px**）・行送り 2rem（30px、1.43）・段落の上下 1.4rem。**本文の列は本文の器の 55%**、箇条は 50%
- **傍注（sidenote / marginnote）は右の余白へ浮かせる**: 幅は本文の列の 50%、16.5px・行間 1.3。図は最大 55% で、**figcaption も右へ浮かせる**（`float: right`・最大 40%・16.5px・行間 1.6）。狭い画面（760px 以下）では傍注を畳み、印を押すと本文の中に開く
- 見出しは斜体・太さ 400（h2 33px）で、太さでなく字形と余白で段を作る。区切り線は本文の列の 55% 幅・1px
- 暗い面: 地 `#151515`・字 `#ddd`（13.4:1【換算】）

### 1.3 Bret Victor と Nicky Case の主張

- Magic Ink: "Information software design is graphic design."、"If information software can't present its data at least as well as a piece of paper, how have we progressed?"。"Interactivity considered harmful" の節で「楽しさか学びが無い限り、対話は information software の本質的に負の側面」とし、文脈は**環境・履歴から推し量り、操作は最後の手段**にする。映画の上映表は「映画を一方の軸、時刻をもう一方」に置き直して、頭の中の突き合わせを目の走査に変える
- Explorable Explanations: 読むことを "information to be consumed" から "an environment to think in" に変える。書き手は "disclose the models behind their argument"、例は放置した砂場でなく "the author holds up their end of the conversation"。確かめる手間を下げると読み手は「浮かんだ問いを全部問う」
- Nicky Case: 最初に**具体の体験**を与え、抽象の梯子を1段ずつ上がる（"this happens, THEREFORE that happens, BUT…"）。問いを好きにさせてから答える

### 1.4 スクロールで読ませる説明（NYT・The Pudding・ONS）

- ONS（英国統計局）: 速報の平均滞在 2 分 52 秒・記事 3 分 38 秒で、"interactive features often are not interacted with"。対策は「要点を最初に見せる」「単純な時系列」「重要な日付に簡潔な注釈」
- The Pudding: スクロールで動かすのは遷移に意味があるときだけで、各段が単独の図として立つなら縦に積む。スマートフォンでは hover を "fixed text or annotation" に置き換える。段は "short and sweet"
- NYT の Archie Tse（Malofiej 2016「Why We Are Doing Fewer Interactives」）: 「tooltip や rollover を作るなら誰も見ないと思え」「訪問者の 85% が無視する」【二次】（スライドの PDF は文字を取り出せず、検索結果の要約で照合）

### 1.5 Observable Framework（`src/style/global.css` を読んだ【実測】）

- 本文 17px/1.5（serif）。段落・表・図・題・見出しは最大 **640px**、箇条と引用は 600px。見出しは行間 1.15・下 0.25rem・`text-wrap: balance`、見出しの直後の段落と表は上のあき 0
- **図の題は図の上**: `figure > h2` が 20px の題、`figure > h3` が 16px・太さ通常の副題、figcaption は図の下に小さく弱い字
- 表は 13px/1.2 の sans。セル余白 `3px 6.5px 3px 0`（**左は 0** で本文の左端に揃う）、行の罫は最も弱い段、見出し行の下だけ一段濃い
- コードの地は `margin: 1rem -1rem` で本文の列の外へ 16px ずつはみ出し、**コードの字は本文の左端に揃う**

## 2. 知見: 製品の字の段と余白（実物の値）

| 製品                     | 本文（px/行送り）  | 見出し                                   | 補助・題          | 本文の列          | 段落・塊のあき |
| ------------------------ | ------------------ | ---------------------------------------- | ----------------- | ----------------- | -------------- |
| Linear changelog【実測】 | 17/27.2（1.6）     | h2 24・上 56・下 12                      | 題 12/1.4・左揃え | 606px（最大 624） | 20px・箇条 8px |
| Stripe docs【実測】      | 16/26（1.63）      | h1 32/40・h2 24/32 太さ 400              | コード 13/19      | 約 774px          | 未測           |
| Tailwind prose【実測】   | 16/28（1.75）      | h2 24・上 48・下 24、h3 20・上 32・下 12 | 題 14/20・上 12   | 65ch              | 20px・箇条 8px |
| GitHub markdown【実測】  | 16/24（1.5）       | h2 24・上 24・下 16・下罫                | コード 85%/1.45   | 指定なし          | 16px           |
| Vercel Geist【実測】     | copy-16 16/24      | heading-24 24/32・字間 −4%               | label-13 13/16    | —                 | —              |
| Material 3【実測】       | body-large 16/24   | headline-small 24/32                     | label-small 11/16 | —                 | —              |
| Apple macOS              | Body 13/16         | Title 2 17/22・Title 1 22/26             | Footnote 10/13    | —                 | —              |
| Medium【二次】           | 20〜21・行間 ≈1.58 | —                                        | —                 | 680px             | —              |

- **Geist の型**: copy（複数行の文）は行送りが広く（14/20・16/24・18/28・20/36）、label（1行・アイコンと並ぶ）は詰める（16/20・18/20）。見出しは semibold で字間を詰める（14〜20px で −2%、24px で −4%、48px で −6%）
- **Linear の段**: text-regular 15/1.6・字間 −1.1%、text-large 17/1.6、small 14/1.5、mini 13、micro 12。title-1〜4 は 17・20・24・32px。太さは可変字体で 400・510・590・680。**本文は text-secondary、太字は text-primary＋590** で、太字は「明るさ」でも立つ
- **M3 の type scale**（material-web の token、v34.0.21）: 全 15 段の行送りがすべて 4 の倍数（16〜64px）。小さい字ほど字間を開ける（body-large +0.5px、body-small +0.4px）
- **Apple HIG**: macOS の既定 13pt・下限 10pt。字間は大きさで変わる（10pt +12/1000em、12pt 0、13pt −6、15pt −16、17pt −26）。「広い列や長い文には loose leading」「**3 行以上の文は高さが限られても tight leading を避ける**」。Dark Mode は "dimmer background colors and brighter foreground colors"、比は最低 4.5:1、独自の色は「特に小さい字で 7:1 を目指す」。Layout は「揃えで走査を助け、字下げで従属を示す」「余白・器の形・区切り線で関係を示す」
- **iA**: 「本文の大きさは好みでなく**読む距離**で決まる」、行間は「140% が良い目安」、「真っ黒に白でなく、濃い灰の字か薄い灰の地を」。サイトは本文を先に決め、列の幅をそこから決める。Web Design is 95% Typography は "treats text as a user interface"（行送り・語間と字間・余白・色の配分）
- **Stripe の dev blog は反例**【実測】: 本文 16px・太さ 300・**行間 1.3**、見出し 48px・太さ 300・字間 −6%。ブランドの演出として美しく見えるが、Butterick の 120〜145% の下端で、読み物の手本にはならない

## 3. 知見: 視覚階層の実践則

- **Refactoring UI**（目次は公式サイトで一次）: 階層の章は "De-emphasize to emphasize" "Labels are a last resort" "Separate visual hierarchy from document hierarchy" "Balance weight and contrast" "Don't use grey text on colored backgrounds"。余白は "Start with too much white space" "Establish a spacing and sizing system" "Avoid ambiguous spacing"。仕上げは "Use fewer borders"（枠の代わりに影・地の差・余白を増やす）と "Add color with accent borders"。系列の値（4・8・12・16・24・32・48・64・96・128…、隣どうし少なくとも約 25% 離す）は本の文で、二次でしか照合できなかった【二次】
- **Tailwind Typography**（同じ作者の実装【実測】）は上の主張を値にしている: 明るい面で本文 slate-700・見出しと太字 slate-900・箇条の点 slate-300・題 slate-500。暗い面（prose-invert）で本文 slate-300・**見出しと太字は白**・点 slate-600・題 slate-400・見出し行の罫 slate-600・データ行の罫 slate-700。セルは 8px で**左右の端のセルだけ 0**
- **Gestalt（NN/g）**: 近接は「よく設計された見出しの周りの余白は、どの段落に属するかを示す。**節の本文は前の節の本文より見出しに近く置く**」。共通領域（枠・地）は "a strong visual cue that can overpower other grouping principles"。ただし「飾りのための枠と色の箱が多すぎると散らかる」、全幅の色の帯は「偽の床」を作ってスクロールを止める。**まず余白だけで群が伝わるかを試す**
- **Matthew Ström「UI Density」**: "UI density is the value a user gets from the interface divided by the time and space the interface occupies." 密度は 4 つ（見た目・情報〔data-ink〕・設計〔Gestalt で数える必要な決定の割合〕・時間）。時間の密度の閾は 100ms 未満（同時に感じる）・1 秒まで（動きでつなぐ）・10 秒まで（不定の待ち表示）・1 分まで（進捗の棒）
- **縦のリズム**: Bringhurst（webtypography.net の条文）2.2.1「字・文・列に合う基本の行送りを選ぶ」、2.2.2「見出し・引用・脚注・図・題は基本の律動に対する切分音で、**測った間隔で縦の余白を足し引きする**」、3.1.1「尺度なしに組まない…まずは控えめな数の、区別できて関係のある間隔に限る」。行長は「45〜75 字が満足できる範囲、66 字が理想、段組なら 40〜50 字」
- **画面での限界**: 行送りの格子に揃える `line-height-step` は MDN の互換表に項目が無い（実装されていない）。代わりに `text-box-trim` / `text-box-edge`（Chrome 133・Safari 18.2・Firefox 154）で字の上下の余り（ハーフレディング）を削ると、測った間隔が見た目どおりになる
- **デジタル庁デザインシステム**: 余白の基準は 8px（例示は 8・24・64px）。「重要な要素は…より大きな間隔値を、重要でない要素はより小さい間隔値を」「関連性のある要素には小さな余白、関連性の低い要素には大きな余白」。配布の `tokens.css` には余白の token が無く、字の大きさ 14〜64px の 15 段・行間 1.0〜1.75 の 8 段・角丸・影だけがある

## 4. 知見: 図と文の統合・題の付け方

- **Storytelling with Data**: 題は "use your title strategically" で、"your key takeaway—the so what?—there"。副題で要点を明かし、**同じ色で語とデータ点を結ぶ**。declutter の 8 手は「図の枠を消す・格子線を消す・数のラベルは正確な値が要るときだけ・棒は棒の間の余白より太く・軸の題を付ける・凡例をデータの近くへ・色は控えめに・要点の題を付ける」
- **Datawrapper**: 題は "the one key statement that you want your reader to remember"、description は「正確に何が見えるか、いつ・どこで・なぜ・どう記録したか」、notes は脚注、出典は名前と URL。ブログの条は「**主張を先に、正確なデータの説明は後に**」「字の大きさは区別できる 2 段まで（例 12px と 14px）」「重要な字は太く濃く、補助は細く灰に」「**中央揃えを避ける**（左か右揃えのほうが整って見える）」「軸のラベルを回転させない」「凡例を直接ラベルに替える」「要らない桁を出さない（12,831 でなく 12.8k、`0.[0]%`）」「注と出典は図の下に小さく灰で」
- **FT Visual Vocabulary**: 関係を 9 つに分ける（Deviation・Correlation・Ranking・Distribution・Change over Time・Part-to-whole・Magnitude・Spatial・Flow）。目的は図の作り方でなく "how to recognise the opportunities to use them effectively alongside words"。Correlation は「言わなければ読み手は因果と受け取る」と注意する
- **Nature の formatting guide**: "Each figure legend should begin with a brief title for the whole figure and continue with a short description of each panel and the symbols used." "Legends should be fewer than 300 words each." 誤差棒と統計は legend で定義し、**記号の鍵は図の上より legend に**置く。図の中の字は小文字で先頭だけ大文字・句点なし。並の図は legend 込みで約 1/4 ページ（≈270 語）
- **Tufte の Layering and Separation**（Envisioning Information 第 3 章）: 太い線を 2 本並べると間に 3 本目が見える「1 + 1 = 3 or more」で、片方を弱めると消える。"Clutter and confusion are failures of design, not attributes of information."【二次】
- **題の位置の流儀は 2 つ**: 報道と分析ノート（Datawrapper・SWD・Observable）は**図の上に主張の題**、下に出典と注。学術誌（Nature）と Tufte・Distill は**図の下か横に legend**で、先頭の1文か太字が題になる。Linear の figcaption は 12px・行間 1.4・tertiary・上 13px・`text-wrap: balance`・本文の列に左揃え【実測】

## 5. 知見: 和文の読み物の実測

| サイト               | 本文                          | 行長                  | 段落のあき  | 見出し                                |
| -------------------- | ----------------------------- | --------------------- | ----------- | ------------------------------------- |
| note【実測】         | 18px/32px（1.78）             | 620px ≈ 34 字【換算】 | 36px（2em） | h2 28px・上 54・下 18、h3 20px・上 36 |
| 日経電子版【実測】   | 16px（1232px 以上 18px）・1.8 | 38em ＝ 38 字         | 1em         | 題 26px・行間 1.35・700               |
| NHK NEWS WEB【実測】 | 16px・1.75                    | 未測                  | 32px（2em） | 題 28px・行間 1.25・700               |
| デジタル庁（token）  | 16px 基準                     | —                     | 基準 8px    | 字は 14〜64px の 15 段                |

- **note**: 本文の既定は明朝（Hiragino Mincho ProN）で、ゴシックは選べる。見出しは行送り 36px・字間 **0.04em**・`font-feature-settings: "palt"`、下のあきは −18px（段落の 36px と相殺して見出し→本文 18px）。箇条の項目は上下 9px・行送り 30px（段落の 32px より詰める）・字下げ 24px。引用は地の色で囲い 25px 36px の余白。480px 以下で本文 16px・あき 30px。暗い面は地 `#202A30`・字は白 90%（12.1:1【換算】）・補助は白 66%（7.2:1【換算】）。Windows では `YakuHanJPs`（約物を半角にする字体）を先頭に置く
- **日経**: 本文の器を **`max-width: 38em`** で縛るので、字の大きさを変えても 1 行 38 字が保たれる（Bringhurst の em 幅の勧めと同じ発想）
- **NHK**: 本文 16px・行間 1.75・段落の下 32px、字の大きさに利用者の倍率（`--font-size-scale-factor`）を掛ける。暗い面の字は `#f9f9f9`。本文はクライアント側で描かれ、headless Chromium は接続が切れたため列幅は測れなかった
- **約物**: YakuHanJP は「日本語テキストに含まれる約物を半角にするフォント」（SIL OFL 1.1 と MIT）。note は見出しだけに `palt`、本文は既定の全角約物のまま組む

## 6. 知見: ダークの「静かな」読む面

コントラスト比はすべて【換算】。tsukumo は本文の地を `--surface`（`#221f2b`）として計算した。

| 製品                   | 地        | 本文の字（比）                                | 弱い字（比）                 | 罫（比）                           |
| ---------------------- | --------- | --------------------------------------------- | ---------------------------- | ---------------------------------- |
| Linear【実測】         | `#08090a` | `#d0d6e0` 13.6（見出し・太字 `#f7f8f8` 18.7） | `#8a8f98` 6.1・`#62666d` 3.5 | `#23252a` 1.30・`#37393a` 1.72     |
| GitHub dark【実測】    | `#0d1117` | `#f0f6fc` 17.4                                | `#9198a1` 6.5                | `#3d444d` 1.92（表は格子＋縞）     |
| Obsidian（公式 docs）  | `#1c1c1c` | `#dadada` 12.2                                | `#b3b3b3` 8.1・`#666666` 3.0 | `#333333` 1.35                     |
| note dark【実測】      | `#202A30` | 白 90% 12.1                                   | 白 66% 7.2                   | 白 32%                             |
| Tufte CSS dark【実測】 | `#151515` | `#ddd` 13.4                                   | —                            | —                                  |
| tsukumo（いま）        | `#221f2b` | `--ink` 12.8（見出し `#e4e2ea` 12.6）         | soft 7.3・quiet 5.5          | `--rule` 2.54・`--rule-quiet` 1.16 |

- **静かな群は本文 12〜13.5:1** に集まる（Obsidian・note・Tufte。Tailwind の prose-invert の本文 slate-300 も、地を slate-900 と置くと 12.0:1）。GitHub の 17.4:1 は明るい側。tsukumo の 12.8:1 は静かな群の中にある
- **Linear だけが本文と「拾う字」を分ける**: 本文 13.6:1・太字と見出し 18.7:1（比で 1.37 倍）。読ませる字は少し沈め、走り読みで拾わせる語だけを最も明るくする。Tailwind の prose-invert も本文 slate-300・見出しと太字は白で同じ型
- **罫は 1.3〜1.35:1 が静かな面の値**（Linear・Obsidian）。GitHub の 1.92:1 は表を全格子で囲む前提の濃さ。Linear の器の縁は不透明の色でなく**白の 5〜15% の重ね**（`#ffffff0d`〜`#ffffff26`）で、地の段（`#08090a` → `#0f1011` → `#1c1c1f` → `#232326`）と組で使う
- **字の色の数**: Obsidian 3（normal・muted・faint）、GitHub 2（default・muted）、Linear 4。tsukumo のレポートは段の 3 つに結論部の固定色 3 つ（見出し `#e4e2ea`・一文 `#d4d2dc`・目録 `#9a98a6`）が加わり、実質 6 つ
- Raycast・Arc はネイティブの描画で CSS が無く、値を測れなかった

## 7. tsukumo に効く示唆

印は効く先: 〔規約〕＝書き手（モデル）への規約 / 〔塊〕＝report の欄や塊の schema / 〔描画〕＝CSS・部品 / 〔仕組み〕＝検査・計測・運用。
値の変更はどれも `docs/architecture/screen-design.md` と `theme.css` の書き換えになる。原則（色の出る場所・字の段の数・配置）に触れるものだけに**「正典の変更」**と付ける。採否は決めない。

### 7.1 いま／先例／差

| 項目           | いま                            | 先例                                                            | 差                                   |
| -------------- | ------------------------------- | --------------------------------------------------------------- | ------------------------------------ |
| 本文           | 15px・1.75（26.25px）           | Linear 17/27.2・Tailwind 16/28・note 18/32・NHK 16/1.75         | 行送りが 4px の格子に乗らない        |
| 行長           | 42 字 ≈ 630px【換算】           | Linear 606〜624px・Observable 640px・日経 38 字・note 34 字     | 同じ帯                               |
| 塊どうし       | 16px（行送りの 0.61）           | 欧文 0.6〜0.75 行（Linear・Tailwind・GitHub）、note・NHK 1.1 行 | 欧文の流儀。和文の読み物より狭い     |
| 見出しの上／下 | 44・36px ／ 20px                | Linear 56/12・note 54/18・Tailwind 48/24 と 32/12               | 下が広く、見出しが前の節からも離れる |
| ## と本文の比  | 19/15 ＝ 1.27                   | Tailwind・Stripe 1.5・note 1.56・Linear 1.41・Apple 1.31        | 読み物の中では小さい                 |
| 見出しの明るさ | 12.6:1（本文 12.8:1）           | Linear 18.7 対 13.6、Tailwind invert 白 対 slate-300            | 本文と同じ明るさ                     |
| 表の行罫       | `--rule` 2.54:1                 | Linear 1.30・Obsidian 1.35・Distill 黒 5%                       | 倍近く濃い                           |
| 表の 1 列目    | 左の余白 18px                   | Observable・Tailwind・Linear は 0                               | 本文の左端から 18px ずれる           |
| 図表の題       | 中央・12px・ink-quiet の 1 段   | 左揃え・2 段（主張と補足）・balance                             | 中央揃え、主張の段が無い             |
| 本文の右の空き | 約 377px を使っていない【換算】 | Distill の柱 152px・Tufte の傍注                                | 余白の柱が無い                       |
| 字の色の数     | 実質 6                          | Obsidian 3・Linear 4・GitHub 2                                  | 多い                                 |

### 7.2 (a) 寸法と余白の体系

- 〔描画〕**行送りを格子に乗せる**: 15px/26px（1.733）か 16px/28px（1.75、Tailwind prose と同じ）。あきを行送りの半分（13px か 14px）の倍数で結ぶと、Bringhurst 2.2.2 の「測った間隔」になる。例（15/26 のとき）: 塊どうし 13 か 26、見出しの上 52、見出しの下 13、図表の上下 39
- 〔描画〕**見出しの上下の比を 3〜4 倍に**: いまの 44/20・36/20（2.2・1.8 倍）を、上 52・下 12〜14 にする（Linear 56/12、Tailwind の h3 32/12、note 54/18）。見出しは次の段落に寄り、前の節から離れる（NN/g の近接）
- 〔描画〕**`##` を本文の 1.4〜1.5 倍に**（21〜22px）。`###` は 17px のまま（先例の h3 は 1.1〜1.25 倍）。Butterick の「要る最小の増分」とは、`##` を罫線で、`###` を大きさで分けているいまの方式と比べて決める
- 〔描画〕**拾う字の 1 段を足す**「正典の変更」: 本文は `--ink` のまま、見出し・太字・stats の数だけを地の上で 15:1 前後（白で 16.2:1 が上限【換算】）にする。Linear の 1.37 倍の型。代わりに結論部の固定色 3 つを段に寄せ、字の色を 4 つに収める
- 〔描画〕**和文の見出しに `palt` と字間 0.02〜0.04em**（note）。`text-wrap: balance` を見出しと題に（Observable・Linear）。本文の器を `max-width: 42em` の em で縛ると、字の大きさを変えても 42 字が保たれる（日経の 38em）
- 〔描画〕`text-box-trim` で見出しと塊の上下の余りを削ると、測ったあきが見た目どおりになる。Orca のタブの描画エンジンの版で効くかは確かめていない

### 7.3 (b) 図・表・題・注釈

- 〔規約〕**題は主張の 1 文で書き、測り方・期間・条件は 2 文目に**（Datawrapper の title と description、SWD、Nature の「短い題の 1 文で始める」）。「図1 構成」でなく「図1 依頼から送り出しまで 4 段、受け入れの差し戻しが最長」
- 〔塊〕〔描画〕**題を 2 段で受けて描く**: 主張（`--ink`・太さ 500 か 600）と補足（`--ink-quiet`）。Distill の「題の中の太字だけ 100%」と同じ見た目。schema に補足の欄を足すか、1 文目を主張として描き分けるかは選べる
- 〔描画〕**題を左揃えに**し、`text-wrap: balance` を掛ける（Datawrapper「中央揃えを避ける」、Linear・Observable）。番号「図1」は今の等幅のまま行頭に
- 〔描画〕「正典の変更」**図の題を上に移す案**: 走り読み（layer-cake）は図より先に題を読むので、主張の題を図の上、出典と測り方を図の下に置く（Datawrapper・SWD・Observable）。いまの「図は下・表は上」は学術誌の流儀で、どちらも先例がある
- 〔描画〕chart は**凡例を直接ラベルに替え**、格子線と枠を消し、図の中の字は 2 段（12px と 14px）まで・回転させない（SWD の declutter、Datawrapper）。〔規約〕数は要る桁までに丸める（12.8k、`0.[0]%`）
- 〔描画〕〔塊〕「正典の変更」**余白の柱**: 本文の右の約 377px【換算】に、出典・補足・`memo` の note を 12〜13px・`--ink-quiet` で置く（Distill の gutter 152px は 12px・行間 1.6、Tufte の傍注は本文の列の 50%）。狭い窓では Tufte CSS のように本文の中に畳む。本文の流れが切れず、走り読みの経路から補足が外れる

### 7.4 (c) 塊ごとの見た目

- 〔描画〕**表**: 1 列目の左と最終列の右の余白を 0 にして本文の端に揃える（Observable・Tailwind・Linear）。データ行の罫を 1.3:1 前後（`--rule-quiet` の 1.16 と `--rule` の 2.54 の間）に下げ、見出し行の下だけ一段濃くする（Distill 20% 対 5%、Tailwind invert slate-600 対 slate-700）。縦罫は引かない（いまも引いていない）
- 〔描画〕**箇条書き**: 点と番号は `--ink-quiet`、番号は等幅で右揃えにして本文の左端の外へ吊る（Linear の ol は `tabular-nums`・`text-align: end`・字下げ 24px）。項目どうし 8px（Linear・Tailwind）、項目の行送りは段落よりわずかに詰める（note 30px 対 32px）
- 〔描画〕**コード**: 地だけを本文の列の外へ 12〜16px はみ出させ、コードの字を本文の左端に揃える（Observable の `margin: 1rem -1rem`）。行送りは 1.45〜1.7（GitHub 1.45・Tailwind 24/14）
- 〔描画〕**注意書き（note）**: 縦罫 2〜3px は先例どおり（Distill 2px・GitHub 0.25em）。地の 10% 染めは共通領域を縦罫と二重にかける形で、先例の引用と注は地を染めない。染めを `warn` と `ng` だけに残すと、強い合図が強いものにだけ残る（NN/g の「偽の床」、Refactoring UI の accent borders）
- 〔描画〕**カード（検証のカードなど）**: 枠を足すより地の段か余白で群を作る（Refactoring UI「Use fewer borders」、NN/g「まず余白だけで試す」）。縁が要るなら Linear のように字の色を 5〜15% 重ねた縁にする

### 7.5 (d) 「静か」の中でできる美しさ

- **足すもの**: 拾う字の 1 段（「正典の変更」）、余白の柱（「正典の変更」）、ぶら下げ揃え（表の 1 列目・コード・番号を本文の左端の線に揃える）、題の主張の段、見出しと題の `balance`。どれも色を足さずに、明るさ・位置・揃えで作れる
- **引くもの**: 表の行罫の濃さ、題の中央揃え、見出しの下のあき、chart の凡例と格子線、note の地の染めの二重、字の色の数（6 → 3〜4）
- 〔描画〕「正典の変更」**見出しの罫線の差し色を `##` だけに**: 先例の読み物（Linear・Tailwind・Stripe docs・Observable）は見出しに罫を引かず、Distill も h2 だけ黒 10%。`###` の罫を外すと、差し色が出る場所が 1 段減り、1 + 1 = 3 の余計な線も消える
- 〔規約〕〔描画〕**hover と畳みに要点を置かない**（Victor・ONS・Tse【二次】）。図の値は直接ラベルで、tooltip は補助の確認にだけ使う
- 〔規約〕**節の中は具体から抽象へ**（Nicky Case）: レポートの頭は結論先行のまま、節の中では「何が起きたか（具体の 1 例・前後の画）」→「だから何が言えるか（規則）」の順にする
- 〔仕組み〕**縦のあきを実ブラウザで測る**: レポートの塊の上下のあきが決めた単位（4px か半行）の倍数かを、寸法の検査として E2E で確かめる（寸法は実ブラウザでしか確かめられない側）
- 〔仕組み〕**時間の密度を測る**: 最終レポートが届いてから結論の 1 文が読める状態になるまでの時間を計り、演出がそれを 1 秒より延ばしていないかを見る（Ström の 100ms・1 秒の閾）
- 〔仕組み〕**字の色の数を検査する**: レポートの CSS が使う字の色を字の段の token だけに限る規約のテストにすると、結論部のような固定色の増殖が止まる

## 確かめていないこと

- Medium は 403 で本文の CSS を読めず、値は二次情報だけ。Raycast・Arc はネイティブの描画で CSS が無く測れなかった
- NHK NEWS WEB の本文の列幅（本文はクライアント側で描かれ、headless Chromium は接続が切れた）。Stripe docs の段落のあき（段落の margin は 0 で、親の配置が持つと思われるが測っていない）
- Refactoring UI の余白の系列と「25%」の条、Tufte の Layering and Separation の本文、NYT の Tse のスライドの文言はどれも二次でしか照合できなかった
- Material 3 の spacing のページ（JS 描画で本文を読めなかった）。Obsidian の `--text-normal` と base の色の対応（公式 docs の表は base の値だけ）
- `text-box-trim`・`text-wrap: balance` が Orca のタブの描画エンジンの版で効くか、`text-wrap: balance` / `pretty` が和文でどれだけ効くか
- 「世界で最も美しい」と評価する一次の調査や賞の基準は探していない。先例の選定は依頼に挙がった製品と、広く参照される実装（Distill・Tufte CSS・Tailwind Typography・Observable）に拠る
- Linear の changelog の値は 2026-10-17 の 1 ページの実測で、記事の種類による違いは見ていない

## 出典一覧

- Distill: [配布テンプレート `template.v2.js`](https://distill.pub/template.v2.js)【実測】/ [Distill Guide](https://distill.pub/guide/)
- Tufte CSS: [`tufte.css`（GitHub）](https://github.com/edwardtufte/tufte-css)【実測】
- Bret Victor: [Magic Ink](http://worrydream.com/MagicInk/) / [Explorable Explanations](http://worrydream.com/ExplorableExplanations/)。Nicky Case: [How I Make Explorable Explanations](https://blog.ncase.me/how-i-make-an-explorable-explanation/)
- スクロールの説明: [ONS Digital: Why less interactivity can be more](https://digitalblog.ons.gov.uk/2021/08/19/why-less-interactivity-can-be-more/) / [The Pudding: Responsive scrollytelling best practices](https://pudding.cool/process/responsive-scrollytelling/) / [Tse, Malofiej 2016 のスライド（PDF）](https://github.com/archietse/malofiej-2016)（文字を取り出せず、文言は検索結果の要約で照合。[Nieman Lab の報道](https://www.niemanlab.org/2016/03/at-the-malofiej-infographics-world-summit-the-best-form-of-storytelling-is-often-static/) は 403 で読めなかった）【二次】
- Observable Framework: [`src/style/global.css`](https://github.com/observablehq/framework/blob/main/src/style/global.css)【実測】
- Linear: [changelog](https://linear.app/changelog) とその配布 CSS（`static.linear.app`）【実測】
- Stripe: [docs: Accept a payment](https://docs.stripe.com/payments/accept-a-payment)（計算済みスタイル）【実測】/ [stripe.dev blog](https://stripe.dev/blog/how-we-built-it-stripe-radar) の配布 CSS【実測】
- Vercel Geist: [Typography](https://vercel.com/geist/typography) と配布 CSS【実測】
- Apple HIG: [Typography](https://developer.apple.com/design/human-interface-guidelines/typography) / [Dark Mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode) / [Layout](https://developer.apple.com/design/human-interface-guidelines/layout)（いずれも `developer.apple.com/tutorials/data/design/human-interface-guidelines/*.json` の本文）
- Material 3: [material-web の `_md-sys-typescale.scss`（v34.0.21）](https://github.com/material-components/material-web/blob/main/tokens/versions/latest/sass/_md-sys-typescale.scss)【実測】
- iA: [Responsive Typography: The Basics](https://ia.net/topics/responsive-typography-the-basics) / [Web Design is 95% Typography](https://ia.net/topics/the-web-is-all-about-typography-period)
- Medium: [webdesignhot の Medium の design.md](https://www.webdesignhot.com/design.md/medium/)【二次】
- Refactoring UI: [公式サイト（目次と "Use fewer borders"）](https://refactoringui.com/) / 系列の値は [refactoring-ui の要約](https://cdn.jsdelivr.net/npm/claude-code-skills@0.5.0/data/skills/ux-ui-design-system/references/refactoring-ui.md)【二次】/ [Tailwind Typography `src/styles.js`](https://github.com/tailwindlabs/tailwindcss-typography/blob/main/src/styles.js)【実測】
- NN/g: [Proximity Principle in Visual Design](https://www.nngroup.com/articles/gestalt-proximity/) / [The Principle of Common Region](https://www.nngroup.com/articles/common-region/)
- Matthew Ström: [UI Density](https://mattstromawn.com/writing/ui-density/)
- Bringhurst（webtypography.net の条文）: [2.1.2 measure](http://webtypography.net/2.1.2) / [2.2.2 vertical space](http://webtypography.net/2.2.2) / [3.1.1 scale](http://webtypography.net/3.1.1)
- MDN browser-compat-data: [`css/properties/text-box-trim.json`](https://github.com/mdn/browser-compat-data/blob/main/css/properties/text-box-trim.json)（`line-height-step` は項目なし）
- 図と題: [SWD: so what?](https://www.storytellingwithdata.com/blog/2017/3/22/so-what) / [SWD: declutter! (and question default settings)](https://www.storytellingwithdata.com/blog/2019/5/13/declutter-and-question-defaults) / [Datawrapper Academy: Annotate tab](https://www.datawrapper.de/docs/annotate-tab) / [Datawrapper Blog: text in data visualizations](https://www.datawrapper.de/blog/text-in-data-visualizations) / [FT Visual Vocabulary（chart-doctor）](https://github.com/Financial-Times/chart-doctor/tree/main/visual-vocabulary) / [Nature formatting guide](https://www.nature.com/nature/for-authors/formatting-guide) / Tufte の Layering and Separation は [Envisioning Information の引用集](https://www.goodreads.com/work/quotes/19273)【二次】
- 和文: [note の記事](https://note.com/info/n/nea1b96233fbf) とその配布 CSS（`frontend.st-note.com`）【実測】/ [日経電子版の記事](https://www.nikkei.com/article/DGXZQOGN1621R0W6A011C2000000/) と `k2-article/main.rev-1e15b067.css`【実測】/ [NHK NEWS WEB の記事](https://news.web.nhk/newsweb/na/nd-20261017de60815) と配布 CSS【実測】/ [デジタル庁デザインシステム 余白](https://design.digital.go.jp/foundations/spacing/) / [digital-go-jp/design-tokens](https://github.com/digital-go-jp/design-tokens) / [YakuHanJP](https://github.com/qrac/yakuhanjp)
- ダーク: [github-markdown-css の `github-markdown-dark.css`](https://github.com/sindresorhus/github-markdown-css)【実測】/ [Obsidian Developer Docs: Colors・Spacing・Typography](https://github.com/obsidianmd/obsidian-developer-docs/tree/main/en/Reference/CSS%20variables/Foundations)
- tsukumo のいまの値: `src/browser/styles/theme.css`、`src/browser/components/page/conversation/components/markdown/renderer/report-notation.module.css`（2026-10-17 の作業ツリー）
