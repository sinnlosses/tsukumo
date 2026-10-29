# `report` の内部の表現を `components` に一本化する（2026-10-28）

ステータス: 採用

**`report` を受けたあとの内部の表現は、部品の一覧 `components` だけを正にする。`ReportEvent.sections`・`SessionRecord` の `sections`・旧い塊の型は、検査・記録・描画が `components` から読む形に移したあとで外す。旧い変種（`sections`・`body` の引数）の transcript は、復元のときに `components` へ組み直して同じ経路に通す。** 一本化は利用者が決めた（2026-10-28）ので、この ADR は一本化しない案を比べない。決めるのは、読み先の置き換え方・旧い transcript の扱い・外す型と残す型・移す順の 4 つで、ADR 0039 の未決 2（検査を `components` から読む形へ進めるか）を閉じる。

## 何が困っていたか

- `report` の受け口は `components` だけになった（ADR 0039 の段 6）が、受けたあとに `a2uiReportFields`（`src/shared/report/a2ui-report-input.ts`）が `components` を旧い引数の形（`sections` と塊）に組み直し、`reportEvents`（`src/server/session-driver/core/sdk-report-message.ts`）が `ReportEvent.sections` を作る。検査・使われ方の記録・Markdown 化・草稿は、この `sections` の塊から読む。
- カタログに部品を足すたびに、旧い塊の型にも対応を足すことになる。旧い塊の型（`src/shared/report/report-block.ts`）を import するファイルは `src/` に 39 個ある。
- `components` はすでに `ReportEvent.components` と `SessionRecord` の `report` に載っていて、ブラウザの面（`a2uiReportView`）は `components` と `sections` の両方を読む。両方を読むせいで、`components` から作った節と葉の数が `sections` と合わないと面ごと作れなくなる（`src/shared/session/a2ui-report-view.ts`）。

## 今の読み手（用途ごと）

`ReportEvent.sections`・旧い塊の型・`a2uiReportFields` を読む所を、用途ごとに数えた。「直接」は、`components`（カタログの部品、`a2ui-report-outline.ts` の ID と参照）から今すぐ読めるかを指す。

| 用途                 | 件数 | 主なファイル                                                                                                                                                                                                                                                  | 読んでいるもの                                                                               | 直接                                                                                        |
| -------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 規約の検査           | 9    | `report-violation-check.ts`・`report-block-rule.ts`・`report-violation.ts`・`report-figure-fault.ts`・`plain-word-find.ts`・`report-markdown-notation.ts`・`inline-mark-fault.ts`・`report-prose-rule.ts`・`request-template.ts`（`src/server/report/core/`） | 節の見出し・葉の種類と欄（`Note` の数と隣接、表の行、図の申告と本文の整合、字の規則）        | 可。葉の部品が塊と同じ props を持つ。`row`・`panel` の分は `a2ui` からは発火しない          |
| 画像棚・ファイル読み | 2    | `report-image-shelf.ts`（`core`）・`report-file.ts`（`adapter`）                                                                                                                                                                                              | 画像の塊と `beforeAfter` のパス、`Code` のパス                                               | 可                                                                                          |
| 出し直しの同一判定   | 1    | `report-review.ts` の `isSameReport`                                                                                                                                                                                                                          | `figure` と `sections` の深い比較                                                            | 可。ID の付け替えで等価が崩れる恐れ（推測）があるので、葉の中身の並びを比べる               |
| 使われ方の記録       | 3    | `report-usage.ts`・`report-usage-record.ts`・`experience-metric.ts`                                                                                                                                                                                           | 塊の種類・欄、記法、画像、`shapeTag`                                                         | `shapeTag` 以外は可。`shapeTag` は `a2ui` では常に `unspecified`（`Section` に欄が無い）    |
| 取り出し・記録の型   | 3    | `sdk-report-message.ts`・`session-event-report.ts`・`session-record.ts`                                                                                                                                                                                       | `sections` を作って持つ                                                                      | ここが外す対象                                                                              |
| 表示の導出           | 2    | `a2ui-report-view.ts`・`main-view-entry.ts`                                                                                                                                                                                                                   | 節と葉の整形・Markdown 化                                                                    | `components` が入力。整形（`tidy`）が落とした葉の位置合わせだけ `sections` に頼る           |
| Markdown 化          | 11   | `report-markdown.ts` ほか `report-*-markdown.ts`（`src/shared/report/`）                                                                                                                                                                                      | `ReportSection[]` の塊                                                                       | 面の葉は ADR 0042 が直接描きに換える。質問の詳細（`question-brief.ts`）は塊のまま使い続ける |
| 草稿                 | 1    | `a2ui-draft-view.ts`（ブラウザ）                                                                                                                                                                                                                              | `a2uiReportFields` で組み直した `sections` を `parseReportSections` で再検査して Markdown 化 | `components` が入力。旧い形に組み直す往復が余分                                             |
| 型・読み・形の定義   | 5    | `row-panel-block.ts`・`body-fence.ts`・`report-shape-tag.ts`・`report-retrospective.ts`・`a2ui-report-catalog.ts`                                                                                                                                             | 旧い塊の合併、`body` のフェンス、節の札                                                      | カタログが `reportFigureSchema`・`reportSectionSchema` を借りている所だけ残る               |
| 文法カード           | 1    | `part-card.ts`                                                                                                                                                                                                                                                | 塊の schema の型参照                                                                         | 型参照だけ。`REPORT_COMPONENT_SCHEMAS` は `components` 側                                   |
| 質問の添え書き       | 2    | `question-brief.ts`・`inquiry-answer.ts`                                                                                                                                                                                                                      | 図の塊（`FigureBlock`）と塊 → Markdown                                                       | レポート外。一本化の対象にしない                                                            |

