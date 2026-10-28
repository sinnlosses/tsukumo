# `report` の葉の部品を、Markdown に戻さず React の部品で直接描く（2026-10-28）

ステータス: 採用

**`a2ui` の面の葉の部品（19 種）は、部品の持ち主が React の部品として直接描く。葉を一度 Markdown の文字列に戻して旧い Markdown の描画に通す今の形は、移行の終わりまでに葉については使わなくする。** 直接描くと決めたのは利用者（2026-10-28）なので、この ADR は採るかを比べない。決めるのは、図表番号と傍注の渡し方・目次と演出と文字の選択を保つ条件・移す順・塊の区切りの持ち方・移したあとに残る描画の 5 つ。

ADR 0039 の論点 4（葉の実装は塊 → Markdown の変換を `Markdown` に通して再利用する）と未決 3（塊 1 つぶんを Markdown にする関数を切り出せるか）は、この ADR が引き取る。

## 何が困っていたか

- 葉を足すたびに、Markdown の記法（フェンスや HTML の組み立て）とその描画の両方を作ることになる。ADR 0041 のデザイントークンと `ui/` の部品で組み直したくても、葉の見た目は `markdown/` の CSS（17 ファイル・宣言 1,615 個。カスタムプロパティを除くと 1,563 個）が持つ。
- 葉 1 つの Markdown は、葉だけで決まらない。図表番号・表の札の色・傍注はレポート全体を 1 回なめる畳み込みの結果で、`a2uiReportView` がそれを葉の ID に当てて `leaves` に入れている。
- 操作できる `Table` は、表の Markdown の中から行の文字列を `indexOf` で探して前・行・後に割る。見つからなければ面ごと使えなくなる。

## 今の描き方

### 葉の部品ごとの経路

塊 → Markdown の関数は `src/shared/report/` の `report-markdown.ts` の `blockMarkdown` が入口で、部品ごとの組み立ては同じディレクトリの `report-*-markdown.ts` が持つ。描画は `src/browser/components/page/conversation/components/markdown/` の下（以下 `markdown/`）が受け持つ。

| 部品          | Markdown になる形                                                    | 描画を受け持つ `markdown/` の下                                               | 番号 | 生 HTML の許可に頼る点                  |
| ------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---- | --------------------------------------- |
| `Paragraph`   | 平文の段落（記号は逃がす）                                           | `markdown-renderer`・行内の印・出典リンク                                     | なし | 弱い                                    |
| `ItemList`    | 箇条・番号・チェック・流れ・カードの HTML                            | `markdown-renderer`・`folded-block`・`long-block-fold`・`task-check`          | なし | 強い（div・span・ol・class）            |
| `Table`       | 題・凡例・GFM の表・セルの span                                      | `markdown-renderer` の表・`folded-block`・`notation`                          | 表   | 強い（`align`・数値棒の `width`）       |
| `Matrix`      | 題・GFM の格子・凡例・印の span                                      | `Table` と同じ                                                                | 表   | 強い（`role`・`aria-label`）            |
| `Compare`     | 1 行の HTML（`compare` の 2 列）                                     | `notation`                                                                    | 図   | 中                                      |
| `BeforeAfter` | 前後の入れ物と、画像・コード・mermaid・svg のどれか                  | `report-image`・`before-after-zoom`・`region-frame`・`mermaid-block`          | 図   | 強い（img の `src` の形・svg）          |
| `Note`        | `note` の div（memo は本文に出さず前の葉の傍注へ）                   | `notation`（ラベルを文字として足す）                                          | なし | 中（演出が読む `report-pause-point`）   |
| `Stats`       | `stats` の div・折れ線の svg・帯の span                              | `notation`                                                                    | 図   | 強い（svg・`width`）                    |
| `Code`        | コードのフェンス（ファイル名・印は info 文字列）                     | `Pre`・`code-*`・`diff-*`・`shell-line`・`copy-button`                        | なし | 部分的（`data-filename`・`data-marks`） |
| `Mermaid`     | `mermaid` のフェンス                                                 | `mermaid-block`・`figure-zoom`                                                | 図   | なし                                    |
| `Graph`       | 一本道は `card-chain`、折り返しは svg、それ以外は mermaid            | `notation`・`figure-zoom`・`mermaid-block`                                    | 図   | 強い（svg の `data-*`）                 |
| `Chart`       | `chart` のフェンス（JSON）                                           | `chart-block` ほか                                                            | 図   | なし                                    |
| `Svg`         | svg を包んだ HTML と凡例                                             | `notation`・`figure-zoom`                                                     | 図   | 最も強い（svg の要素と属性の全部）      |
| `Timeline`    | 1 行の HTML（`margin-left`・`width` の %）                           | `notation`                                                                    | 図   | 強い（style の許可）                    |
| `Options`     | `options` の div（採る・検討・採らない）                             | `notation`                                                                    | なし | 中                                      |
| `Claims`      | `claims` の div（確度の span）                                       | `notation`・行内の記法                                                        | なし | 中                                      |
| `Picture`     | `img` と番号つきの注                                                 | `report-image`                                                                | 図   | 強い（`/report-image/` の `src` の形）  |
| `Plot`        | 形ごとに表・`chart`・`number-line`・`bullet`・`scatter`・`histogram` | 表と chart は上と同じ。他は `gauge-block`・`scatter-block`・`histogram-block` | 表   | 表に落ちたときだけ強い                  |
| `Markdown`    | 書き手の Markdown と HTML をそのまま                                 | パイプライン全部                                                              | なし | 最も強い（生 HTML を通す唯一の経路）    |

