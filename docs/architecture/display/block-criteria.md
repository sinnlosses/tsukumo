# 塊を足す・外す基準

戻り: `docs/architecture/display.md`「塊を足す・外す基準」

**塊の種類・欄・逃げ道の中の記法を足すかは、「読む時間を減らす物差しと線引き」の物差し（読んで分かるまでの時間が短くなるか）で
決める。外すかは使われ方の数で決める**（docs/research/report-block.md 6章、記録の語彙は
`docs/research/report-architecture.md` 6章）。`report` を描く（差し戻されなかった）
たびに、その回に出た塊の種類・既定の値でない塊の欄と、逃げ道（`markdown` の塊）に出た記法の種類（重複無し。同じ種類が
同じレポートに何回出ても1回と数える）を `~/.tsukumo/report-usage/<YYYY-MM-DD>.jsonl` に1行記録する。
逃げ道に出た記法は3つに分けて持つ: **塊のある記法**（表・箇条書き・`note` など、逃げ道の外側
〔HTML の容れ物の中でないところ〕に出たもの）・**同じ塊のある記法が HTML の容れ物
（`<details>` / `<div>`）の中に出たもの**（複数の塊を畳む・並べるのは逃げ道の役目なので、
差し戻しではなく別に数える）・**塊の無い記法**（`svg`・`dl`・引用・区切り線・`<details>` そのものなど。
塊に当てはまらないので昇格のきっかけになる）。知らない種類で境界で落とした塊の数も同じ行に足す。

行は版を持ち、版ごとに次の数と真偽値を足した（欄の名前と形は `src/server/report/core/report-usage.ts` が持つ）:

- 版4: `files` に `modified` の項目があるか（`hasModifiedFiles`。書き手が `files` を渡せなくなったため、新規は常に false で、型と欄だけ残す）・
  `beforeAfter` か `image` の塊があるか・`task` を渡した最終レポートか
- 版5: 段1の図（`image`・`mermaid`・`graph`・`svg`。`beforeAfter` の側を含む）があるか、
  このターンにメインが画像のファイルを `Read` したのに `image` の塊が無かったか（サブエージェントの `Read` は数えない）
- 版6: `figure` の欄の種類と、`none` のときの理由。塊の種類・欄・段1の図・画像の有無を `figure` の図も含めて数える
- 版7: 強調の数（インラインコードの中は数えない）と、`graph` の辺・ラベルの無い辺・節点の数（複数あれば最大）
- 版8: `checks` に `unobserved`（前の `unverified`）の行があるかと、その全部に確かめ方があるか
- 版9: `task` の報告の種類と終わり方、`favor` が空でないか、本文に URL か `path:line` があるか `code` の塊に `path` があるか
- 版10: 行が2つ以下の表が1つでもあるか
- 版11・12: `stats` の `series` / `better` と、`aside` が空でない塊を塊の欄で数える（行の形は版10と同じ）
- 版13: 節ごとの札、札が許さない塊を使った節の数、許さない組ごとの数（「形の札の照合」）
- 版14: `report` の引数の字数（JSON にした字数。全体と最上位の欄ごと）。差し戻しの行にも入る。字数だけで中身は持たない。
  受け付けも差し戻しも、モデルが書いた生の引数の字数。差し戻しの行は handler の差し戻しだけでなく、結果が `isError` で返った `report` の呼び出しすべてに付く
  （形の検査で落ちた呼び出しは、handler に届かなかったものも、handler で組んだ値が落ちたものも理由が `tool-error`。
  引数が読めなくても字数は数える）
- 版15: `beforeAfter` の画像の側に `region` が付いた回を、塊の欄 `beforeAfterRegion` で数える（行の形は版14と同じ）
- 版16: 差し戻しのあとの出し直しで、渡さずに直前の差し戻しから引き継いだ欄の名前（`inheritedFields`）。受け付けと差し戻しの両方の行に入る。
  引数の字数は渡した欄だけを数え、引き継いだ欄の字数は持たない（直前の差し戻しの行の欄ごとの字数から出せる）