- `test/` で `report-block.ts` を import するのは 41 ファイル、`sections` を語に含むのは 65 ファイル。`scripts/` は `scene-catalog.ts` と `report-block-usage.ts` の 2 つ。
- 疑似セッションの `fixture/fake-session/*.json` は 113 件中 50 件が `sections` を持つ。`fake-driver.ts` が `reportEvents` に通すので、旧い引数の組み直しが `reportEvents` の中にあるあいだは書き直さなくても動く。

## 決めたこと

### 論点 1: `ReportEvent` の形と読み先

**`ReportEvent` は `components` を正とし、`sections` と `figure`・`retrospective` の塊を持たない。検査・記録・描画は、`components` から節・図・振り返りの葉を取り出す導出（`reportOutline`）を通して読む。**

- `reportOutline(components)` は `shared/report` の純関数。`Report.children` の `Section` を並び順に、`Report.figure`・`Report.retrospective.blocks` の葉を欄ごとに返す。配置の部品（`Row`・`Column`・`Card`・`Tabs`）の中の葉は、外側の節へ並び順に平らに入れる。今の `a2uiOutlineSections`・`a2uiLeafIds`（`a2ui-report-outline.ts`）が持つ辿り方をそのまま使い、`a2uiReportFields` の「旧い欄に写す」部分は消す。
- 返す葉は塊の `kind` でなく、部品（`component` と props）にする。検査が読む欄は葉の部品が塊と同じ props を持つので、読む欄の名前は変わらない。`kind` の名前（`text`・`list`・`image`・`beforeAfter`）が要る記録は、`a2uiLeafKind` で今までの名前に写す（論点 3）。
- `Report` の props のうち塊でない欄（`conclusion`・`keyFigures`・`checks`・`task`・`workPlanClosing`・`favor`・`closing`・`waitingLine`・`title`・`sessionSummary`・`sessionRemaining`）は、今までどおり `ReportEvent` の欄に取り出して持つ。変えるのは節・図・振り返りの塊だけ。
- `ReportDraft`（`report-violation.ts`）は `sections` の代わりに `components` を受け、検査の入口（`reportViolations`）が `reportOutline` で葉を取り出す。`sdk-report-tool.ts` の組み立ても同じ。
- 草稿（ADR 0040）の経路は `components` を積み上げて持つので、`a2uiReportFields` で旧い形に戻して再検査する往復（`a2ui-draft-view.ts`）をやめ、`reportOutline` を通す。
- 面（`a2uiReportView`）は `components` だけを入力にし、`sections` との節・葉の数の突き合わせをやめる。整形（`tidy`）が落とした葉は、葉の ID の集合で表す。
- 理由: `components` はすでにイベントと記録に載っているので、足すものは無く、減らすだけで済む。読み先を 1 か所（`reportOutline`）に絞れば、カタログに部品を足しても旧い塊の型に対応を足さずに済む。

