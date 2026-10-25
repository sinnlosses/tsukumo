# 暗い画面で、長い技術文と状態の記号を疲れずに読み分ける色・コントラスト・記号の設計（2026-10-02）

**この文書は調査メモであって正典ではない。** `docs/` の他ファイルにある「節の索引」はここには
作らない。問いの出どころはユーザーの指示（2026-10-02）「レポートの描画（React + CSS）を、暗い画面で
長い技術文と状態の記号を疲れずに読み分けられる色・コントラスト・記号にする」。**値の変更はこの文書の外**
（候補と根拠まで）。アクセント（狐火の青緑 `#6fe3cd`）は変えない前提で読む。

**出典の印。** 主張の末尾の `[n]` が末尾の出典一覧を指す。一覧の ★ は一次情報源（W3C・各デザインシステムの
公式文書か公式のコード・論文・作者の文書）、☆ は二次情報（検索の抜粋・解説記事・値が画像にしか無く転記したもの）。
**比の実測は 2026-10-02 に手元で計算した**（WCAG 2 は仕様の式、APCA は apca-w3 0.1.9 の定数 [5]、
OKLCH は Björn Ottosson の行列、色覚の模擬は Machado 2009 の行列 [21]）。

## 要点

1. 現行の本文 `ink #e8e3ea` は `surface` 上で WCAG 12.8:1・APCA Lc −88.5。APCA の作者が暗地の本文の上限として試している Lc −85〜−90 の帯の中にある。**純白にしてはいけない（#fff は Lc −106）が、下げる必要も無い** [3][6]。
2. 弱いのは補助文と異常の色。`ink-quiet`（`ink` の 60%）は Lc −44 で、APCA が本文に求める Lc 75・本文でない字に求める Lc 60 を割る。13px で使う字には 72〜75%（Lc −56〜−59）が要る [3]。`state-ng #e88b8b` は Lc −51 で `state-ok`（−73）・`state-warn`（−72）より 20 以上弱く、**いちばん重い状態がいちばん薄い**。
3. 緑と赤は 2 型色覚の模擬で OKLab の差が 0.26 → 0.09 に縮み、`ok` と `warn` は 0.04 で同じ色になる。**状態は字と形で伝え、色は添え物**（WCAG 1.4.1 とこの画面の原則5）[1][13]。
4. 系列色（`context-*` と Chart.js の既定）は明度 L 0.53〜0.87 でばらつき、Lc −26〜−78。暗地では**明るく（L≈0.78）・彩度を揃え（C≈0.11）・6 色まで**にし、灰を「その他」に残す [15][16][17c]。
5. 枠は `rule`（2.55:1）で足りる。**3:1 が要るのは線だけで押せる・入力できることを示す縁とフォーカスの輪だけ**（WCAG 1.4.11）。Primer の `borderColor-default` も 1.9:1、Radix の部品の枠（7 段）も 1.9:1 [1][10][11]。
6. 研究は校正課題で「明るい字 + 暗い地」の不利を一貫して示すが、正体は**極性ではなく画面全体の輝度（瞳孔）**で、小さい字ほど差が開く [24]〜[28]。暗い UI での対策はコントラストの引き上げではなく、**字の大きさと太さを落とさないこと**。
7. Mermaid は固定の `theme: "dark"`（地 #333・ノード #1f2020・字 #ccc）で、tsukumo の地（#191720 / #221f2b）と 2 段ずれている。`base` + `darkMode: true` にトークンを hex に解いて渡す [22]。

## 知見

### 1. コントラストの基準

| 基準                           | 数値                                                                  | 備考                                                                                                        |
| ------------------------------ | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| WCAG 2.2 1.4.3（AA）           | 文字 4.5:1、大きな字 3:1                                              | 大きな字 = 18pt（24px）または 14pt（18.7px）の太字。CJK は相当する大きさ [1]                                |
| WCAG 2.2 1.4.6（AAA）          | 7:1、大きな字 4.5:1                                                   | 4.5 は視力 20/40 の損失 1.5 倍を 3:1 に掛けた値、7 は 20/80 相当 [2]                                        |
| WCAG 2.2 1.4.11                | UI 部品・意味を持つ図形 3:1                                           | 隣接する色に対して。非活性な部品は除外 [1]                                                                  |
| WCAG 2.2 1.4.1（A）            | 色を唯一の手段にしない                                                | 字・形・模様・数字を添える。色相と明度の両方が違って 3:1 以上なら「別の見た目」と数える（G183）[1][2]       |
| 比の式                         | (L1 + 0.05) / (L2 + 0.05)                                             | 極性に無関係（白地の黒と黒地の白が同じ値）。APCA 側は「黒に近い色の組では 4.5:1 でも読めないことがある」[3] |
| WCAG 3.0 草案（2026-09-10 WD） | 「Text contrast sufficient (minimum)」は Developing、算法は `@@` 未定 | 「サイズと太さの係数を含む算法を想定」とだけ。APCA も Lc も本文には無い [4]                                 |