「番号」の列は、その部品が図表番号を受けるかと、数える種類。`Plot` は番号の種類が表で、題の語は描く形によって「図」になる（`captionKindOf` と、グラフを描く枝が `captionedMarkdown` に渡す種類が食い違う）。

### レポート全体を見て決まるもの

- **図表番号。** `reportSectionPieces` が節の並びを畳み込み、`counts` を持ち歩いて塊ごとに番号を振る。整形で落ちた塊は数えず、折りたたみの中の塊は数える。入力の並びは、`Report.figure` の図を先頭の節に足し、あとに振り返りの節を足したもの。草稿の経路は整形済みの `sections` だけ。
- **表の札の色。** `tagTonesOf` が全節の表の `tag` を出現順にまとめて色を割り当て、同じ字は表をまたいでも同じ色になる。
- **傍注。** `memo` の `Note` は本文に出ず、直前の塊の傍注に寄る。寄せる相手は平らに並べた直前の葉で、配置の部品を越える。このため `memo` の葉自身の `leaves` の値は空文字になり、寄せられた側の値に傍注が入る。
- **届く形。** 番号は `<span class="caption-number">図 3</span>`、傍注は `<aside class="gutter-note">` として、葉の Markdown の中に焼かれて届く。`a2uiReportView` が葉の ID に当て、整形で落ちた葉は空文字にする。
- **葉の経路を通らない葉。** `Report.figure` の葉と振り返りの葉は `leaves` に入らず、欄の Markdown だけで描かれる。図表番号はこの 2 つを含めて通しで振られるので、葉だけを直接描くと番号の連続が食い違う。

### 目次・演出・文字の選択

- **目次と読み位置。** どちらも DOM の `.detail-block :is(h4, h5)` を見る（`readableHeadings`）。節の見出しは欄の Markdown の `## …` が `SectionHeading` で `h4` になる。畳んだ `<details>`・演出の前・草稿の中は除く。
- **演出。** `planReveal` が本文の根の直下の子を欄として、欄の中を 1 段だけ降りる。降りるのは直下に `data-reveal-caption` か `data-reveal-gutter` を持つ包みだけで、図は `FIGURE_SELECTOR`、筆を留めるのは `.report-pause-point`。マウント時の DOM を一度だけ見る。
- **文字の選択と写し。** 選択は共通祖先が `[data-report-body]` の中にあるかだけを見て、`selection.toString()` を引用にする。ラベルや番号が本物のテキストノードであることに頼り、CSS の `content:` で出した記号は写らない。コードの写しボタンは DOM でなく原文の文字列から書く。

### 塊の区切り

`RegionChunks` が空行（フェンスと HTML ブロックの中は除く）で塊に割り、Fragment で欄の直接の子として並べる。塊ごとの間隔は React でなく CSS が持ち、`--report-block-gap`・`--report-figure-gap`・`--report-heading-gap` の 3 つの値を、`.detail-block` と `[data-report-region]` の直接の子（子結合子 `>`）に当てる。包みの要素を 1 枚挟むと、この規則が外れる。

### 移したあとも使われ続けるもの

`Markdown` の描画の使い手は葉だけではない。頭・図・振り返り・お願いの欄、body が Markdown の本文、`a2ui` が使えない記録、`a2ui` の面が作れなかったときの代替、質問の詳細（候補の図と比較表）、操作できる表の前後が残る。質問の詳細は塊 → Markdown の関数をそのまま使うので、葉の種類は質問の詳細の経由でも描かれる。`sanitize-schema` と `style-allowlist` も、書き手の `Markdown` の葉と頭・振り返りが残る限り消えない。