### 論点 2: 規約の検査の書き直し方

**検査の意味は変えず、読み先だけを `reportOutline` の葉に替える。意味が変わる 1 点（`row`・`panel` の分）と、変えないと決めた `Note` の隣接を先に決める。**

- 検査 48 条のうち、塊の `kind` と欄を読む条は、葉の部品の `component` と同じ props に替える。条の名前・差し戻しの文・数える閾値は変えない。
- **`Note` の隣接。** 今の `a2ui` の経路は、`a2uiLeafIds` が `Row`・`Column`・`Card`・`Tabs` の中の葉を外側の節へ平らに入れるので、配置の中の `Note` もすでに隣接と数えている（旧い変種の `row` の子だけが横並びで数えなかった）。**この結果は変えない。** `reportOutline` も同じ平らな並びを返し、隣接と数の判定は今の `a2ui` と同じ結果になる。横並びの `Row` の中の `Note` を隣接から除くか、縦に積む `Column`・`Card` と分けるかは、差し戻しの率が動く変更なので、使われ方の記録で測ってから別に決める。
- **`row`・`panel` 由来の条（`nested-fold` の row/panel 分、`crowdedNoteCount` の panel 分）。** `a2ui` では発火しない。旧い transcript は復元で `components` に組み直す（論点 4）ので、`Row`・`Card` の `fold` を持たない形に写る。条は `row`・`panel` の分を削り、`Markdown` の `fold` の入れ子だけを残す。
- `figureContradiction`（図の申告と本文の整合）は `Report.figureNone` と葉の部品の種類で足りる。図番号（`figure-number-fault.ts`）は `sectionsWithFigure` と `retrospectiveSections` と同じ並びを `reportOutline` が返す。
- 出し直しの同一判定（`isSameReport`）は、`components` の全体比較でなく、`reportOutline` の葉の中身の並びを比べる。部品の ID の付け替えだけでは同じと判定する。

### 論点 3: 使われ方の記録の互換

**記録の形（`report-usage-record.ts` の JSONL の版つきの形）は変えない。`kind` の名前は `a2uiLeafKind` で今までの名前に写し、`shapeTag` の列は `unspecified` 固定で残す。**

- 過去の行と今の行を同じ表で集計できる。`blockKinds`・`sectionBlockKinds`・`blockFields` の名前（`text`・`list`・`image`・`beforeAfter`）を部品名（`Paragraph`・`ItemList`・`Picture`）に直すと、過去の行と合わなくなる。
- `argumentChars.fields` と `inheritedFields` は、旧い欄名（`sections`・`body`）で書かれ続ける。`a2ui` の版では `components` から数える現状を変えない。
- `shapeTag`（`forbiddenShape*`・`sectionShapeTags`）は `a2ui` では常に `unspecified` で、集計は意味を持っていない。新しい行は `unspecified` を書き、読む側の判定（`isForbiddenBlock`）は外す。過去の行の列は読み戻せるまま残す。
- 集計スクリプト（`scripts/runtime/report-block-usage.ts`）の行の見出し `REPORT_BLOCK_KINDS` は、`row`・`panel`・`files` を含む今の表のまま残す。過去の行の kind が表から落ちないため。見出しを部品の一覧から作り直すのは、過去の行を捨てる決めをするときで、この ADR は決めない。

### 論点 4: 旧い transcript の復元

**旧い変種の呼び出し（`sections`・`body` の引数）は、復元のときに `components` へ組み直す。組み直しは `reportEvents` の入口の 1 か所に置き、新しい呼び出しと同じ経路（`a2uiReportInput` 以降）に通す。** 利用者が決めた（2026-10-28）。