APCA（算法 0.0.98G-4g、apca-w3 0.1.9）の Lc の段 [3][5]:

| Lc  | 用途                                      | 最小の字（px / weight）                                            |
| --- | ----------------------------------------- | ------------------------------------------------------------------ |
| 90  | 本文の推奨                                | 18/300・14/400。24px 以上かつ 300 以上の字はこれより上を要求しない |
| 75  | 本文の下限                                | 24/300・18/400・16/500・14/700                                     |
| 60  | 本文でない内容の字の下限                  | 24/400・21/500・18/600・16/700                                     |
| 45  | 見出し・大きな字                          | 36 の標準か 24 の太字                                              |
| 30  | 読めればよい字（placeholder・無効）の下限 | 補助の字は本文の値 −15、スポットの字は −25。どちらも 30 が床       |
| 15  | 字でないものが見分けられる下限            | これ未満は見えないものとして扱う                                   |

暗地について APCA の作者（Myndex）が書いていること: 暗地の字の上限として **Lc −85〜−90** を試している。#000 の地なら字は
**#ccc〜#e4e4e4**、#444 の地に #f4f4f4 は明るい部屋向け。「コントラストが高すぎる」のではなく**輝度が高すぎる**のが疲れの正体
（錐体の漂白・ハレーション・グレア。乱視で顕著）[6]。彩度の高い色（鮮やかな黄など）は Lc が同じでも暗地でハレーションが強い
（Helmholtz–Kohlrausch 効果）ので、**同じ Lc なら彩度を落とした色のほうが読める** [6b]。細い字に `-webkit-font-smoothing: antialiased`
を当てると暗地の白い字の輝度が実質 48% まで落ちるので、`auto` のままにする [6c]。

### 2. ダークテーマの設計（各システムの一次情報）

| システム                                | 地の段                                                                                                                                                     | 字の段                                                                                                                                        | 枠                                                                                                                                | 差し色                                                                                                                         |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Material 2 [7]                          | 面は #121212（純黒でない）。浮きは白を 0 / 5 / 7 / 8 / 9 / 11 / 12 / 14 / 15 / 16%（0〜24dp）重ねる。Android の実装は alpha% = 4.5·ln(dp + 1) + 2 [7b]     | 白の不透明度 87 / 60 / 38%（高・中・無効）。白と #121212 は 15.8:1。手元の計算で 87% = #e0e0e0 は Lc −87、60% は −50、38% は −25              | —                                                                                                                                 | 主色は **200 番の淡い色**。エラーは #CF6679。「差し色は限定的に、面の大半は暗い地」                                            |
| Material 3（dynamic color のコード）[8] | dark: surface = tone 6、container lowest / low / 中 / high / highest = 4 / 10 / 12 / 17 / 22（2026 版は 4 と 0 / 6 / 9 / 12 / 15）。light は 98 と 100〜90 | on-surface = tone 90（標準の目標 7:1、2026 版は **dark 11:1 / light 9:1**）、on-surface-variant = 80（4.5:1、2026 版は dark 6:1）             | outline = tone 60（3:1、「入力欄の輪郭など重要な境界」）、outline-variant = 30（要求なし。「仕切り線と、他が 4.5:1 を出すとき」） | primary = tone 80（4.5:1）、on-primary = 20、primary-container = 30、error = 80。light はそれぞれ 40 / 100 / 90 / 40           |
| Apple HIG [9]                           | iOS は base / elevated の 2 組（浮くほど明るい）。macOS は desktop tinting                                                                                 | 「少なくとも 4.5:1、自前の色なら特に小さい字で 7:1 を目指す」。label 4 段を使う。「Dark Mode では知覚コントラストを上げることがある」         | —                                                                                                                                 | 「Dark Mode の色は明るい版の反転ではない」。白い地の画像は少し暗くして光らせない。system color の値は本文に無く画像のみ        |
| GitHub Primer（dark、配布 CSS）[10]     | bg default #0d1117 / muted #151b23 / inset #010409 / emphasis #3d444d                                                                                      | fg default **#f0f6fc**（Lc −101）/ muted **#9198a1**（6.5:1・Lc −46）/ onEmphasis #fff                                                        | border default **#3d444d**（1.9:1）/ muted は同色 70% / emphasis #656c76                                                          | accent #4493f8・success #3fb950・attention #d29922・danger #f85149・done #ab7df8。意味の地は色の 10〜15% の重ね（`#2ea04326`） |
| Primer の規則 [10b][10d]                | 「字と枠の比はすべて `bgColor-muted` に対して計算」                                                                                                        | 既定の字 4.5:1、二次の要素とリンク 3:1。高コントラスト版は 7:1。Dark Dimmed は意図して低コントラスト                                          | 部品 3:1                                                                                                                          | 役割は accent / success / attention / danger / open / closed / done / sponsors                                                 |
| Radix Colors [11]                       | 1 = アプリの地、2 = 弱い地、3〜5 = 部品の地（通常 / hover / 選択）。slate dark は #111113 / #18191b / #212225                                              | 11 = 弱い字、12 = 強い字。**11 と 12 は同じ系統の 2 段の上で Lc 60 と Lc 90 を保証**。slate dark は #b0b4ba / #edeef0                         | 6 = 弱い仕切り（1.5:1）、7 = 部品の枠とフォーカス（1.9:1）、8 = hover の枠                                                        | 9 = 塗り（最も彩度が高い）、10 = hover。teal dark は 9 #12a594、11 #0bd8b6、12 #adf0dd                                         |
| Tailwind v4 / shadcn [12]               | 例は `bg-white` → `dark:bg-gray-800`。shadcn dark は background oklch(0.145) ≈ #0a0a0a、card 0.205 ≈ #171717                                               | 見出し `dark:text-white`、本文 `text-gray-500` → `dark:text-gray-400`。shadcn は foreground 0.985 ≈ #fafafa、muted-foreground 0.708 ≈ #a1a1a1 | shadcn は border = 白 10%、input = 白 15%                                                                                         | destructive oklch(0.704 0.191 22)                                                                                              |

