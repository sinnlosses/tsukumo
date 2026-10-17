# レポートの紙面の幾何 — 幅の段・横並び・最初の1画面・組み替えの先例（2026-10-18）

**この文書は調査の記録であって正典ではない。** `docs/` の他ファイルにある「節の索引」はここには作らない。
正典は `docs/architecture/screen-design.md` 13.1 原則4・13.3・13.4 と `docs/architecture/display.md`、10-17 の提案は
`docs/research/report-excellence-strategy.md`（以下「提案書」）で、**採用が決まるまでコードは1行も変わらない**。

**主題**: 塊どうしの配置と紙面の幾何。1列か横に並べるか、幅の段、図と表の置き場、最初の1画面の組み方、幅が変わったときの
組み替え、長い塊の切り方。塊ごとの作法は `docs/research/report-block-craft.md`、Distill の段の名・Tufte の傍注・題の2段は
`docs/research/beautiful-explanation-design-precedents.md`、空間近接は `docs/research/comprehension-science-for-reports.md` にあり、
ここでは引くだけにする。提案書で決まった値（格子 13/26・見出し 52/13・柱の 160px と 28px・図の題は下で表の題は上）は繰り返さない。

**出典の印**: 無印は一次情報（原典・公式文書・配布 CSS の本文）。**【実測】**は 2026-10-18 に配布 CSS を読んだ値か、headless Chromium
（playwright-core 1.63）で窓幅を変えて測った値。**【二次】**は二次情報しか読めなかったもの。**【換算】**は私の計算、**【推測】**は先例からの
外挿。tsukumo の寸法は `/tmp/ux-now/` と `docs/history/mockup/report-excellence-2026-10-17/` の画から読んだ（既定の比率 65:35・75:25）。

## 要点（10行以内）

1. tsukumo の読む面は**横長で背が低い**: 1440×900 で幅 約 764 × 高さ 約 458px、1920×1080 で 約 1105 × 575px【実測】。ブラウザの1画面の約半分の高さで、Android の窓の分類なら 1440×900 は高さ compact（480dp 未満。「2枚組は実用的でない」）に当たる[18]
2. 1400×900 の見本では**判決の頭（目録〜検証の開いた行）が最初の1画面の約 2/3（約 300px）を使い、図1は題だけが折り目に掛かる**【実測】。閲覧時間の 57% は最初の1画面に、74% は2画面目までに集まる（NN/g）[20]
3. 先例の幅の段は**3〜4段**で、**広い段は本文の 1.25〜1.5 倍で止める**（Distill の page は text の 1.52 倍、Observable のコードは文の 1.5 倍）【換算】。tsukumo は2段（地の文 42em と内幅）で、1920 では図とコードが本文の 1.75 倍、やり取りの列を畳むと 2.1 倍まで伸びる
4. 図の既定の段は2派（Distill v2 は頁幅、Quarto・Medium・Substack・Observable は本文幅で書き手が広げる）。**全幅は書き手の名指しだけ**はどの先例も同じ
5. 横に並べる先例は**器の幅で「全部か1列か」**を切り替える（Observable の grid は `@container` で 640/720/1080px、Every Layout の Switcher は閾値と個数の上限、Datawrapper は 500px）。Stripe の API 参照は本文とコードを 1:1 で並べ、器が 約 790px を割ると縦に積む（列の下限 約 350px）【実測】
6. tsukumo の `compare`・`beforeAfter`・`image` の注・`files` は**窓幅の `@media`（760px）**で縦に落ち、比率とやり取りの列で変わる器の幅を見ていない。`options`（minmax 14rem）は 764px で3列になり、4案だと **3＋1 の孤児の段**ができる【換算】
7. 長い塊は**内側のスクロールを避けて切る**: Baymard は内側のスクロールを「使うならごく控えめに」とし、切るなら 6〜10 件を残す[31]。GitHub の diff は1ファイル 400 行まで自動で読み込み[29]、GitLab は上限の 10% で畳む[30]
8. 題の位置（図の上か下か）を操作した実験は今回も見つからなかった（3回探した）。隣の研究は題の**中身**を操作したもの[25][26]

## 1. 知見: 幅の段（size classes）

### 1.1 先例の段の実値