- 組み直す変換 `legacyReportComponents(input)` は `sections` の塊を葉の部品に写し、節を `Section`、図を `Report.figure` と `figureNone`、振り返りの塊を `Report.retrospective.blocks` に写す。部品の ID は並び順に振る。
- 写せるもの: 節の見出し、葉 19 種（`writerBlockBranches` と 1 対 1）、`fold`・`aside`。`body` は Markdown のフェンスを今の読み（`body-fence-reader.ts`）で塊にしてから同じ写しに通す。フェンスは `graph`・`mermaid`・`table`・`code`・`callout`（`Note`）・`claims`・`image`・`figure`（`Plot`）・`markdown` で、全部 19 種に対応する。
- 写せずに失われるもの: `shapeTag`（`a2ui` の運用で意味を持たない）、`files` の塊（書き手に渡していない種類で、変更の札の内部でだけ使う）、知らない種類で落とした塊（`unknownBlockCount`）。`row`・`panel` は `Row`・`Card`＋`Column` に写し、`panel.title` は先頭の見出しの `Paragraph` に置く。`body` の素の散文は `Markdown` の部品 1 つになり、見た目が少し変わりうる（推測。移行の課題の目視で確かめる）。
- 旧い記録も面で描かれ、検査・記録・描画が `components` だけを読む。旧い塊 → Markdown の別経路は、旧い記録のためには要らなくなる。
- 疑似セッションの fixture は、組み直しが `reportEvents` の入口にあるので書き直さない。

### 論点 5: 外す型と残す型

| 区分     | 型・関数                                                                                                                                                                                                                                                                                                    | 行き先                                                                                                 |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 残る     | 葉 19 種の schema（`report-block-prose.ts`・`report-block-comparison.ts`・`report-block-diagram.ts`・`timeline-block.ts`・`figure-grammar.ts`）、`reportFigureSchema`、`REPORT_FIGURE_NONE_REASONS`、`reportSectionSchema` の `heading`、`namedWriterBlockSchema`（振り返りの `blocks` と文法カードが使う） | 部品の schema の部品として残る                                                                         |
| 残る     | `FigureBlock`・`figureBlockSchema`・`reportSectionsMarkdown` と、それが使う塊 → Markdown の関数                                                                                                                                                                                                             | 質問の添え書き（レポート外）が使う。ADR 0042 の未決 1 が決まるまで                                     |
| 残る     | 面の図・振り返り・頭の欄の Markdown 化（`reportSectionPieces` が作る `regions.sections[].markdown`・`retrospective`・`markdownLeaves`・`leafValues` と、それを読む `reportRegionsOf`・`draftRegions`・`ReportRoot`・`orderedReportRegions`・先頭欄の取り出し）                                              | 面がこれらの欄の Markdown に頼って描いている。`DrawnSection` から直接描く移行（順 10）が済んでから消す |
| 消える   | `SectionBlock`・`namedSectionBlockSchema`・`sectionBlockSchema`、`rowBlockSchema`・`panelBlockSchema`（`row-panel-block.ts`・`row-panel-markdown.ts`）                                                                                                                                                      | `legacyReportComponents` が `Row`・`Card` に写したあと                                                 |
| 消える   | `parseReportSections`・`parseSectionBlocks`・`looseSectionSchema`・`parseReportBodyContent`・`ParsedReportContent`・`body-fence*.ts`                                                                                                                                                                        | 変換が読む分だけを `legacyReportComponents` の中に畳む                                                 |
| 消える   | `ReportSection` 型・`sectionsWithFigure`・`ReportShapeTag`（`report-shape-tag.ts`）・`isForbiddenBlock`                                                                                                                                                                                                     | `reportOutline` が並びを持つ。`shapeTag` は記録の列だけ残る                                            |
| 消える   | 面の `leaves`（ADR 0042 の課題 7）、`ReportEvent.sections`、`SessionRecord` の `sections`、`unknownBlockCount` 相当の欄（旧い塊を落とす数。`droppedCount` に一本化）                                                                                                                                        | 検査・記録・描画が移ったあと                                                                           |
| 確かめる | `filesBlockSchema`                                                                                                                                                                                                                                                                                          | 変更の札（`changed-file-section.ts`）が内部で `kind: "files"` を作るので、その使い方を決めてから消す   |