- 版17: どの型の渡し方で `report` を受けたか（`reportSchema`。`json-schema`・`short-type`・`body-fence` のどれか）。受け付けと差し戻しの両方の行に入る
- 版18: 逃げ道の記法を構文木（mdast）で数える（行の形は版17と同じ。版17以前の行とは数え方が違う。
  インラインコードの中の `<div>` で容れ物の深さが狂わず、ブラウザが記法として描かない形は数えない）
- 版19: 節ごとに出た塊の種類（`sectionBlockKinds`。`sectionShapeTags` と同じ並び）、`list` の style の集合（`listStyles`）、
  `mermaid` の図種の集合（`mermaidKinds`）、駆動（`driver`。`sdk` か `fake`）。受け付けと差し戻しの両方の行に `driver` が入る。
  集計スクリプトは疑似セッションの行（`driver` が `fake`、版18以前は `sessionId` が `fake-session`）を既定で除き、`--include-fake` で含める
- 版20: `keyFigures` が1つ以上あるか（`hasKeyFigures`）、`keyFigures` が無いのに結論の文（インラインコードの外）に数が3つ以上あるか
  （`conclusionNumbersWithoutKeyFigures`）。受け付けの行だけに入る。差し戻しにはせず、28日の数を見てから差し戻すか決める
- 版21: 通した `report` が当たった数えるだけの条（`REPORT_REJECTION_MODES` が `count` の条）の名前を、差し戻しの行と同じ形の
  `kind: "counted"` の行に書く。集計スクリプトは差し戻しの表に混ぜず、「数えるだけの条 × 回数」の表に出す
- 版22: 差し戻しの行に、同じセッションの次の `report` の呼び出しの結果 `nextCall`（その呼び出しの差し戻しの理由と引数の字数。
  受け付けなら理由は空）を持たせる。次が来ないまま記録を閉じた行は持たない。集計は「差し戻しの理由 × 直り率」の表に、
  次の呼び出しで同じ理由が出なかった割合と直した呼び出しの字数の中央値を出し、`nextCall` の無い行は分母から外す
- 版23: 受け付けの行に、`body` の型つきフェンスのうち読めずに素のコードブロックへ落としたものの数 `brokenFenceCount` を持たせる。
  差し戻しにはしない。`body` を渡さない回は 0
- 版は上げずに任意の欄 `toolErrorFields`: 理由が `tool-error` の差し戻しの行に、形の検査で落ちた欄を `{ field, code }` の並びで持たせる。
  `field` は zod の `issues[].path` を `.` でつなぎ配列の添字を `n` に畳んだもの、`code` は `issues[].code`。結果の本文から取れたときだけ持ち、`message` と値は残さない

4版以降の真偽値と数は、塊の欄とは別で外す基準の対象にしない。

数えるだけで差し戻しにはしない。中身は一切持たない
——数と名前だけ（`docs/coding-standards.md`「会話内容の扱い」）。書くのは
`src/server/report/adapter/report-usage-log.ts`、何を1行にするかは `src/server/report/core/report-usage.ts` が持つ。

**集計するスクリプトは `scripts/runtime/report-block-usage.ts`**（`node scripts/runtime/report-block-usage.ts
--days <日数>`、既定28日）。塊の種類・塊の欄・逃げ道の記法（外・容れ物の中・塊の無い記法）ごとのレポート数と、上の版ごとの数の表を、
全レポートと task の最終レポートのそれぞれについて出す。各表の分母はその欄を記録した版以降の行（欄を足す前後で使われ方を見比べるため）。
`report` が差し戻されたときも同じファイルに1行書く（時刻・セッションID・差し戻しの種類の名前・引数の字数だけで、本文も文面も持たない）。
集計は「差し戻しの種類 × 回数」の表で、割合は `report` の呼び出し（受け付け＋差し戻し）の数に対して出す。
よく当たる規則は欄の形や説明で防ぎ、当たらない規則は削る判断に使う。