| 先例                                  | 段（幅）                                                                                                                                                                  | 既定の置き場                                                                                                 | 狭い窓                                                      |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Distill v1（窓 1080 以上）【実測】[2] | body 648・body-outset 744・middle 816・middle-outset 912・page 984・page-outset 1080・screen 全幅・gutter 144                                                             | 記事の直下の子は body。`centered` を付けない既定では **middle も page も左端を body に揃えたまま右へ伸びる** | 1080 未満は全段が同じ幅（左右 72px か 24px の余白）に潰れる |
| Distill v2【実測】[1]                 | 窓 1180 以上: text 704・middle 888・page 1072・gutter 152・screen。1000〜1179: 512・644・776・116。768〜999: 472・533・594・106                                           | 子は text、**`d-figure` と題の塊は page**、`.side` は gutter                                                 | 768 未満は 8px の余白の1列に全段が重なる                    |
| Quarto【実測】[4][5][6]               | body minmax(500px, 800px − 溝)・margin 250（3区画）・sidebar 250・溝 1.5em。column-body / -outset / page-inset / page / screen-inset / screen / margin と各 -left・-right | すべて body。図と表は `fig-column`・`tbl-column` で書き手が名指す                                            | 992 未満は中の格子、**768 未満で柱の中身を本文の列へ畳む**  |
| Observable Framework【実測】[7]       | 文・表・図・題・見出し 640、箇条と引用 600、**コード 960**（本文の左右へ 16px はみ出す）、grid と card は main の全幅（main は最大 1440）                                 | 図は 640。広げたいものは grid に入れる                                                                       | grid だけが器の幅で列を減らす（2章）                        |
| Tailwind Typography【実測】[8]        | `prose` の 65ch の1段だけ                                                                                                                                                 | 図・表・コードも同じ列                                                                                       | 段なし                                                      |
| Medium【二次】[12]                    | 本文 約 680〜740px・中の幅・全幅の3段                                                                                                                                     | 本文。画像ごとに書き手が選ぶ                                                                                 | —                                                           |
| Substack【二次】[11]                  | 列 約 730px と全幅の2段（全幅は 2022-01 に足した）                                                                                                                        | 列。画像ごとに切り替え                                                                                       | —                                                           |
| LaTeX・Typst[9][10]                   | 段組の1段と、両段にまたがる `figure*`（Typst は `scope: "parent"`）                                                                                                       | 図は流れの中か頁の上下。**`figure*` は頁の上端にしか置けない**                                               | —                                                           |

### 1.2 段の使い分けの規則（先例に共通するもの）

- **地の文だけが測る列に縛られ、コードと図は一段広い**: Observable はコード 960 / 文 640（1.5 倍）、Distill の page / text は v1・v2 とも 1.52 倍、
  middle / text は 1.26 倍【換算】。Quarto の page 系は本文＋柱で 1.3 倍前後【換算】
- **全幅は書き手が名指したときだけ**: 既定で全幅に置く塊を持つ先例は無い。Distill の guide も screen を "Occasionally" と書く[3]
- **左揃えの紙面では広い段は右へだけ伸びる**: Distill v1 の既定（非 centered）は body・middle の左端を揃えて右へ伸ばし、中央に寄せるのは
  `centered` を選んだときだけ[2]。Observable の 960 のコードも左端は文と同じ線（はみ出しは地だけ）[7]
- **狭い器では段が1つに潰れる**: Distill（v1 は窓 1080 未満、v2 は 768 未満）・Quarto（768 未満）とも、段の差は広い窓でだけ現れる
- **図の既定は2派**: 頁幅を既定にする Distill v2 と、本文幅を既定にして書き手が広げる Quarto・Medium・Substack・Observable。
  tsukumo の「表・コード・図は内幅をそのまま使う」（13.1 原則4）は前者に近く、上限が無い点で先例のどれとも違う

## 2. 知見: 横に並べる条件