- `a2ui-report-catalog.ts` は `report-block.ts` の `reportFigureSchema`・`reportSectionSchema` を import している。型を消す前に、この 2 つをカタログ側（`a2ui-report-catalog.ts` か隣の定義）へ移す。移さないとカタログが旧い型に引かれ続ける。

### 論点 6: 移行の大きさと順

**10 課題に分ける（順 10 は順 9 に着手して「面は欄の Markdown に頼っている」と分かって足した。2026-10-29）。1 課題 1 コミットで説明が付く大きさにし、読み先を替える課題は、旧い読み先を残したまま新しい読み先を足し、最後に旧いほうを外す。**

| 順  | 題                                                                                                                       | 先に要るもの                    | 壊れないもの                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------- | ------------------------------------------------------------------------------------------ |
| 1   | 旧い引数（`sections`・`body`）を復元のときに `components` へ組み直す変換を `reportEvents` の入口に置く                   | なし                            | 新しい呼び出し・記録。旧い記録は面で描かれるようになり、見た目が変わる（E2E の更新が要る） |
| 2   | `components` から節・図・振り返りの葉を取り出す導出 `reportOutline` を作り、検査の入口と `Note` の数・隣接をそこから読む | 1                               | 検査 48 条の結果。差し戻しの文                                                             |
| 3   | 字・印・平語・図番号の検査を `reportOutline` の葉から読む形に替える（意味は変えない）                                    | 2                               | 同じ                                                                                       |
| 4   | 画像棚・ファイル読み・`isSameReport`・文法カードの型参照を `reportOutline` から読む                                      | 2                               | 同じ                                                                                       |
| 5   | 使われ方の記録・体験の指標・集計スクリプトを `reportOutline` から読む（記録の形は変えない）                              | 2                               | 過去の行の読み戻し                                                                         |
| 6   | `ReportEvent.sections`・`SessionRecord` の `sections` を外し、面と草稿を `components` だけから作る                       | 2・3・4・5 と ADR 0042 の課題 7 | 面・目次・演出の DOM                                                                       |
| 7   | `row`・`panel`・`shapeTag` の型と `ReportSection`・`sectionsWithFigure` を消す                                           | 6                               | 同じ                                                                                       |
| 8   | `body-fence` と `parseReport*` を旧い記録の組み直しの中へ畳み、`report-block.ts` の旧い合併を消す                        | 7                               | 復元                                                                                       |
| 10  | 面の図・振り返り・頭の欄を、欄の Markdown に頼らず `DrawnSection` から直接描く                                           | 6                               | 面・目次・演出の DOM                                                                       |
| 9   | 塊 → Markdown の関数の入力を質問の添え書きが使う塊だけに絞り、面だけが使う Markdown 化を外す                             | 6・8・10                        | 質問の添え書き                                                                             |

- 順 2〜5 は互いに独立で、順 2 が `reportOutline` を作るので先に通す。順 3〜5 は並べて進めてよい。
- 順 6 は ADR 0042 の課題 7（`leaves` を外す）のあとに通す。`leaves` が `sections` の塊の添字に頼る間は、`sections` を外せない。
- 登録した課題との対応は下の「登録した課題」。
- 順 10 の描画の入力の形（2026-10-29）。面の値（`MainViewA2uiReport` の `surface`）に、図と振り返りの欄を `DrawnSection` の塊の並びのまま持たせる（`figure`・`retrospective`。塊は「葉の ID」か「葉に由来しない塊の Markdown」）。本文の節は従来どおり部品の木から描き、`Markdown` の葉だけが `markdownLeaves` の文字列で描かれる。面の `ReportRoot` は頭 → 図 → 節 → 振り返り → お願いの順に、欄の Markdown（`regions.sections[].markdown`・`retrospective`）を読まずに並べる。`reportRegionsOf`・`draftRegions` は同じ `a2uiReportView` を呼ぶので、2 か所が同じ入力を作る。
  - 頭とお願いは `DrawnSection` に無い（`report` の引数から組む）ので、引数から組んだ Markdown のまま描く。頭の Markdown 化（`keyFiguresMarkdown`・合図の行など）は面だけが使うので、順 9 が消すには頭を部品で描く別の課題が要る。
  - 旧い記録（`a2ui` が `none`）の経路と、先頭欄の取り出し・「描く欄があるか」の判定・`bodyChars` は、欄の Markdown（`orderedReportRegions` と `regions.sections[].markdown`）を読み続ける。これらを替えるまで、順 9 は `regions` の Markdown 欄を消せない。