- **足すきっかけ**: 塊の無い記法の同じ種類が、直近2週間（14日）のレポートの3%以上に出たら、
  塊に上げるタスクを立てる。**数が届かないことは足さない理由にならない**（書くのが重い記法は、
  速く分かる内容でも使われない）
- **容れ物の判断**: 塊のある記法が容れ物の中に出た数を見て、`<details>` / `div` の使われ方
  （畳む・並べる）を判断する。足す・外す基準の対象にはしない
- **外す基準**: 塊の種類か塊の欄が、直近4週間（28日）で0回だった。数が決めるので、あとの判断は
  「タスクを立てるかどうか」だけになる。**`markdown`（逃げ道そのもの）は外す基準の対象にしない**
  ——逃げ道を無くす話は塊の一覧の増減とは別の議論になる
- 版7・版9・版10の数（強調・ラベルの無い辺・種類ごとに必須の塊が無い割合・2行以下の表）は、28日の数で差し戻さないと決めた（数と理由は `reading-time.md`「28日の数で決めた差し戻し」）

## 図の値と本文の数の照合

`plot` の `Q` 列の値と、同じレポートの本文の数（`conclusion`・`keyFigures` の `before`・`value`・`total`・節の `text` の塊）のずれを、
差し戻しの条 `figure-number-mismatch` で見る。**`count`（ADR 0028）で、差し戻さず `kind: "counted"` の行に名前だけ残す。**
除外の上限は 0 で、根拠の行は `docs/history/decision.md`「adr/0028 追記 差し戻しの条ごとの根拠」にある。
`plot` は `figure` にも `sections` の塊にも置ける。`plot` か本文の数が無ければ何も見ない。

本文の数 b ごとに、次の順で読む（`src/server/report/core/figure-number.ts`）。

1. どれかの `plot` のどれかの `Q` 列の値と一致すれば何もしない。一致は小数 2 桁までの丸めの差を許し、`%` つきは b か b/100 で比べる。桁区切りは外して読み、インラインコードの中の数は読まない。
2. 一致が無いとき、ある `Q` 列の値と相対差 10% 以内（近い値の取り違え）か、b に 10 の ±1〜±3 乗を掛けると一致する（桁の単位違い）なら、(`plot` の位置, 列の位置, 本文の数の位置) 1 組を数える。0 は数えない。
3. どの列とも当たらない数（「3 ファイル」のような無関係な数）は数えない。

登録時の「それ以外の差は不一致」を文字どおりに読むと無関係な数まで全部数えるので、数える形を 2 に絞った。
差し戻しの文面と条の持つ値は位置だけで、本文の字も列の名前も写さない。

## 行内の印

文中の数字に付ける印を 3 種だけ持つ。書き手は色も座標も書かない（読み方と畳みは `src/shared/report/inline-mark.ts`）。
置けるのは `text` の塊・`list` の項目・`table` のセル・結論で、inline code の中は読まない。

| 印                    | 書式                                                                                                                                             | 畳んだ素の文字                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| 前後の差              | `{{A → B}}`（A・B は空でなく、それぞれ幅 16 まで〔半角 1・全角 2〕。矢印はちょうど 1 つ。印は折り返さないので、幅 360 に収まる短い語か数に限る） | `A → B`                                |
| 折れ線                | `{{spark: n n n}}`（数が 2〜12 個。区切りは空白かカンマ）                                                                                        | 最小〜最大を 8 段階に写した `▁▂▃▄▅▆▇█` |
| 5 のうち 3 のような帯 | `{{a / b}}`（a ≤ b、b は 0 でない）                                                                                                              | `a/b`                                  |

HTML の字として埋める塊（`htmlInline`・`htmlInlineWithCode`）と、結論を 1 行の平文で残す場所は、印を畳んだ素の文字で出す。
`arrow-in-prose` は印の中の矢印を数えない。

書式に当たらない `{{`（閉じない・数が足りない・a が b より大きい・矢印が 0 個か 2 個以上など）は壊れた印で、畳みも描画もせず字のまま残す。
壊れた印は差し戻しの条 `broken-inline-mark` で数える。**`count`（ADR 0028）で、差し戻さず `kind: "counted"` の行に名前だけ残す。**
除外の上限は 0 で、根拠の行は `docs/history/decision.md`「adr/0028 追記 差し戻しの条ごとの根拠」にある。