CSS 宣言のうち、葉専用と言い切れるのは `report-notation-timeline.css`（95）・`report-notation-card-chain.css`（66）・`report-notation-graph-fold.css`（28）の 3 つで、計 189 宣言。ほかは頭・振り返り・間隔・質問の詳細と共有している。

## 決めたこと

### 論点 1: 図表番号・表の札の色・傍注の渡し方

**組み立ての段で振り、`a2uiReportView` が作る view に葉ごとの値として持たせる。部品は渡された値を描くだけで、番号を数えない。** 利用者が決めた（2026-10-28）。ADR 0039 の未決 3 の答えは「切り出せる」で、塊（葉）単位で渡す。

- `reportSectionPieces` の畳み込みから、「葉の ID → 図表番号（種類と番号）・表の札の色・寄せられた傍注」を作る部分を、Markdown を組む部分から切り離した純関数にする。記録の経路と草稿の経路は同じ関数を通る。
- `leaves`（葉の ID → Markdown の文字列）は、この値に置き換わる。移行のあいだは、まだ移していない葉のために `leaves` を残し、新しい値は別の欄で並べて持つ（最後の課題で `leaves` を外す）。
- `Report.figure` の葉と振り返りの葉も、同じ畳み込みの中で通しで数える。これらの葉の値は、欄ごとの値として view に載せる。
- 整形で落ちた葉は値を持たず、部品は何も描かない（今の「空文字」と同じ振る舞い）。折りたたみの中の葉は数える。
- `memo` の `Note` は、寄せ先の葉の値に傍注として持たせる。`memo` の葉自身は何も描かない。
- 草稿は一覧が伸びるたびに view を作り直すので、番号の振り直しは毎回の関数呼び出しになる。
- `Plot` は番号の種類を描く形に合わせる（表に落ちたものは表、グラフは図）。今は番号の種類が表で、題の語が図になるものがあり、図の番号が飛ぶ。この食い違いは移行で直す。

### 論点 2: 目次・演出・文字の選択を保つ条件

**葉の部品は、欄の直接の子として今と同じ class の要素を返し、包みの要素を挟まない。節の見出しは React の `h4` で描く。** 目次・演出・選択の実装は変えない。

- 目次と読み位置が見る `.detail-block :is(h4, h5)` と、節の ID の `data-report-section` は、今の DOM と同じ位置に置く。
- 演出は欄の直下の子を 1 段だけ降りる。題と傍注の包みには `data-reveal-caption`・`data-reveal-gutter` を付け、今のコードと同じ範囲に `report-pause-point` を付ける（`Note` は warn と ng の 2 つ、`Options` は「採る」の行だけ）。これらを付ける共通の枠（題・番号・傍注の包み）を 1 つの部品にし、葉の部品が使う。
- 図表番号・`Note` のラベルは、CSS の `content:` で出さずテキストノードとして描く。文字の選択と写しは `[data-report-body]` の中の `selection.toString()` に頼っているので、これを変えない。
- コードの写しボタンは、原文を props で受けて書く（今の `CopyButton` と同じ）。
- 生 HTML の許可（`sanitize-schema`）は、直接描く葉には通らない。直接描く部品は属性の許可に頼らず、型のある props から要素を作る。
- 確かめ方は移行の課題の完了条件に書く。目次・演出・選択の既存の検査が、移した葉の DOM に対しても通ること。

### 論点 3: 移す順と課題の大きさ

**共通の枠を先に作り、種類ごとにまとめて移す。** 利用者が決めた（2026-10-28）。1 課題 1 コミットの大きさに収め、登録する課題は次の題と順にする。