共通の形: **地は 3〜5 段、字は 2〜3 段、枠は 2 段**。字の最上段は Primer と shadcn が Lc 95〜100 の白に近い値、
Material 2 の 87%・Radix 12・Rosé Pine が Lc 87〜95。暗地の差し色は明るい側の段（Material の tone 80 / 200 番、Radix の 11）で、
彩度を上げる代わりに明度で浮かせる。

### 3. 状態を色だけで伝えない

- 岡部・伊藤（CUD）: 赤と緑を並べない、「明度が同じで色相だけ違う組」を避ける、色に加えて形・位置・線種・網掛けを使う、太い線と太字、凡例でなく図の中に直接ラベル。赤緑型は白人男性の 8%・アジア 5%・アフリカ 4% [13]。8 色の sRGB 値（橙 #E69F00・空 #56B4E9・青緑 #009E73・黄 #F0E442・青 #0072B2・朱 #D55E00・赤紫 #CC79A7・黒）はページの図にしか無い [13b]。CUD 推奨配色セット第 4 版（2018）は 20 色をアクセント・ベース・無彩色に分ける [13c]。
- Paul Tol: bright 7 色（#4477AA #EE6677 #228833 #CCBB44 #66CCEE #AA3377 #BBBBBB）、vibrant 7、muted 9 + 欠測 #DDDDDD。**high-contrast 3 色（#004488 #DDAA33 #BB5566）は明度の段で分かれ、白黒印刷でも読める**。light 以外は色覚多様性に安全。それ以上の分類は連続配色へ [14]。
- IBM Carbon: 分類は 14 色を**隣どうしの差が最大になる順**で使う（Purple 70 #6929c4 → Cyan 50 #1192e8 → Teal 70 #005d5d → Magenta 70 #9f1853 → Red 50 #fa4d56 → …）。アラートは Red 60 #da1e28 / Orange 40 #ff832b / Yellow 30 #f1c21b / Green 60 #198038（light。dark の列は JS で切り替わり取得できなかった）。技術図の暗い主題は地が Gray 100、主色は Color 30〜50 か白 [15][33]。
- Primer: 状態は **色 + Octicon + 文字** の 3 点セット（StateLabel の open / closed / merged / draft …）。「色の変化には文字かアイコンを添える」「グラフは近くにラベルか模様」[10c][10d]。
- tsukumo の現行の状態色を色覚で模擬した結果（Machado 2009、重症度 1.0。差は OKLab の距離）[21]:

| 組                      | 通常  | 2 型（deutan）                 | 1 型（protan） |
| ----------------------- | ----- | ------------------------------ | -------------- |
| ok #7ee081 ↔ ng #e88b8b | 0.26  | **0.09**                       | 0.19           |
| ok ↔ warn #e3c766       | —     | **0.04**（#d5c787 と #e0cc6a） | —              |
| warn ↔ ng               | —     | 0.12                           | —              |
| ok ↔ accent #6fe3cd     | 0.095 | 0.09                           | —              |

`ok` と `warn` は 2 型でほぼ同じ色になり、`ok` と `accent` は通常の視覚でも近い。色を揃える（明度を同じにする）ほどこの差は
さらに消えるので、**記号の形と文字ラベルが区別の本体**になる。

### 4. 可視化を暗地で描く