| 知見（数と条件）                                                                                                                                                                                                                                                                   | 出典 |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| Tufte: small multiples は同じ意匠の小さな図を**目の届く範囲（eyespan）に**繰り返し、"Compared to what?" に直接答える。比較は目の届く範囲で強いる【二次】                                                                                                                           | [13] |
| Eyetrack III（2004・46人・見本のニュースサイト）: **1列の形が多列の形より注視の数が多かった**。目は左上に最初に止まり左→右へ。短い段落は長い段落の2倍の注視                                                                                                                        | [14] |
| Datawrapper の small multiples: 既定の「固定」は**器が 500px より広ければ desktop の列数、狭ければ mobile の列数**。「自動」は1枚の最小幅（例 200px）から列数を決める（300px で1列・500px で2列・900px で4列）。目盛りは既定で全枚共通                                             | [15] |
| Observable の grid: main を器（`container-type: inline-size`）にし、**`grid-cols-2`・`-4` は器 640px 以上で2列、`-4` は 1080px 以上で4列、`-3` は 720px 以上で3列**、それ未満は1列。4枚は 1→2→4 で 3＋1 にならない。行の高さは揃える（`grid-auto-rows: 1fr`）、すき間 1rem【実測】 | [7]  |
| Every Layout の Switcher: 横並びと縦積みを**器の幅の閾値でいっせいに**切り替える（`flex-basis: calc((閾値 - 100%) * 999)`、閾値の既定は測る列）。**個数が上限を超えたら幅によらず縦**。Sidebar: 主の側が器の **50%** を割ったら脇を下へ回す（脇が狭いほうでなくなれば脇でない）    | [16] |
| Stripe の API 参照: 本文とコード例を**ほぼ 1:1** で並べる（窓 1440 で 503 / 501px、1920 で 693 / 691px）。左の目次が出て器が 約 720px になる窓 1024 では縦に積み、窓 1100（器 約 790px）で並べ直す。並べたときの列の下限は **約 350px**【実測】                                    | [34] |
| Carbon の格子: 320（4列）/ 672（8列）/ 1056（16列）/ 1312 / 1584px。編集物・図・ダッシュボードは「伸びる列」、札は「固定の箱を折り返すか、溢れを横に転がす」                                                                                                                       | [17] |
| Android（M3）の窓の分類: 幅 600 / 840 / 1200 / 1600dp、高さ 480 / 900dp。**幅が medium でも高さが compact なら「2枚組は実用的でない」**                                                                                                                                            | [18] |
| 前後の比較は同じ位置の切り替えが並べるより速い（Josephs 2016）。`report-block-craft.md` 5章と提案書の判断8で扱い済み                                                                                                                                                               | —    |

**数の札（KPI）の先例**:

| 先例                                          | 列と寸法                                                                                   | 規則                                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Grafana【実測】[19]                           | 24列の格子、1段 30px・縦のすき間 8px、最小の高さ 90px（3段）。半分 12・3分の1 8・4分の1 6  | stat は**狭くなると sparkline を自動で隠す**                                 |
| Observable【実測】[7]                         | card は余白 1rem・角丸 0.75rem・14px。数は `.big`（700 32px/1）。`grid-cols-4` で 1→2→4 列 | card は grid の升目にだけ置く（`.grid > .card { margin: 0 }`）               |
| Carbon dashboards[17]                         | —                                                                                          | 最も大事な数を**上に、最も高いコントラストと最も広い面積で**。数の個数を絞る |
| Datadog・Linear Insights・Stripe の dashboard | ログインが要り測れなかった                                                                 | —                                                                            |

## 3. 知見: 最初の1画面の組み方

- **NN/g（2018。1920×1080 で注視 13 万点超）**: 閲覧時間の **57% が折り目より上、74% が最初の2画面（2160px まで）**。折り目の直後で注意が急に
  落ちる形は 2010 年（80%）と変わらない[20]
- **Eyetrack III**: 大きな見出しが左上にあると最初にそこを見る。小さい字は「読む」、大きい字は「走り読み」を促す。見出しと添え文が同じ大きさで
  同じ行に続くと両方読まれる[14]
- **新聞の紙面**: Garcia の Center of Visual Impact（目が最初に降りる1点を、紙面に1つ作る）【二次】[21]。Harrower の章立ては「各頁に支配的な画を
  1つ」「モジュール（矩形）で組む」[22]
- **Smart Brevity**: 6語以下の見出し → 1文のリード → "Why it matters" → "Go deeper"（深さは読者が選ぶ）【二次】[23]
- **Vercel の Deployment Details**: 頭に Created・Status・Duration・Environment・Domains・Source の欄を置き、
  **Deployment Summary・ログは開いて読む**[24]（欄の並びは【二次】）
- **Carbon dashboards**: 最も大事な数を上に、最も広い面積で[17]
- 判決の頭・検証の総括行・お願いの印の先例（GitHub の merge box・Copilot・Codex など）は提案書 3.1 と `engineering-report-forms.md` が扱い済み

共通するのは「**入口を1つ決め、そこに主張と1つの画（か数）を並べ、詳細は開いて読ませる**」こと。どの先例も最初の1画面の高さは
900〜1080px のブラウザを前提にしている。

## 4. 知見: 図と表の置き場、文と図の横並び、題の位置

- **文と図を同じ行に並べる形は3つ**: (a) 小さな図と注だけを余白の柱へ（Distill v2 の `.side` は gutter 152px[1]、v1 の `.l-body.side` は
  216px を右へ浮かせる[2]、Tufte の margin figure）、(b) 説明とコードを等分の2列（Stripe の API 参照）、(c) 教科書の回り込み（LaTeX の
  `wrapfigure`、CSS の `float`）。**主の図を本文の横に置く先例は見つからず**、主の図はどれも本文の流れの中で上下に置く