| 順  | 題                                                                                                  | 中身                                                                                                                        |
| --- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 1   | 葉ごとの図表番号・表の札の色・傍注を組み立ての段で振り、view に葉ごとの値として持たせる             | 論点 1。まだ描き方は変えない                                                                                                |
| 2   | 葉を直接描く共通の枠（題・番号・傍注の包み）を React の部品にし、面の葉の振り分けと節の見出しを足す | 論点 2。移した葉は直接、移していない葉は今の Markdown の描画                                                                |
| 3   | 文字系の葉（`Paragraph`・`ItemList`・`Note`・`Options`・`Claims`）を React の部品で直接描く         | 5 部品                                                                                                                      |
| 4   | 表と数の葉（`Table`・`Matrix`・`Compare`・`Stats`）を React の部品で直接描く                        | 操作できる `Table` は表の行を持つ値から描き、`indexOf` で文字列を割る経路に頼らない。4 部品                                 |
| 5   | 図の葉（`Svg`・`Timeline`・`Graph`・`Picture`・`BeforeAfter`）を React の部品で直接描く             | 5 部品。`Graph` は一本道・折り返し・mermaid の 3 通りを持つ                                                                 |
| 6   | 外部の描画に頼る葉（`Mermaid`・`Chart`・`Plot`・`Code`）を React の部品で直接描く                   | 4 部品。`Plot` の番号の種類は論点 1 のとおり                                                                                |
| 7   | 葉を移したあと面から使われなくなる Markdown の経路（`leaves`・表の行を割る処理）を外す              | 面の `PartRun` の連結と `RegionChunks` の葉への使い方も外す                                                                 |
| 8   | `markdown/` の CSS に残る余白・角丸・影・動きの直書きをデザイントークンに置き換える                 | ADR 0041 の論点 5 の対象に入っていなかった `markdown/` の CSS。質問の詳細・頭・振り返りと共有する宣言も同じ宣言を置き換える |

- `Markdown` の葉は移さない。書き手の生 HTML を通す唯一の経路なので、`Markdown` の描画と `sanitize-schema` が残る。
- 登録した課題の ID はこの ADR に書かない。

### 論点 4: 塊の区切りの持ち方

**葉の部品は、自分の上下の間隔を今と同じ class で持ち、`RegionChunks` を通さない。** 欄の直接の子として並ぶので、`.detail-block` と `[data-report-region]` の直接の子に当てている規則（子結合子 `>`）がそのまま効く。

- 面の `PartRun` が隣り合う Markdown の片を `joinParts` で 1 本に連結して `RegionChunks` に渡す処理は、移した葉については不要になる（論点 3 の課題 7）。
- 間隔の 3 つの値（`--report-block-gap`・`--report-figure-gap`・`--report-heading-gap`）は、この ADR では変えない。デザイントークンへの置き換えは課題 8 で扱う。
- 配置の部品（`Row`・`Column`・`Card`・`Tabs`）の中の葉は、今と同じく包みの中に入る。この入れ子は旧い `row`・`panel` と同じ挙動なので、新しく作る制約ではない。

## 採らなかった案

| 案                                | 採らなかった理由                                                                                                                        |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 番号を描画側の context で計算する | 番号の計算が `shared` とブラウザの二重になる。整形で落ちた塊を数えない規則と、頭・振り返りの図との通しの番号を、もう 1 度書く必要がある |
| 葉を 1 部品ずつ 1 課題にする      | 約 20 課題になり、共通の枠が最初の部品の課題に混ざってその課題だけが重くなる                                                            |
| `Markdown` の葉も直接描く         | 書き手の Markdown と HTML を通す経路で、直接描く部品に置き換えられない。`Markdown` の描画の中で書き手が使える記法の幅が減る             |

## 未決

1. 質問の詳細（候補の図と比較表）を、塊 → Markdown の関数の経由から外して葉の部品で直接描くか。外さない限り、`report-notation-timeline.css`・`report-notation-card-chain.css`・`report-notation-graph-fold.css` の 3 つ（189 宣言）ほか、葉専用に見える描画は `Markdown` の経路で使われ続ける。移行の最後の課題のあとで、使い手が質問の詳細だけになったかを数えて決める。
2. 旧い 3 つの変種（`json-schema`・`short-type`・`body-fence`）の撤去（ADR 0039 論点 5）のあとに、`reportSectionPieces` の Markdown を組む部分をどこまで消せるか。

## 影響

- `src/shared/session/a2ui-report-view.ts` が持つ `leaves` が、葉ごとの値（図表番号・札の色・傍注）に置き換わる。`MainViewA2uiReport` の形が変わるので、`pnpm run test:e2e:update` が要る。
- `src/shared/report/report-markdown.ts` の畳み込みから、番号・札の色・傍注を取り出す。質問の詳細が使う Markdown を組む部分は変えない。
- 葉の React の部品が `src/browser/components/` の下に増え、`ui/` の部品（`Surface`・`Badge`・`Divider`）とデザイントークンで組む。
- `markdown/` の描画は、葉を移しても、頭・振り返り・お願い・質問の詳細・`Markdown` の葉・旧い記録・面が作れなかったときの代替から使われ続ける。CSS の削減は、未決 1 が決まるまで限られる。
- ADR 0039 の論点 4 の「葉の実装は塊 → Markdown の変換を `Markdown` に通して再利用する」は、この ADR で置き換わる。未決 3 は閉じる。ADR 0040（草稿の描画）は変わらず、番号の振り直しは草稿が伸びるたびの view の作り直しで効く。