- Datawrapper: 暗地では**各要素の地に対するコントラストを明るい版と同じに保つ**算法で色を導く（白地の黒い字と黒地の白い字が同じ比。濃い色は明るく、明るい色は濃く反転）。分類は **7 色まで**、超えるなら図の種類を変えるかまとめる。灰は文脈・未選択・注釈に。補色の組（赤と緑・橙と青）と明るい地を避ける [16][16b]。
- Observable Plot: 既定が `currentColor` と透明な地なので、親の字の色に追随して暗地で動く。「黒は currentColor、白は名前付き変数（`var(--theme-background)` など）」。`mixBlendMode` を使うなら `isolation: isolate`。observable10（#4269d0 #efb118 #ff725c #6cc5b0 #3ca951 #ff8ab7 #a463f2 #97bbf5 #9c6b4e #9498a0）は CIELAB で分析し、OKLCH で候補を出し、Color Oracle で 2 型を確かめ、明るい地と暗い地の両方で数十の図を使って検査した 10 色 [17][17b][17c]。tsukumo の `surface` に載せると Lc −25（青）〜−64（黄）で、明度は揃っていない（L 0.55〜0.80）。
- Carbon: 単色の連続配色は暗い主題で向きを逆にする（最も明るい色が最大の値）。発散配色は主題で変えない [15]。
- Material 2 の data visualization: 「色の違いが見えない人には濃淡・形・質感」「ラベルを直接付ければ凡例が要らない」。分類の色数の上限と暗地の条は見つからなかった [7c]。
- tsukumo の現状: 系列色は Chart.js 4.5.1 の colors プラグインの既定（#36a2eb #ff6384 #ff9f40 #ffcd56 #4bc0c0 #9966ff #c9cbcf）で、`surface` 上で Lc −36〜−78、L 0.64〜0.87。目盛りの字は `ink-quiet`、格子と軸は `rule`（`chart.ts`）。コンテキストの内訳 `context-*` は L 0.53〜0.72・C 0.13〜0.18 の飽和色で Lc −26〜−42。

### 5. コードブロックと図

| テーマ                                                              | 地                                                                                                        | 本文の字                                      | 弱い字                                                                      | 色の割り当てと設計文書                                                                                                                                                                                                                            |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub Dark（highlight.js `github-dark`。tsukumo が配っている）[18] | #0d1117（tsukumo では `ground` に置き換わる）                                                             | #c9d1d9（`ground` 上で Lc −77）               | comment #8b949e（Lc −43）                                                   | keyword #ff7b72 / string #a5d6ff / 定数 #79c0ff / 名前 #d2a8ff / 組込み #ffa657（Lc −52〜−77）。Primer の現行 dark は comment が #656c76 で他は同じ。設計根拠の文書は無く、GitHub のブログは「全トークンの 4.5:1 / 3:1 を自動で検査」とだけ [10e] |
| One Dark [19]                                                       | hsl(220, 13%, 18%) = #282c34                                                                              | mono-1 hsl(220, 14%, 71%) = #abb2bf（Lc −56） | mono-2 55% / mono-3 40%                                                     | 色相 8 つ（cyan 187・blue 207・purple 286・green 95・red 355 / 5・orange 29 / 39）を彩度 38〜82%・明度 51〜69% に。設計文書は見つからなかった                                                                                                     |
| Catppuccin Mocha [20]                                               | base #1e1e2e。沈む面は mantle #181825 / crust #11111b、浮く部品は surface0〜2 #313244 / #45475a / #585b70 | text #cdd6f4（Lc −80）                        | subtext1 #bac2de / subtext0 #a6adc8（Lc −56）/ overlay0〜2                  | keyword = mauve、string = green、function = blue、type = yellow、number = peach。状態は error = red・warning = yellow / peach・success = green・info = teal / blue。「読めることが最優先」                                                        |
| Rosé Pine [21b]                                                     | base #191724 / surface #1f1d2e（入力欄・パネル）/ overlay #26233a（活性タブ）                             | text #e0def4（Lc −87）                        | subtle #908caa（句読点・演算子。Lc −41）/ muted #6e6a86（コメント。Lc −25） | love = エラー・削除、gold = 文字列・警告、rose = 真偽値・変更、pine = 関数、foam = 情報・追加、iris = 引数・リンク・ヒント。highlight low / med / high は行・選択・枠                                                                             |

- インラインコードの地と本文の段差: Primer は `bgColor-muted` #151b23（地より 1.09:1 明るい）、Catppuccin は mantle（1.07:1 暗い）、Material 3 の 2026 版は surface 4 → container 9（約 1.1:1）。向きは両方あるが**段差は 1.1〜1.3:1** で、tsukumo の `surface-raised`（1.31:1）と `ground`（1.10:1）は同じ帯にある。
- Mermaid [22]: テーマは 11 種（default / neutral / dark / forest / base / redux 系 / neo 系）で、**`themeVariables` で差せるのは `base` だけ**、値は hex のみ（CSS 変数・色名は不可）。`darkMode: true` にすると `primaryTextColor` の既定が #333 → #eee、`primaryBorderColor` は `mkBorder(primaryColor, darkMode)`、`edgeLabelBackground` は `darken(secondaryColor, 30)`。`lineColor` と `arrowheadColor` は **`invert(background)`**、`textColor` は `primaryTextColor` を継ぐ。`secondaryColor` は primary の色相 −120°、`tertiaryColor` は +180°。固定の `dark` は background #333・primaryColor / mainBkg #1f2020・textColor #ccc・border1 #ccc・labelBackground #181818・clusterBkg #302F3D・noteBkgColor #fff5ad。