- **図の幅**: Datawrapper の埋め込みは「携帯で 380〜400px、大きな画面で 700px」[15]、Eyetrack III は 210×230px 以上で過半の人が見る[14]、
  Google は画像を本文の列より広くしない（`report-block-craft.md` 5章）。上限の数を条にした先例は無く、1章の段が上限の役をする
- **題の位置**: 2026-10-18 に3回探した（標準2回・extended 1回。caption / title の上下・視線・理解・Hartley の本文設計の研究）。**位置を操作した
  実験は見つからなかった**。隣の2本はどちらも題の中身を操作したもので、題が目立つ特徴を言うと読み手はそれを要点にし、目立たない特徴を言うと
  図のほうを信じる（Kim・Setlur・Agrawala, CHI 2021[25]）、線が1本なら統計の語の題が記憶に残る（Zhu・Cheng・Wu 2022[26]）。様式は Typst が
  既定で下に置き、表だけ上にする書き方を例に示す[9]。Quarto は上・下・**柱**（`cap-location: margin`）を選べる[27]。10-17 の決定
  （図は下・表は上）を覆す新しい根拠は無い

## 5. 知見: 塊の間のあきと区切り、箱の入れ子

| 先例                        | 塊どうし      | 前の塊 → 見出し | 見出し → 本文 | 測り方                                           |
| --------------------------- | ------------- | --------------- | ------------- | ------------------------------------------------ |
| GitHub の Markdown【実測】  | 16            | 24              | 16            | p・h2 の箱の間（窓 1440）                        |
| Notion の公開ページ【実測】 | 12            | 32              | 12            | 葉の要素の箱の間（窓 1440・本文の列 720px）      |
| Linear changelog            | 20            | 56              | 12            | `beautiful-explanation-design-precedents.md` 2章 |
| Observable【実測】          | 16            | —               | 4             | 計算済みスタイル                                 |
| MDN・Quarto【実測】         | 16・17（1em） | —               | —             | 段落の下の margin。Quarto の表の上下は 8.5       |
| Distill v1【実測】[2]       | 段落 24       | —               | —             | 図の上下は 48px（窓 1024 以上）                  |
| tsukumo（10-17 の値の束 B） | 13            | 52              | 13            | 題つきの図表は 39                                |

- 罫で区切るか余白で区切るかは `beautiful-explanation-design-precedents.md` 3章（Refactoring UI の "Use fewer borders"、NN/g の近接と
  共通領域）が扱い済みで、新しい先例は見つからなかった
- **箱の入れ子**: Splunk は「カードは他の器に入れず、カードの中にカードを入れない」[28]、Genesys Spark は「入れ子は情報の階層づくりに役立つが、
  層を重ねすぎると群にする利点が消える」として慎重に1段までを許す[28]。Observable は card を grid の升目にだけ置く[7]

## 6. 知見: 幅が変わったときの組み替え（境目の実測）

| 先例                | 境目                                                                        | 変わるもの                                                                                   |
| ------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Distill v2【実測】  | 窓 768・1000・1180px                                                        | 格子の列幅 45→50→60px・溝 16→32px。768 未満は1列                                             |
| Quarto【実測】      | 窓 768・992px                                                               | 992 以上で広い格子、768 未満で柱を本文へ。窓 1024 で本文 497px＋柱 227px、1440 で 788＋300px |
| MDN【実測】         | 窓 769〜800px の間で左の列（256px）、**1080px 前後で右の目次の列（256px）** | 右の目次が出ると本文の器を 766→504px に縮める（本文の幅より目次の位置を優先）                |
| Observable【実測】  | 器 640・720・1080px（`@container`）、窓 912px で右の目次（192px）           | grid の列数だけ。文の 640 はどの幅でも変えない                                               |
| Stripe docs【実測】 | 窓 760〜1024px の間で左の目次                                               | 本文 662〜813px・コード 678〜829px。API 参照は器 約 790px を境に2列と1列                     |
| GitHub【実測】      | —                                                                           | README の本文は測る列の上限を持たず、頁の器いっぱい（窓 1440 以上で 1012px）に伸びる         |
| Notion[33]          | 携帯                                                                        | 列を縦に積む。見出しが2つ以上なら右に目次を出し、追従させる                                  |
| tsukumo（いま）     | 窓 760px（`@media`）、器 42em＋160px（`@container report-gutter`）          | 760 で compare・beforeAfter・image の注・files・label 付きの箇条を1列に。器の閾値で余白の柱  |