## 形の札の照合

札は `json-schema` 版の節の欄の仕組みで、`body` 版は節を1つに畳み札を持たない（常に `unspecified`。ADR 0038）。照合は札のある節にだけ働く。

節の `shapeTag`（`docs/glossary.md`「形の札」）ごとに許さない塊は `src/shared/report/report-shape-tag.ts` の
`REPORT_SHAPE_TAG_RULES` が持ち、照合は同じファイルの `isForbiddenBlock`。**差し戻さず、版13の記録で数えるだけ**にする
（ADR 0028 の「順位違反はまず記録で数える」に倣う）。差し戻すかは28日の数を見てから別に決める。
札を省いた節（`unspecified`）は照合せず、札の数にだけ入れる。照合するのは本文の節で、`figure` の図は含めない。

| 許さないもの                                                                       | 照合   | 理由                                                                                          |
| ---------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------- |
| 塊の `kind` だけで決まる組（因果・つながり・位置などに `table` / `list` / `text`） | する   | `kind` で決まる                                                                               |
| 量 × `text`                                                                        | する   | インラインコードの外の数字の並びが3つ以上なら当たる。数で決まる                               |
| 並列 × `table`                                                                     | する   | 列が2つ以下（項目名＋属性1つ以下）なら当たる。数で決まる                                      |
| 一言 × `list`                                                                      | する   | 項目が1つなら当たる。数で決まる                                                               |
| 属性の並び・対応の「文のセル」の `table`                                           | しない | `sentence-table`（`isSentenceTable`）は数えるだけの条なので受理されるが、札の判定には入れない |
| 選択の `table` の基準の数                                                          | しない | 「許す代替」の条件で、「許さない」に入っていない                                              |
| `mermaid` の図の種類・`list` の `style`                                            | しない | 第一候補と代替の違いで、「許さない」に関わらない                                              |
| 逃げ道（`markdown`）の中の表と箇条                                                 | しない | 塊ではないので照合の対象にしない                                                              |

## 図の決定表

`plot` の申告（列の型・行の数・`relation`）と利用者の図の既定から形と必須の注記を決める行の並びは、
`src/shared/report/figure-decision.ts` の `FIGURE_DECISION_ROWS` が正典で、上から当てて最初に当たった行を採り、どれにも当たらなければ `table`（注記は `unitInHeader`）にする。
図派は「図派」の列、文派は「文派」の列の形を採る。必須の注記は種類だけで、差や割合の値は組まない。
書き手の `form` が下の「置かない形」に当たれば採らずに決定表の形で描き、`plot-forbidden-form` と数える。図派・文派のどちらの既定で決めた形とも違う形は通して `plot-form-override` と数える（どちらも `count`）。
基数の境は `CARDINALITY_BOUNDS` の 1 か所に集めた目安で、実証された閾値ではない。上書きの数を見て動かす。
決定表が `bar`・`line`・`pie` を返した `plot` は、`plotChartOf`（`src/shared/report/plot-chart.ts`）が既存の `chart` の塊へ写して描く（始まりと終わりの量の `range` は `span`、前と後の量の `change` の `line` は `slope`、写せない申告は表）。
`numberLine`・`bullet` を返した `plot` は、`plotGaugeOf`（`src/shared/report/plot-gauge.ts`）が `number-line`・`bullet` のフェンスへ写す（bullet の区間は申告に無いので 0 から目標までの 1 つ。写せない申告は表）。座標と色は書き手に開かず、描画側が決める。
ブラウザは `GaugeBlock`（`gauge-block.tsx`）が自前の SVG で描く。位置は `gauge-layout.ts` が軸の範囲から割合で決め、色は `--accent` の濃淡だけ（定性区間は 1〜5 個で、濃いほうから薄いほうへ）。
`scatter`・`histogram` を返した `plot` は、`plotScatterOf`（`src/shared/report/plot-scatter.ts`）・`plotHistogramOf`（`src/shared/report/plot-histogram.ts`）が `scatter`・`histogram` のフェンスへ写す。
散布は先頭の量を x、次を y にし、x か y が四分位範囲の 1.5 倍の柵の外にある点を外れ値として名前を添える（外れ値があるのに名前の列が無い申告は表）。
ヒストグラムの階級幅は Freedman–Diaconis の規則（2 × 四分位範囲 × 個数の -1/3 乗）で、階級数は 1〜20、四分位範囲が 0 か全部同じ値なら 1 つ。中央値と範囲は必ず添える。数でない値が混ざる申告は表。
ブラウザは `ScatterBlock`（`scatter-block.tsx`）・`HistogramBlock`（`histogram-block.tsx`）が自前の SVG で描く。横の位置は `scatter-layout.ts`・`histogram-layout.ts` が軸の範囲から割合で決め、色は `--accent` の濃淡だけ。
散布は外れ値の点だけ濃くして名前を 18 字で切って出し（4 点以上は 3 点までで残りは「ほか N 点」）、ヒストグラムは中央値の縦線と範囲を必ず出す。
この 2 形は描かれた塊が値・外れ値の名前・中央値と範囲を必ず出すので、題の数は数えない。
値の注記は描く側が必ず出す（棒は端の値、折れ線は線端の系列名と終点の値、円は項目名と値）。題（`question`）に数が無い塊は `plot-title-without-number` と数える（`count`）。
下の 3 つの表は `pnpm run format`（`scripts/document/write-figure-decision-table.ts`）が書き直す。手で直さない。