### 6. 暗い画面での長文の疲れ（研究）

| 研究                                                        | 課題                                               | 結果                                                                                                                                                                     |
| ----------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Legge, Pelli, Rubin & Schleske 1985 I（正常視）[23]         | 走査する文章の読速                                 | **極性の効果なし**（0.3°〜2° の字で最大読速）                                                                                                                            |
| Legge, Rubin, Pelli & Schleske 1985 II（低視力 16 名）[23b] | 同上                                               | 分散の 64% は中心視野の欠損と**中間透光体の濁り**で説明。濁りのある人は黒地白が速い（反転の効果は 14%。☆）                                                               |
| Buchner & Baumgartner 2007 [24]                             | 校正                                               | 正極性（白地に黒）が一貫して良い。**周囲の明るさ（暗室 / 事務所）にも色（白黒 / 青黄）にも依らない**。赤字緑地の色差は輝度差を補えない。生理指標と自覚症状は条件で差なし |
| Buchner, Mayr & Brandt 2009 [25]                            | 校正。輝度を極性と独立に操作                       | **画面全体の輝度を揃えると極性の差は消える**。効くのは輝度だけ                                                                                                           |
| Piepenbrock, Mayr, Mund & Buchner 2013 [26]                 | 視力検査 + 校正。若年と 60〜85 歳                  | 両年齢で正極性が有利。老化で網膜照度が落ちる分を明るい画面が補うという説明                                                                                               |
| Piepenbrock, Mayr & Buchner 2014（Human Factors）[27]       | 校正。8 / 10 / 12 / 14pt                           | 正極性の優位は**字が小さいほど直線的に増える**                                                                                                                           |
| Piepenbrock, Mayr & Buchner 2014（Ergonomics）[28]          | 校正 + 瞳孔径                                      | 正極性で瞳孔が小さく成績が良い。輝度（瞳孔 → 網膜像の鮮明さ）仮説を支持                                                                                                  |
| Dobres, Chahine & Reimer 2017 [29]                          | 一瞥の語彙判断。2 サイズ、暗所 / 昼光              | **暗い部屋 + 負極性だけ**閾値が悪い。明るい部屋では差なし                                                                                                                |
| Aleman, Wang & Schaeffel 2018 [30]                          | 1 時間の読書と脈絡膜厚（OCT）                      | 白地黒で約 16 µm 薄く、黒地白で約 10 µm 厚く。近視の進行と結び付く（若年被験者・短時間）                                                                                 |
| Dark Mode or Light Mode?（2024、134 名）[31]                | 棒・折れ線・散布図の分析課題。<60 歳 69・≥60 歳 66 | **どちらが良いかは人による**（同じ程度の割合が各極性で有利）。応答時間の差は平均 36%。年齢で変わらない。両方を用意せよ                                                   |

限界: いずれも数分〜1 時間の課題で、測ったのは成績（正答・速さ）であって疲れの主観ではない。差の正体が輝度なら、暗い UI で字を
さらに白くしても瞳孔は開いたままで像は鮮明にならず、代わりにハレーションが増える [6]。乱視とハレーションを扱う査読論文は
見つからなかった（APCA の作者の記述と解説記事のみ）[6][32]。

## tsukumo に効く示唆

現行の実測（`surface #221f2b` 上）:

| 要素                                                 | 値                          | WCAG                 | APCA Lc                    | 判定                                                                                                     |
| ---------------------------------------------------- | --------------------------- | -------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------- |
| `ink` 本文 15px                                      | #e8e3ea                     | 12.8:1               | −88.5（`ground` 上 −89.6） | **変えない**。Lc 90 の段で 14px/400 まで本文に使える。#fff は Lc −106 で作者の上限を超える               |
| `ink-quiet` 13px                                     | ink 60% = #99959e           | 5.5:1                | −43.7                      | 13px/400 の本文は Lc 75、本文でない字でも 60 が要る。**不足**                                            |
| `rule`                                               | #615e68                     | 2.55:1               | −18                        | 仕切りには十分（Lc 15 超）。線だけで押せる縁とフォーカスの輪には 3:1 に満たない                          |
| `rule-quiet` / `surface`↔`ground` / `surface-raised` | —                           | 1.17 / 1.10 / 1.31:1 | —                          | 他システムの段差（1.07〜1.3:1）と同じ帯。変えない                                                        |
| `accent`                                             | #6fe3cd（L 0.84・C 0.11）   | 10.4:1               | −76                        | 字にも線にも使える。Material の tone 80 相当の明るさ・中程度の彩度で暗地の差し色の形に合う。**変えない** |
| `state-ok` / `state-warn`                            | #7ee081 / #e3c766           | 9.9 / 9.7:1          | −73 / −72                  | 十分                                                                                                     |
| `state-ng` / `state-ask` / `state-memo`              | #e88b8b / #8ab4e8 / #bca0ec | 6.5 / 7.5 / 7.2:1    | −51 / −58 / −56            | ok・warn より 15〜20 弱い。**ng がいちばん弱い**                                                         |
| `context-*` 7 色                                     | L 0.53〜0.72                | 3.3〜6.5:1           | −26〜−51                   | `context-messages #008300` は 3.27:1 で 1.4.11 の 3:1 ぎりぎり                                           |
| `usage-ink-faint`                                    | #6f6d7a                     | 3.3:1                | −25                        | 目盛りの字としては Lc 30 の床を割る                                                                      |

候補（値は手元の計算。採るかはこの文書の外）:

| 対象                       | 候補                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | 根拠                                                                                                                                                                  |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 補助の字                   | `ink-quiet` を **72〜75%**（#b1acb5〜#b6b2ba、Lc −56〜−59、7.3〜7.8:1）に上げ、目盛り・札のラベルのような「読めればよい字」だけ 60%（Lc 44 > 床 30）を残す                                                                                                                                                                                                                                                                                                                                                            | APCA の補助文 = 本文 −15 [3]。Radix 11 段（Lc 60）・Catppuccin subtext0（−56）と同じ帯。Primer の muted は −46 だが WCAG 6.5:1 を目標にした値                         |
| 状態色                     | 5 色を **OKLCH L≈0.80・C≤0.12** に揃える。例: ok #8bd28d（Lc −67）/ warn #d9bb66（−65）/ ng #f8a4a3（−63）/ ask #97c1f7（−65）/ memo #c7aff5（−63）。最小の変更なら ng → #f2a0a0（−61）、ask → #9cc1ee（−65）、memo → #c7aef0（−63）                                                                                                                                                                                                                                                                                  | 暗地の差し色は明度で浮かせ彩度を上げない [6b][7][8]。ok の C 0.16 は 5 色で最も高く、accent と ΔE 0.095 で近い                                                        |
| 状態の記号                 | 色を揃えるほど色覚の差は消える（L 0.80 の ok↔ng は 2 型で ΔE 0.02）ので、**記号の形を 3 種で固定（✓ / ! / ×）し、文字ラベルを外さない**。表の中では記号 + 字、色は 1 割の染めだけ                                                                                                                                                                                                                                                                                                                                     | WCAG 1.4.1 [1]、CUD [13]、Primer の 3 点セット [10c]。この画面の原則5 と同じ                                                                                          |
| 前後の数（before → after） | 向きは矢印と数で言い、色に増減の意味を持たせない。強調するなら明度差（新しい値を `ink`、元の値を `ink-quiet`）                                                                                                                                                                                                                                                                                                                                                                                                        | Tol の high-contrast は明度の段で分ける [14]。緑 / 赤は 2 型で同じ色                                                                                                  |
| 系列色                     | Chart.js の既定を使わず **6 色を OKLCH L 0.78・C 0.11** で作る。例: #87bafd（255°）/ #f49f81（40°）/ #c2a7f4（300°）/ #aec26f（120°）/ #ea9bc7（345°）/ #d3b460（90°）。「その他」は `context-other #a6a2b0`。7 色目からはまとめる。accent の色相（180°）は系列に使わない                                                                                                                                                                                                                                             | Datawrapper の 7 色上限 [16b]、observable10 の設計手順（OKLCH + 2 型の模擬）[17c]、Carbon の「暗い主題は明るい側」[15]。Chart.js の既定は L 0.64〜0.87 で揃っていない |
| 格子・軸                   | 格子は `rule-quiet`、軸線は `rule`、目盛りの字は 72% の `ink-quiet`。白い線を引かない                                                                                                                                                                                                                                                                                                                                                                                                                                 | Plot の currentColor の作法 [17]、Datawrapper の等コントラスト [16]                                                                                                   |
| 枠                         | `rule` は据え置き。入力欄の輪郭とフォーカスの輪だけ **40% の混色（#716d77、3.2:1）** か `accent`                                                                                                                                                                                                                                                                                                                                                                                                                      | WCAG 1.4.11 [1]。Primer・Radix も通常の枠は 1.9:1 で、3:1 は部品の縁だけ [10][11]                                                                                     |
| 字の大きさ・太さ           | 本文 15px/400・行間 1.75 は維持。**13px 未満と weight 300 を使わない**。`-webkit-font-smoothing` は既定のまま                                                                                                                                                                                                                                                                                                                                                                                                         | 小さい字ほど暗地が不利 [27]、APCA の Lc 75 は 16px/500 か 18px/400 [3]、[6c]                                                                                          |
| コード                     | `github-dark` の字 #c9d1d9（Lc −77）と comment #8b949e（Lc −43）を `ink` / 72% の `ink-quiet` に寄せると本文と段が揃う。トークン色は L 0.73〜0.86 で既に明るい側                                                                                                                                                                                                                                                                                                                                                      | Catppuccin / Rosé Pine が字の段を本文と共有している [20][21b]                                                                                                         |
| Mermaid                    | `theme: "base"` + `darkMode: true` + `themeVariables` を**トークンから hex に解いて**渡す（`chart.ts` の `resolveColor` と同じ手。`color-mix` の結果は `rgb()` で返るので hex へ変換）: background = `surface`、primaryColor = `surface-raised` を不透明にした #36333e、primaryTextColor / textColor = `ink`、primaryBorderColor = `rule`、lineColor = 72% の `ink-quiet`、clusterBkg = `ground`、edgeLabelBackground = `surface`、noteBkgColor = `surface-accent`、noteTextColor = `ink`、fontFamily = `--font-sans` | `base` だけが差せる・hex のみ [22]。固定の `dark` は #333 の地で tsukumo の地と 2 段ずれる                                                                            |