## 採らなかった案

| 案                                                   | 採らなかった理由                                                                                                                                     |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 旧い形の読み手を復元の中に閉じ込めて残す             | 塊の型と Markdown 化 11 件が旧い記録のために残り、描画の経路が 2 本のままになる。利用者が組み直す側を選んだ（2026-10-28）                            |
| `sections` を `ReportEvent` に導出として持たせ続ける | 読み先が 2 つに見え、面の突き合わせの崩れ（節と葉の数が合わないと面が作れない）が残る。導出は呼ぶ側が `reportOutline` で作れば足りる                 |
| 記録の `kind` 名を部品名（`Paragraph` ほか）に直す   | 過去の行と今の行が同じ表で集計できなくなる。直すのは過去の行を捨てると決めるとき                                                                     |
| 検査 48 条を `components` に合わせて書き直す         | 条の名前・閾値・文を変えると差し戻しの率が動き、測り直しが要る。読み先の置き換えに絞り、意味が変わる `Note` の隣接と `row`・`panel` の分だけを決める |
| 疑似セッションの fixture を `components` に書き直す  | 組み直しが `reportEvents` の入口にあるので、書き直さなくても動く。50 件を書き直す益が、移行の大きさに見合わない                                      |

## 未決

1. 変更の札（`changed-file-section.ts`）が内部で作る `kind: "files"` の塊を、`components` 側のどの部品で表すか（`Table` か、専用の描画か）。順 7〜8 の前に、使われ方を見て決める。
2. 過去の使われ方の記録を捨てる時期。捨てれば `REPORT_BLOCK_KINDS` を部品の一覧から作り直せる。
3. 旧い記録の `body` の素の散文を `Markdown` の部品 1 つにしたときの見た目の差（推測）。順 1 の目視で確かめる。

## 影響

- `ReportEvent` と `SessionRecord` から `sections` が消えるので、`pnpm run test:e2e:update` が要る（順 1 と順 6）。
- ADR 0039 の論点 3（`reportEvents` が `sections` を作る）と未決 2 は、この ADR が引き取る。論点 3 の「`components` を足す」形は、読み手が移ったあとに `sections` を外す形で完成する。
- ADR 0042 の未決 2（旧い 3 変種の撤去のあと、Markdown を組む部分をどこまで消せるか）は、論点 4 の組み直しと順 10（面の欄を `DrawnSection` から直接描く）のあとで「面のための Markdown 化は全部消せる。質問の添え書きの分だけ残る」と答えが出る。順 10 までは、面の図・振り返り・頭の欄が欄の Markdown に頼るので、消せない。
- 0031（欄ごとの描画と演出・目次の区切り）・0038（部品を減らさず遅延で参照する）・0040（草稿の描画）は覆さない。

## 登録した課題

論点 6 の順 1〜9 は、そのまま 9 件の課題として登録した。順 10 は順 9 に着手して分かった前提の崩れから切り出した課題で、あとから登録した。課題の番号はこの ADR に書かない（タスク番号を書かない規約）ので、課題の題は論点 6 の表の題と同じ趣旨で、順ごとの固有の語（`reportEvents`・`reportOutline`・`ReportEvent.sections` など）が共通するので、番号はその語で課題の一覧から引く。

- 先に要る関係は課題の依存に置いた。順 2 は順 1、順 3〜5 は順 2、順 6 は順 2〜5 と ADR 0042 の課題 7、順 7 は順 6、順 8 は順 7、順 9 は順 6・順 8 と ADR 0042 の課題 7 に依る。