- **器の幅で決める先例**: Observable の grid と Every Layout の Switcher・Sidebar[16]。Distill・Quarto・MDN は窓で決めるが、本文の器の幅が窓の
  幅で一意に決まる作り（利用者が領域の比率を動かさない）だから成り立つ【推測】
- **境目は「本文の列＋脇の列の下限」で決まる例が多い**: MDN の右の目次は 1080、Observable の目次は 640＋5rem＋192 ＝ 912、Stripe の2列は
  約 790、tsukumo の柱は 42em＋160 ＝ 790【換算】

## 7. 知見: 長い表・長いコード・長い一覧

| 先例                | 既定                                                                                                  | 超えたとき                                                                                                                                                                                                |
| ------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub の diff[29]  | 1ファイル **400 行・20KB を自動で読み込む**                                                           | 1ファイル 20,000 行・500KB、合計 20,000 行・1MB、300 ファイル、描画するファイル（画像・PDF）25 までは押して読み込む。超えると出さない                                                                     |
| GitLab の diff[30]  | 上限（パッチ 200KB・1,000 ファイル・50,000 行）の **10% に達したらファイルを畳む**                    | 上限を超えたら "Too large" で開けない                                                                                                                                                                     |
| Expressive Code[32] | 畳む範囲は書き手が名指す。既定の見た目は "X collapsed lines" の1行（`github`）                        | 開いた後も畳み直す行を残す型（`collapsible-start`・`-end`・`-auto`）がある                                                                                                                                |
| Baymard[31]         | 一覧は **6〜10 件を残して切る**。6 件未満で切ると全部だと思われ、15 件以上で問題が出始める            | 「もっと見る」は既定のリンクの見た目で、＋か∨の印を添え、最後の項目を薄くして続きを示す。**内側のスクロールは「使うならごく控えめに」**（全体が見えない・ページの送りを奪う・バーが見えず無いと思われる） |
| Datawrapper         | 表は画面より短く、長ければ頁送り（`report-block-craft.md` 3章）                                       | —                                                                                                                                                                                                         |
| tsukumo（いま）     | 表は書き手が切って `rest`。code は `marks` のある塊だけ無印 20 行超の範囲を畳む。高さの上限は持たない | 横に溢れる表だけ横スクロール（13.3）                                                                                                                                                                      |

## 8. tsukumo に効く示唆

印は効く先: 〔規約〕＝書き手への規約 / 〔塊〕＝report の欄 / 〔描画〕＝CSS・部品 / 〔仕組み〕＝検査・計測。原則・配置の正典に触れるものに
**「正典の変更」**と付ける。採否は決めない。

### 8.1 いまの紙面の寸法

| 窓（既定の比率）           | 読む面の幅        | 地の文 630px との比 | 最初の1画面の高さ（貼り付いた頭 約 53px を除く） | 26px の行で |
| -------------------------- | ----------------- | ------------------- | ------------------------------------------------ | ----------- |
| 1440×900・やり取りの列あり | 約 764px【実測】  | 1.21                | 約 458px【実測】                                 | 約 17.6 行  |
| 1440×900・列を畳む         | 約 990px          | 1.57                | 約 458px                                         | 同          |
| 1920×1080・列あり          | 約 1105px【実測】 | 1.75                | 約 575px【実測】                                 | 約 22 行    |
| 1920×1080・列を畳む        | 約 1340px【換算】 | 2.13                | 約 575px                                         | 同          |

- 幅と高さの比は 1.7〜2.3 で、先例が前提にするブラウザの1画面より背が低い。NN/g の「2画面で 74%」を当てると、読まれる範囲は
  約 916〜1150px【換算】
- 1400×900 の見本 `after-first.png` では、目録から検証の開いた行までが 約 300px、図1の題が 約 405〜440px にあり、図の本体は 約 480px から
  始まって 512px の領域の下端（折り目）に掛かる【実測】

### 8.2 いま／先例／差