変えないもの: `ground` / `surface` / `ink` / `accent` の 4 つのつまみと、地の 3 段（沈む・基準・浮く）。研究が示す「明るい画面のほうが
読める」は暗い画面という前提を覆す根拠にはならず（[31] のとおり人による）、対策は輝度ではなく字の大きさ・太さ・補助文の段で取る。

## 出典一覧

★ 一次 / ☆ 二次。

1. ★ W3C, WCAG 2.2（1.4.1 / 1.4.3 / 1.4.6 / 1.4.11、large scale text の定義）<https://www.w3.org/TR/WCAG22/>
2. ★ W3C, Understanding SC 1.4.3 <https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html>、Understanding SC 1.4.1 <https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html>
3. ★ Myndex, APCA in a Nutshell（Lc の段と字の表）<https://git.apcacontrast.com/documentation/APCA_in_a_Nutshell>
4. ★ W3C, WCAG 3.0 Working Draft（2026-09-10）<https://www.w3.org/TR/wcag-3.0/>
5. ★ Myndex, apca-w3 0.1.9 の実装（定数 0.56 / 0.57 / 0.62 / 0.65、blkThrs 0.022、blkClmp 1.414、scale 1.14、offset 0.027）<https://github.com/Myndex/apca-w3>
6. ★ Myndex, SAPC-APCA Discussion #111「Regarding "off white" and "not quite black"」<https://github.com/Myndex/SAPC-APCA/discussions/111>
   - 6b. ★ 同 #74「HDR Displays, Dark Mode Color Palettes, and APCA」<https://github.com/Myndex/SAPC-APCA/discussions/74>
   - 6c. ★ 同 #21「More to white text than meets the eye」<https://github.com/Myndex/SAPC-APCA/discussions/21>
7. ★ Material Design 2, Dark theme（SPA で直接は取れず、r.jina.ai 経由で本文を読んだ）<https://m2.material.io/design/color/dark-theme.html>
   - 7b. ★ material-components-android ElevationOverlayProvider.java <https://github.com/material-components/material-components-android/blob/master/lib/java/com/google/android/material/elevation/ElevationOverlayProvider.java>
   - 7c. ★ Material Design 2, Data visualization <https://m2.material.io/design/communication/data-visualization.html>
8. ★ material-color-utilities color_spec_2021.ts / color_spec_2026.ts（tone と ContrastCurve）<https://github.com/material-foundation/material-color-utilities/tree/main/typescript/dynamiccolor>、M3 Color roles <https://m3.material.io/styles/color/roles>
9. ★ Apple HIG, Dark Mode <https://developer.apple.com/design/human-interface-guidelines/dark-mode>、Color <https://developer.apple.com/design/human-interface-guidelines/color>（DocC の JSON から本文を読んだ）
10. ★ @primer/primitives の配布 CSS（dark）<https://unpkg.com/@primer/primitives/dist/css/functional/themes/dark.css>
    - 10b. ★ Primer, Color usage <https://primer.style/product/getting-started/foundations/color-usage/>
    - 10c. ★ Primer, StateLabel <https://primer.style/product/components/state-label>
    - 10d. ★ Primer, Color considerations <https://primer.style/accessibility/design-guidance/color-considerations/>
    - 10e. ★ GitHub Blog, Unlocking inclusive design <https://github.blog/engineering/user-experience/unlocking-inclusive-design-how-primers-color-system-is-making-github-com-more-inclusive/>