<!-- figure-decision-table:start -->

| #   | 名前                | 条件                                                              | 図派         | 文派    | 必須の注記          |
| --- | ------------------- | ----------------------------------------------------------------- | ------------ | ------- | ------------------- |
| 1   | `one-value`         | Q が 1 列・1 行                                                   | `text`       | `text`  | `unit`              |
| 2   | `bullet`            | compare、N か O が 1 列・Q が 2 列（値と目標）・1〜6 行           | `bullet`     | `table` | `reference`         |
| 3   | `key-figures`       | Q だけが 2〜4 列・1 行                                            | `stats`      | `stats` | `unit`              |
| 4   | `two-compare`       | compare、N か O が 1 列・Q が 1 列・2 行                          | `bar`        | `text`  | `difference`        |
| 5   | `number-line`       | compare か distribution、Q の 1 列だけ・2〜6 行                   | `numberLine` | `table` | `extremes`          |
| 6   | `part`              | part、N か O が 1 列・Q が 1 列・2〜5 行                          | `bar`        | `table` | `percent`           |
| 7   | `change-two-points` | change、T が 1 列・Q が 1 列・2 行                                | `text`       | `text`  | `differencePercent` |
| 8   | `change-items`      | change、N か O が 1 列・Q が 2 列（前と後）・2〜8 行              | `line`       | `table` | `differencePercent` |
| 9   | `trend`             | trend、T が 1 列・Q が 1〜4 列・5 行以上                          | `line`       | `table` | `trendTitle`        |
| 10  | `range`             | range、N か O が 1 列・Q か T が 2 列（始まりと終わり）・4 行以上 | `bar`        | `table` | `duration`          |
| 11  | `correlate`         | correlate、Q が 2 列・10 行以上                                   | `scatter`    | `table` | `outlier`           |
| 12  | `few-compare`       | compare か rank、N か O が 1 列・Q が 1 列・3〜7 行               | `bar`        | `table` | `extremes`          |
| 13  | `many-rank`         | compare か rank、N か O が 1 列・Q が 1 列・8〜20 行              | `bar`        | `table` | `top`               |
| 14  | `distribution`      | Q が 1 列（N か O は 1 列まで）・21 行以上                        | `histogram`  | `table` | `medianRange`       |

<!-- figure-decision-table:end -->

置かない形（Draco の hard 制約に当たるもの。体裁の好みは入れない）:

<!-- figure-hard-rule-table:start -->