| 項目         | いま                                                          | 先例                                                                                      | 差                                                                                |
| ------------ | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 幅の段       | 2段（地の文 42em と内幅。柱を持つ塊は 42em）                  | 3〜4段、広い段は本文の 1.25〜1.5 倍（Distill・Observable・Quarto）                        | 1920 で図・コードが本文の 1.75〜2.1 倍まで伸びる                                  |
| 図表の置き方 | 題つきの表と図は塊ごと内幅の中央（13.4）                      | 左揃えの紙面では左端を揃えて右へ伸ばす（Distill v1）、Observable は文の左端               | 中央の軸が地の文の列の軸から 1440 で 約 67px、1920 で 約 237px 右へずれる【換算】 |
| 縦落ちの基準 | 窓の 760px（`@media`）                                        | 器の幅（Observable・Every Layout）。2列の1列の下限は 約 300〜350px（Stripe・Datawrapper） | 比率とやり取りの列で器が変わるのを見ていない                                      |
| 横並びの列数 | `auto-fit`（stats 8rem・options 14rem・compare は2列固定）    | 全部か1列（Switcher）、1→2→4（Observable）、desktop / mobile の2値（Datawrapper）         | options 4案が 764px で 3＋1                                                       |
| 最初の1画面  | 判決の頭 約 300px＋図1の題で折り目                            | 入口を1つ決め、主張と1つの画か数を並べ、詳細は開く（Garcia・Harrower・Vercel・Carbon）    | 図1の本体も数も最初の1画面に入らない                                              |
| 箱の入れ子   | 中間レポートの破線の箱の中に、候補・見比べ・数の札（枠つき）  | 入れ子は避ける・1段まで（Splunk・Genesys）                                                | 中間レポートで2段                                                                 |
| 長い塊       | 書き手の `rest`、`marks` のある code だけ畳む、高さの上限なし | 6〜10 件で切る（Baymard）、400 行（GitHub）、上限の 10%（GitLab）                         | 何件・何行で切るかの目安が無い。図の高さが読む面の高さ（458px）を超えうる         |

### 8.3 採るとしたら

1. 〔描画〕**縦落ちを窓でなく器で決める**: `compare`・`beforeAfter`・`image` の注・`files`・label 付きの箇条の `@media (max-width: 760px)` を、
   本文の器（既にある `report-gutter`）への `@container` に移す。2列にする閾値は「1列 20em＋すき間」（約 40em ≈ 600px）で、Datawrapper の
   500px と Stripe の 1列 350px の間に入る【換算】。13.9 の 760px は画面全体の組み替えの境目として残る
2. 〔描画〕「正典の変更」**幅の段を3つにする**: 本文（42em）／広（`min(内幅, 63em)` ≈ 945px、本文の 1.5 倍）／全（内幅）。地の文・note・お願い・
   checks は本文、graph・mermaid・chart・svg・image・code・compare・beforeAfter・dimension・stats・options は広、内幅を超える表と列の多い
   matrix だけ全（書き手の名指しは要らず、塊の種類で決める）。広の段は地の文の左端から右へ伸ばす（Distill v1）。1440 の既定（764px）では
   3段とも内幅に潰れ、効くのは 1440 で列を畳んだときと 1920 だけ。13.1 原則4「表・コード・図は上限を置かない」の書き換え
3. 〔描画〕「正典の変更」**題つきの図表の中央の軸を地の文の列に寄せる**: 42em より狭い図表は 42em の列の中央に、広いものは左端を揃える。
   13.4「塊ごとレポートの幅の中央に置き」の書き換えで、題の位置（図は下・表は上）と題の中央揃えは変えない
4. 〔描画〕**横並びの列数を「全部か約数か1列」にする**: options・stats は個数 n と器の幅から、n 列が入るなら n 列、入らなければ n の約数
   （4→2、6→3→2）か1列にし、3＋1 を作らない（Observable の 1→2→4、Switcher）。個数が上限（例 7 以上）なら1列（Switcher の個数の上限）
5. 〔描画〕〔規約〕**最初の1画面に図1か数の上端を入れる予算を置く**: 判決の頭を最初の1画面の半分（1440×900 で 約 230px ≈ 9行）に収める目安で、
   超える分（開いた検証の行が3行を超えるなど）は畳む【推測】。別案として、器が 42em＋28＋300px（≈ 960px）以上のときだけ、書き手が最初の節の先頭に
   置いた `stats` を判決の頭の右の列に上端を揃えて置く形がある（新聞のリードと支配的な画、Vercel の頭の欄）。後者は `display.md` の
   「横に並べて Z 字に読ませない」に当たるので「正典の変更」で、目視が要る
6. 〔描画〕**図の高さを読む面の高さに収める**: `.layout-main` は既に `container-type: size` なので、graph・mermaid・svg・image に読む面の高さ
   （`cqh`）から貼り付いた頭を引いた `max-block-size` を掛け、縦横比を保って縮める。Datawrapper の「表は画面より短く」を図に広げた形【推測】