11. ★ Radix Colors, Understanding the scale <https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale>（値は @radix-ui/colors の CSS を unpkg から）
12. ★ Tailwind CSS v4, Dark mode <https://tailwindcss.com/docs/dark-mode>、shadcn/ui Theming <https://ui.shadcn.com/docs/theming>
13. ★ 岡部・伊藤, Color Universal Design <https://jfly.uni-koeln.de/color/>
    - 13b. ☆ 同ページの図の値の転記（Wong 2011, Nature Methods 8:441 <https://www.nature.com/articles/nmeth.1618> は認証で読めず）
    - 13c. ★ CUD 推奨配色セット ver.4 <https://jfly.uni-koeln.de/colorset/>
14. ★ Paul Tol, Colour Schemes <https://sronpersonalpages.nl/~pault/>
15. ★ Carbon Design System, Data visualization color palettes <https://carbondesignsystem.com/data-visualization/color-palettes/>
16. ★ Datawrapper, Dark mode for all visualizations <https://www.datawrapper.de/blog/dark-mode-for-embedded-visualizations>
    - 16b. ★ Datawrapper Academy, What to consider when choosing colors <https://www.datawrapper.de/academy/what-to-consider-when-choosing-colors-for-data-visualization>
17. ★ Observable Plot, Discussion #1461 dark mode <https://github.com/observablehq/plot/discussions/1461>
    - 17b. ★ d3-scale-chromatic observable10.js <https://github.com/d3/d3-scale-chromatic/blob/main/src/categorical/observable10.js>
    - 17c. ★ Observable Blog, Crafting an effective data visualization color palette（r.jina.ai 経由）<https://observablehq.com/blog/crafting-data-colors>
18. ★ highlight.js 11.12.0 `styles/github-dark.min.css`（node_modules の実物。tsukumo は `vendor-asset.ts` でこれを配る）
19. ★ atom/one-dark-syntax `styles/colors.less` <https://github.com/atom/one-dark-syntax/blob/master/styles/colors.less>
20. ★ Catppuccin style guide <https://github.com/catppuccin/catppuccin/blob/main/docs/style-guide.md>、palette.json <https://github.com/catppuccin/palette>
21. ★ Machado, Oliveira & Fernandes 2009, IEEE TVCG 15(6)（色覚の模擬行列。係数は論文の表の転記）<https://doi.org/10.1109/TVCG.2009.113>
    - 21b. ★ Rosé Pine palette README（Roles）と palette.json <https://github.com/rose-pine/palette>
22. ★ Mermaid, Theme Configuration <https://mermaid.js.org/config/theming.html>、theme-base.js / theme-dark.js <https://github.com/mermaid-js/mermaid/tree/develop/packages/mermaid/src/themes>
23. ★ Legge, Pelli, Rubin & Schleske 1985, Vision Research 25:239（抄録は Europe PMC）<https://doi.org/10.1016/0042-6989(85)90117-8>
    - 23b. ★ Legge, Rubin, Pelli & Schleske 1985, Vision Research 25:253 <https://doi.org/10.1016/0042-6989(85)90118-x>。14% は ☆ 検索の抜粋（Legge 研究室の PDF）
24. ★ Buchner & Baumgartner 2007, Ergonomics 50(7):1036 <https://doi.org/10.1080/00140130701306413>
25. ★ Buchner, Mayr & Brandt 2009, Ergonomics <https://doi.org/10.1080/00140130802641635>
26. ★ Piepenbrock, Mayr, Mund & Buchner 2013, Ergonomics 56(7):1116 <https://doi.org/10.1080/00140139.2013.790485>
27. ★ Piepenbrock, Mayr & Buchner 2014, Human Factors <https://doi.org/10.1177/0018720813515509>
28. ★ Piepenbrock, Mayr & Buchner 2014, Ergonomics 57:1670 <https://doi.org/10.1080/00140139.2014.948496>
29. ★ Dobres, Chahine & Reimer 2017, Applied Ergonomics 60:68 <https://doi.org/10.1016/j.apergo.2016.11.001>
30. ★ Aleman, Wang & Schaeffel 2018, Scientific Reports 8:10840 <https://doi.org/10.1038/s41598-018-28904-x>
31. ★ Dark Mode or Light Mode? Exploring the Impact of Contrast Polarity on Visualization Performance Between Age Groups（arXiv 2409.10841）<https://arxiv.org/abs/2409.10841>
32. ☆ Nielsen Norman Group, Dark Mode vs. Light Mode: Which Is Better? <https://www.nngroup.com/articles/dark-mode/>
33. ☆ IBM Design Language, Technical diagrams（検索の抜粋）<https://www.ibm.com/design/language/infographics/technical-diagrams/design/>