| 名前                  | 置かない形                                                            |
| --------------------- | --------------------------------------------------------------------- |
| `unordered-line`      | T も O も無い申告に line（change の前と後の Q の 2 列は順序に数える） |
| `single-value-figure` | Q が 1 値だけの申告に text・stats・table 以外                         |
| `crowded-pie`         | 4 行以上の申告に pie                                                  |
| `edgeless-graph`      | graph（plot は辺を申告できない）                                      |

<!-- figure-hard-rule-table:end -->

基数の境:

<!-- cardinality-bound-table:start -->

| 名前             | 値  |
| ---------------- | --- |
| `pair`           | 2   |
| `few`            | 7   |
| `many`           | 20  |
| `partMax`        | 5   |
| `pieMax`         | 3   |
| `keyFiguresMax`  | 4   |
| `numberLineMax`  | 6   |
| `seriesMax`      | 4   |
| `trendMin`       | 5   |
| `changeItemsMax` | 8   |
| `rangeMin`       | 4   |
| `correlateMin`   | 10  |

<!-- cardinality-bound-table:end -->

## 見比べで見つかった穴

Claude が書いた HTML と tsukumo の `report` を同じ題材で見比べると、tsukumo で表現できない・粗くなるもの（**穴**）が見つかる。
見比べの手順（`scripts/capture/compare-html.ts` が下の型の前4箇条の下書きを出す）は `docs/history/research/html-comparison-method.md`、実績は `docs/history/research/html-comparison-trial.md`。
ここには、見つけた穴をどう扱うかだけを置く。足すかの数と物差しは上の節のとおりで、**この節では新しい基準を作らない**。

### 梯子

穴ごとに、上から順に問い、最初に「はい」になった段に置く。

1. **今の塊・記法で書ける**: 既存の塊と欄で、同じ内容が読んで分かるまでの時間も変わらず書けるか。書けるなら穴ではなく、書き方を試した記録に残すだけで閉じる
2. **規約か道案内で足りる**: 書けるが、書き手が塊を選び損ねているだけか。条（差し戻し）を足さず、`docs/architecture/display.md` の道案内か規約の文で直るか
3. **欄を足す**: 今の塊のまま、欄を1つ足せば表現できるか
4. **塊を足す**: 欄では足りず、塊の種類が要るか。足すかは、塊の無い記法として14日の割合を数える基準（上の「足すきっかけ」）で決める
5. **採らない**: 下の「採らない穴」に当たるか、足しても物差し（読んで分かるまでの時間）が縮まらないか

3と4は、数が届かないことを足さない理由にしない（上の「足すきっかけ」）。数は穴ドラフトの最後の欄に書いて確かめる。

### 穴ドラフトの本文の型

穴1件につきドラフトの課題を1件積む（`tw new --draft`）。`## 目的・背景` の頭に「見比べで見つかった穴（梯子の段: <番号>（<段の名前>））。」と書き、箇条を次の順に並べる。

- 比べた題材と日付
- Claude 側の部品（HTML のどの部分か。パスか、部品の名前）
- tsukumo で試した書き方（疑似セッションのパスと画像。架空の会話だけで、実物の会話は使わない）
- 起きたこと
- 候補と採らない理由
- 足す基準の数（未計測なら、どの記録をどう数えるか）

### 記録の置き場

穴の状態は Beads のドラフトの課題に残す。ファイルの台帳は作らない。梯子の段が上がる・下がるときはドラフトの本文を直し、
足す・足さないが決まったら普通のタスクに進める（`tw edit`）か `tw done --dropped` で閉じる。

### 採らない穴

次は梯子の5に置き、ドラフトを積まない。理由は `docs/architecture/adr/0032-free-html-block.md`。

- 書き手が面の色・余白・並べ方を指定するもの（描き方は tsukumo の部品が決める）。
  型のある `row`・`panel` で横に並べる部品と枠の題を選ぶことは、これに当たらない（色・幅・余白・縦に積むかは tsukumo が決める）
- タブ・スクリプトなど、操作で表示が変わるもの