7. 〔塊〕〔規約〕**切る目安を数で言う**: 表と一覧は 10 行・10 件を超えたら上位を残して `rest`（Baymard の 6〜10）。`marks` の無い code も、
   読む面の2画面（約 45 行）を超えたら中ほどを畳む（GitHub は 400 行で、Expressive Code は名指し）。どちらも内側の縦スクロールにはしない
8. 〔描画〕**箱の入れ子を1段にする**: 中間レポートの破線の箱の中では、候補・見比べ・数の札の枠を外し、地の段か余白だけで分ける

### 8.4 採らないもの・保留

- **本文の2段組・主の図を本文の横に置く形**: 主の図を横に置く先例が見つからず、Eyetrack III でも1列が勝つ。提案書5章のとおり
- **題の位置**: 新しい根拠は無い（4章）。Quarto の柱の題（`cap-location: margin`）は先例としてあるが、柱に載せるのは memo と `aside` だけという
  13.4 の決定があるので挙げるだけにする
- **仮想化**: 表の中央値は 4行×3列（提案書 1.2）で、仮想化が要るのは数千行の一覧。レポートには当たらない

## 確かめていないこと

- tsukumo の寸法は画から読んだ値で、DOM で測っていない。利用者が比率を動かしたときの器の幅は数えていない
- Datadog・Linear Insights・Stripe の dashboard の数の札の列数と寸法（ログインが要る）。Linear の issue・Buildkite の頭の組み方
- Medium（help が 403）・The Pudding・NYT の幅の段の実値。Notion の表示件数の上限の選択肢（help に見つからない）。GitHub の issue の時系列が
  項目を隠す件数の閾値（公開の文書に無い）
- Notion のあきは公開ページ1枚の葉の要素の箱の間で、ブロックの余白の内訳は測り直しが失敗した
- Tufte の small multiples の文言と Garcia の CVI は二次でしか照合できなかった。Vercel の頭の欄の並びは検索結果の要約
- Eyetrack III は 2004 年・46 人・ニュースサイトの見本で、和文の技術文書の読み手に移せるかは確かめていない。Android の「高さが compact なら
  2枚組は実用的でない」はアプリの画面の話で、レポートの紙面に当てたのは私の外挿
- 8.3 の閾値（63em・20em・230px・45 行・10 件）は先例からの換算で、見本で目視していない
- 題の位置は3回探して見つからなかったが、学術データベース（ERIC・PsycINFO）の本文検索はしていない

## 出典一覧

1. Distill v2: [`template.v2.js`](https://distill.pub/template.v2.js)（埋め込みの CSS の格子と `d-figure`・`.side`）【実測】
2. Distill v1: [`template.v1.js`](https://distill.pub/template.v1.js)（`.l-body` 648px ほかの段と `@media`）【実測】
3. [Distill Guide: Layouts](https://distill.pub/guide/)
4. [Quarto: Article Layout](https://quarto.org/docs/authoring/article-layout.html)
5. [Quarto: HTML Page Layout](https://quarto.org/docs/output-formats/page-layout.html)（`grid` の既定値）
6. quarto-cli の [`_bootstrap-rules.scss`・`_bootstrap-mixins.scss`](https://github.com/quarto-dev/quarto-cli/tree/main/src/resources/formats/html/bootstrap)【実測】
7. Observable Framework の [`src/style/`（`grid.css`・`card.css`・`global.css`・`layout.css`）](https://github.com/observablehq/framework/tree/main/src/style)【実測】と [Markdown の文書](https://observablehq.com/framework/markdown)
8. [Tailwind Typography `src/styles.js`](https://github.com/tailwindlabs/tailwindcss-typography/blob/main/src/styles.js)【実測】
9. [Typst: figure](https://typst.app/docs/reference/model/figure/)（`placement`・`scope`・題の位置）
10. [LaTeX2e unofficial reference manual: figure](https://latexref.xyz/figure.html)
11. Substack: [New tools for writers（2022-01-10）](https://on.substack.com/p/new-tools-layout-options) / [Substack Image Size FAQ](https://frequentlyaskedquestions.substack.com/p/substack-image-size-faq-the-definitive)【二次】
12. Medium: [How to recreate Medium's article layout with CSS Grid（freeCodeCamp）](https://www.freecodecamp.org/news/how-to-recreate-mediums-article-layout-with-css-grid-b4608792bad1/)【二次】（Medium の help は 403）
13. Tufte, Envisioning Information の small multiples: [kraft.blog の抜き書き](https://kraft.blog/2006/02/envisioning-information-multiples-and-colors/) / [UXmatters: Small Multiples Within a User Interface](https://www.uxmatters.com/mt/archives/2005/12/small-multiples-within-a-user-interface.php)【二次】
14. [Poynter: Eyetrack III](https://poynter.org/?p=24963)（2004-08-24）
15. Datawrapper Academy: [Customizing your small multiple line chart](https://www.datawrapper.de/academy/customizing-your-small-multiple-line-chart) / [How to change the size of your embedded visualizations](https://www.datawrapper.de/academy/how-to-change-the-size-of-your-visualizations)
16. Every Layout: [The Switcher](https://every-layout.dev/layouts/switcher/) / [The Sidebar](https://every-layout.dev/layouts/sidebar/)
17. Carbon: [2x Grid overview](https://carbondesignsystem.com/elements/2x-grid/overview/) / [Dashboards](https://carbondesignsystem.com/data-visualization/dashboards)
18. [Android Developers: Use window size classes](https://developer.android.com/develop/ui/compose/layouts/adaptive/use-window-size-classes)
19. Grafana: [`public/app/core/constants.ts`](https://github.com/grafana/grafana/blob/main/public/app/core/constants.ts)【実測】/ [Stat visualization](https://grafana.com/docs/grafana/latest/visualizations/panels-visualizations/visualizations/stat/)
20. [NN/g: Scrolling and Attention](https://www.nngroup.com/articles/scrolling-and-attention/)（2018 の改訂）
21. Mario Garcia の Center of Visual Impact（Contemporary Newspaper Design 1981 と [The Mario Blog](https://garciamedia.com/?p=262) の引用。検索結果の要約で照合）【二次】
22. Harrower, The Newspaper Designer's Handbook の [章の概要（McGraw-Hill）](https://highered.mheducation.com/sites/0072407611/student_view0/chapter3/chapter_outline.html)
23. Smart Brevity: [journalism.co.uk: How Axios is reinventing text journalism](https://www.journalism.co.uk/how-axios-is-reinventing-text-journalism-with-smart-brevity/)【二次】
24. [Vercel Docs: Deploying to Vercel（Resources Tab and Deployment Summary）](https://vercel.com/docs/deployments)
25. Kim, Setlur, Agrawala, [Towards Understanding How Readers Integrate Charts and Captions: A Case Study with Line Charts](https://arxiv.org/abs/2101.08235)（CHI 2021）
26. Zhu, Cheng, Wu, [How Do Captions Affect Visualization Reading?](https://arxiv.org/abs/2205.01263)（arXiv 2022）
27. [Quarto: HTML options reference](https://quarto.org/docs/reference/formats/html.html)（`cap-location`・`fig-cap-location`・`tbl-cap-location`）
28. [Splunk React UI: Card](https://cdn.jsdelivr.net/npm/@splunk/react-ui@5.12.0/docs-llm/Card.md) / [Genesys Spark: Card usage](https://spark.genesys.com/latest/components/layout-and-containers/card/usage-2m0T8zL6)
29. [GitHub Docs: Repository limits](https://docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits)（Diff limits）
30. [GitLab Docs: Diff limits administration](https://docs.gitlab.com/administration/diff_limits/)
31. Baymard: [Inline scroll areas](https://baymard.com/blog/inline-scroll-areas) / [Truncation design](https://baymard.com/blog/truncation-design)
32. [Expressive Code: Collapsible Sections](https://expressive-code.com/plugins/collapsible-sections/)
33. [Notion Help: Columns, headings & dividers](https://www.notion.com/help/columns-headings-and-dividers)
34. 窓幅を変えて測ったページ（2026-10-18、窓 760〜1920px・高さ 900px）【実測】: [Stripe docs](https://docs.stripe.com/payments/accept-a-payment) / [Stripe API 参照](https://docs.stripe.com/api/charges/create) / [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/grid-template-columns) / [Quarto](https://quarto.org/docs/authoring/article-layout.html) / [Observable Framework](https://observablehq.com/framework/markdown) / [GitHub の README](https://github.com/observablehq/framework/blob/main/README.md) / [Notion の公開ページ](https://brainpint.notion.site/Configuration-Guide-8a6214e6126d438eb503c73527dbe62d)
35. tsukumo のいまの値: `src/browser/components/page/conversation/components/markdown/renderer/report-notation.module.css`・`main-view/main-view.module.css`・`conversation-layout/conversation-layout.module.css`（2026-10-18 の作業ツリー）、画は `/tmp/ux-now/report-blocks-1920.png`・`report-tool-1440.png` と `docs/history/mockup/report-excellence-2026-10-17/after-first.png`
