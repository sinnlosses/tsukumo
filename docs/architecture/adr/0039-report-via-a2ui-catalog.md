# `report` を A2UI のカタログとメッセージで受けて描く（2026-10-28）

ステータス: 採用

**`report` の生成と描画を A2UI（宣言的な JSON の部品記述をカタログで検証して描く規約）に乗せる。** 書き手が書くのは部品名と props の平らな一覧（`components`）だけで、封筒（`surfaceId`・`version`・`catalogId`）は tsukumo が補う。カタログは tsukumo の部品を 1 対 1 で写し、基本カタログからは配置と選択の部品だけを同じ型で取る。受けた一覧は `reportEvents` で今の `ReportEvent` に変換して後ろ（検査・記録・復元・目次・演出）を動かしたまま、ブラウザは一覧を `@a2ui/react` の `A2uiSurface` で描く。移行は段で進め、旧い変種は最後の段まで動かし続ける。

「乗る」ことは利用者が決めた（2026-10-28）ので、この ADR は乗らない案を比べない。決めるのは乗り方で、論点 1〜7 に答える。

## 何が困っていたか

- 変換の置き場・内部のイベントの形・描画の口を段ごとに決めずに進めると食い違う。いまの経路は、`report` ツール（`src/server/session-driver/adapter/sdk-report-tool.ts`）が `TSUKUMO_REPORT_SCHEMA`（`src/server/core/schema-variant.ts` の `json-schema`・`short-type`・`body-fence`）で引数の形を切り替え、`reportEvents`（`src/server/session-driver/core/sdk-report-message.ts`）が引数を `ReportEvent`（`src/shared/session/session-event-report.ts`）にし、`ReportReview` が差し戻し、`reportRegionsOf`（`src/shared/session/main-view-entry.ts`）が節ごとの Markdown に畳み、`report.tsx` が欄ごとに `Markdown` で描く（ADR 0031）。
- `reportEvents` は `report` ツールの handler とアシスタントのメッセージの変換の両方から呼ばれ、transcript からの復元（`restored-event.ts`）も同じ変換を通る。変換を 1 か所に置けば、受け口・記録・復元が同じ値を得る。
- 試作（`docs/research/a2ui-report-prototype-2026-10-28/index.md`）で、4 部品のカタログで節・表・地の文が描け、AI の出力 12 件中 10 件が一発で通り、落ちた 2 件（`version` の書き忘れ・葉の `component` の書き忘れ）はエラー文を返すと直った。子の型はスキーマで縛れず（`ComponentId` は文字列）、構造の規約は自前の検査に残る。
- 依存の追加の測定の結果: `@a2ui/react` だけを `.pnpmfile.cjs` の `readPackage` で zod 3.25.76 に紐付け、tsukumo の本体は zod 4.6.5 のまま。カタログは JSON Schema を書いて `Catalog.fromJson`（`@a2ui/web_core/v0_9`）で読ませる形が、tsukumo 側に zod 3 の import も型アサーションも要らず通った（`test/browser/lib/a2ui-catalog.test.tsx`）。配布物は基本カタログを読まない形で +295,524 B、読む形で +454,355 B。`src/shared/` は dependency-cruiser の `shared-packages` 規則で `@a2ui/*` を読めない（zod・`@orpc/contract`・remeda だけ）。
- 基本カタログ（`@a2ui/web_core` 0.14.0）の部品は `Text`・`Image`・`Icon`・`Video`・`AudioPlayer`・`Row`・`Column`・`List`・`Card`・`Tabs`・`Modal`・`Divider`・`Button`・`TextField`・`CheckBox`・`ChoicePicker`・`Slider`・`DateTimeInput`（`node_modules/@a2ui/web_core/src/v0_9/basic_catalog/components/basic_components.js`）。`Tabs` は `tabs: [{title, child}]` だけで選択中のタブを結ぶ欄を持たない。`ChoicePicker` の `value` は文字列の並びで、データの path に結ぶ。

## 決めたこと

### 論点 1: `report` の引数の形

**引数は `components` の平らな一覧だけを受ける。`createSurface` と `updateComponents` の封筒は tsukumo が補う。**

- `surfaceId` は `report`、`version` は `v0.9`、`catalogId` は tsukumo のカタログの定数。書き手には書かせない。根の部品の ID は `root` で、種類は `Report`（A2UI の仕様が根を `root` と決めている）。
- 理由: `createSurface` は書き手が選べる情報を持たない（`surfaceId` もカタログも 1 つに決まっている）。試作で落ちた 2 件のうち 1 件は `version` の書き忘れで、書き手が書く欄を減らすと落ち方が減ると見込む（推測。通過率は比較の測定で見る）。メッセージ 2 通を配列で受けるより、`components` の 1 欄のほうが引数の定義も短い。
- 内部では、補った封筒をつけて A2UI のメッセージ（`createSurface` + `updateComponents`）に組み直し、`MessageProcessor.processMessages` に渡す。標準の検証が拾う誤り（必須欄の欠け）はここで拾い、拾わない誤り（根の種類・子の種類・入れ子の Section・未参照の部品・未定義の参照）は tsukumo の検査が拾う（構造の規約）。エラー文は A2UI の `VALIDATION_FAILED` の形（`surfaceId`・落ちた欄を指す JSON Pointer・短い理由）で返す。
- 差し戻したあとの出し直しでは、今の `ReportInheritance`（省いた欄を直前の差し戻しから引き継ぐ）は `Report` の props の層で今と同じに効く。部品の一覧そのものは引き継がず、出し直しでは一覧を全部書かせる（部分的な `updateComponents` は採らない。未決 1）。

### 論点 2: カタログの切り方

**節の外の欄は `Report`（根）の props に残す。葉は `writerBlockBranches` の 19 種を 1 対 1 で写す。基本カタログからは配置と選択の 5 つだけを、基本の名前と型のまま取る。**

| 区分                       | 部品                                                                                                                                                                                                                                                                          | 型の出どころ                                                                                                                                                  |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 根                         | `Report`（`conclusion`・`keyFigures`・`checks`・`task`・`workPlanClosing`・`retrospective`・`favor`・`closing`・`waitingLine`・`title`・`sessionSummary`・`sessionRemaining`・`figure`〔図の部品の ID〕・`figureNone`〔置かない理由〕・`children`〔`Section` の ID の並び〕） | 既存の Zod（`report-check.ts`・`report-block-comparison.ts`・`report-task.ts`・`report-retrospective.ts`・`report-block.ts` の `reportFigureSchema`）を再利用 |
| 節                         | `Section`（`heading`・`children`）                                                                                                                                                                                                                                            | 既存の `reportSectionSchema`                                                                                                                                  |
| 葉（tsukumo 固有の 19 種） | `Paragraph`（`text`）・`ItemList`（`list`）・`Table`・`Matrix`・`Compare`・`BeforeAfter`・`Note`・`Stats`・`Code`・`Mermaid`・`Graph`・`Chart`・`Svg`・`Timeline`・`Options`・`Claims`・`Picture`（`image`）・`Plot`・`Markdown`                                              | 既存の Zod（`report-block*.ts`・`figure-grammar.ts`・`timeline-block.ts`）の props と `describe` を再利用。`fold`・`aside` など塊が持つ欄も props として残す  |
| 基本から取る 5 つ          | `Row`・`Column`・`Card`・`Tabs`・`ChoicePicker`                                                                                                                                                                                                                               | 基本カタログの型をそのまま（props を足さない・名前を変えない）                                                                                                |

- **`Report` の props に残す理由。** `keyFigures`・`checks`・`retrospective`・`favor` は 1 レポートに 1 つで、置き場が ADR 0031 の欄（頭・振り返り・お願い）に固定されている。部品にすると「どこに置くか」「何個まで置くか」の規約を ID の参照の上にもう 1 本書くことになる。節の中の配置は葉と配置の部品で表せる（`Stats` と `Row` の組み合わせ）。写すのは既存の `ReportEvent` の欄と 1 対 1 なので、変換が単純になる。
- **`figure` は ID で結ぶ。** 図は先頭の見出しの無い節として描かれてきた（`sectionsWithFigure`）。`Report.figure` に図の種類の部品（`Graph`・`Mermaid`・`Svg`・`Timeline`・`BeforeAfter`・`Chart`・`Stats`・`Plot`・`Picture`）の ID を置くか、`figureNone` に理由を置く。変換は今の `figure` の欄へそのまま写す。
- **部品は減らさない。** 19 種を 1 対 1 で写す（ADR 0038 と、部品を減らす案を取り下げた決定）。`files` は書き手に渡していない種類なので写さない。
- **基本と重なる種類は、型が同じ意味のものだけ基本へ寄せる。** `Row`（横に並べる）・`Column`（縦に積む）・`Card`（子を 1 つ枠に入れる）・`Tabs`（表示の切り替え）・`ChoicePicker`（選択）は意味が tsukumo の欲しいものと同じなので、基本の型のまま取る。基本の `Text`（`variant` で h1〜h5 を選べる）は節の見出しの規約（`Section.heading`）とぶつかり、`List` は子の雛形を繰り返す容器で `list`（項目・`cards` など）と意味が違い、`Image` は URL を取るが `image` は棚に置いたパスを取る。この 3 つは、基本の名前を使うと基本の型と props が食い違うので、tsukumo 固有の名前（`Paragraph`・`ItemList`・`Picture`）にする。名前は推測で、カタログの定義の課題が写しながら直してよい。ただし基本と同じ名前に基本と違う props を付けない。
- **使わない基本の部品は AI に見せるスキーマから外す。** `Text`・`Image`・`Icon`・`Video`・`AudioPlayer`・`List`・`Modal`・`Divider`・`Button`・`TextField`・`CheckBox`・`Slider`・`DateTimeInput` と基本の関数群（`and`・`or`・`not`・`length`・`format*` など）は載せない。props の動的な値（`DynamicString` など）は、リテラルと `{path}` だけに絞る（関数呼び出しを許さない）。
- **基本の部品の型の取り方。** `src/shared/` は `@a2ui/*` を読めず、基本の型は zod 3 で書かれている。tsukumo の共有層には自作の 19 種＋根＋節を zod 4 で書き、`z.toJSONSchema` で JSON Schema にする。基本から取る 5 つは、基本カタログの公開物（JSON）の該当部品を `src/shared/` に定数として写し、`test/` で `@a2ui/web_core` の公開物と一致することを確かめる。`dependency-cruiser` の規則は変えない。ブラウザ側は、その JSON を `Catalog.fromJson` で読み、React の実装を足して `Catalog` にする（依存の測定で通った形）。

### 構造の規約（スキーマで言えない分は tsukumo の検査に残す）

- `root` があり `Report` である。`Report.children` は全部 `Section`。参照先が全部定義されている。どこからも参照されない部品が無い。
- `Section.children` は葉・`Row`・`Column`・`Card`・`Tabs`・`ChoicePicker`。`Section` の入れ子は不可。配置の部品の入れ子は 2 階層まで、`Row`・`Column`・`Card`・`Tabs` の子は葉か配置の部品（`Report`・`Section` は不可）。2 階層は推測で、横並びの比べ（`Row` の中に `Card` を入れる程度）で足りる見込み。
- 見出しと字数の上限など、いま `ReportReview` が持つ体裁の条は変えない。

### 論点 3: 内部のイベントの形

**`ReportEvent` を残し、`reportEvents` が A2UI の部品を `sections` などに変換する。さらに `ReportEvent` に、受けた部品の一覧を運ぶ欄 `components` を 1 つ足す（旧い変種では空）。**

- 後ろの検査（`ReportReview`）・記録（`report-usage-record.ts`）・復元・目次・演出・E2E の手続き応答は、`sections` などの今の欄を読み続ける。変換の置き場は `reportEvents` の 1 か所で、`report` ツールの handler・アシスタントのメッセージの変換・transcript からの復元の 3 経路が同じ値を得る。
- 配置の部品（`Row`・`Column`・`Card`・`Tabs`・`ChoicePicker`）は、`sections` へは中の葉を並び順に平らに入れる（検査は塊の数と中身を見るので足りる）。配置は `components` だけが持つ。
- ブラウザは `components` があればそれで描き（論点 4）、無ければ今の経路（`sections` → Markdown）で描く。旧い変種の記録・今ある transcript は `components` が空で、今のまま描く。
- 「完全移行」は最終の形で、`ReportEvent.sections` を導出される見え方に格下げして検査を `components` から読む形は、既定を切り替えたあとに別の課題として決める（未決 2）。この ADR が決めるのは、そこへ進むために途中の段で何も壊さない順。
- 理由: 安全さを先にした。`ReportEvent` を作り替えると、検査 48 条・記録・復元・ブラウザの欄・E2E の型が同時に動く。`components` を足すだけなら、旧い変種のイベントは `components: []` が付く以外変わらない。

### 論点 4: ブラウザの描き方

**`@a2ui/react` の `A2uiSurface` とカタログの React 実装で描く。葉の実装は、既存の塊 → Markdown の変換（`report-markdown.ts`）を `Markdown` に通して再利用する。操作できる部品と配置の部品だけ React で書く。**

- 理由: 葉 19 種の描画はフェンス・許可リスト・mermaid・`chart` を `Markdown` が持っていて、React で書き直すと見た目と図表番号・傍注の置き場を二重に持つ。tsukumo のデザインシステムで描くという決定は、既存の描画を使えば満たされる。基本の Lit の実装は読み込まない。
- `Report` の実装は、頭の欄・振り返りの欄・お願いの欄を、今の `reportRegionsOf` が作る欄の Markdown で描き（`Report` の props を `ReportEvent` の欄に戻して使う）、`Section` を `buildChild` で並べる。`Section` の実装は入れ物に `data-report-region="section"` と `data-report-section`（欄の ID）を付け、見出し（`h4`）を作る。
- **目次・演出・欄の ID が同じに動く条件。**
  - (a) 入れ物の `data-report-region`・`data-report-section` の値と並びが今の欄と同じ（`orderedReportRegions` と同じ並び: 頭・先頭の図の節・節・振り返り・お願い）。
  - (b) `h4`・`h5` の出る位置と数が同じ。
  - (c) 図表番号と傍注の割り当て（`report-markdown.ts` は節の中の塊の並びから数える）が、`Report` の実装が部品の一覧を順にたどって出した値を React の context に置き、葉の実装が引く形で同じ値になる。
  - (d) `use-report-reveal.ts` はマウント時の DOM だけを見る（本文が後から伸びると筆が途中で止まる、という既知の癖）。一覧を一度に渡して 1 度のマウントで完成した DOM にする。段階描画は別の測定（段階描画の測定の課題）に預け、ここでは採らない。
- (c) の「塊 1 つぶんを Markdown にする関数」は、今は節単位（`reportSectionMarkdowns`）。塊単位に切り出せるかはブラウザ描画の課題が確かめる（未決 3）。切り出せないときは、`Section` の実装が子の葉をまとめて節単位の関数に渡す形に倒す。
- 目視で確かめる: 既定の変種と `a2ui` の変種で同じ 9 本を描いて並べる（比較の測定の課題）。

### 論点 5: 旧い変種と `report_part_card` の行き先と撤去の順

- 既定の切り替えと撤去は最後の段で、利用者が比較の測定の数を見て決める。それまで 3 つの変種は動き続ける。
- 撤去の順は、使われ方の少ない順に `body-fence` → `short-type` → `json-schema`（既定のものは最後）。`sections`・`body` の受け口は `json-schema` と一緒に外す。`ReportEvent.sections` は変換の出力として残る（論点 3）。
- `report_part_card` は残す。ツール定義の大きさを抑えるための遅延の参照で、部品を減らさない代わりに必要になったときだけ型と例を引かせる仕組み。引く対象は旧い変種の短い型の表記から、カタログの部品名（`Table` など）の JSON Schema の断片と `components` の例 1 つに替える。替える時期は `a2ui` の変種が既定になったとき。部品の JSON Schema 全部をツール定義に載せるか、`component` の名前の列挙だけ載せて詳細を `report_part_card` に回すかは、比較の測定でツール定義の大きさ（試作は 4 部品で約 5,400 字）と通過率を測って決める（未決 4）。
- 基本カタログのスキーマは丸ごと載せない（論点 2）ので、基本カタログを読む形の配布物の増分 +454,355 B のうち、基本の実装（Lit）の分は読み込まない。基本の定義を読む必要があるのは `Catalog.fromJson` に渡す JSON だけで、5 部品ぶん。

### 論点 6: 重なる課題の扱い

| 課題                                        | 扱い                                                   | 理由                                                                                                                                                                                                                                                                      |
| ------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `row`・`panel` を足す課題                   | カタログの部品として書き直して残す（待たせる）         | 横に並べる・枠に入れるは、基本の `Row`・`Card`・`Column` を取れば足りる。新しい塊の種類は作らない。題つきの枠は `Card` の中に見出しの `Paragraph` を置いて表す。目的（横並びの比べで残った差）は変わらないので、ブラウザ描画の課題のあとの描画と 9 本の再描画に付け替える |
| 依頼の型ごとの雛形を持つ課題                | そのまま進める。本文を `components` の並びで言い直す   | 依頼の型ごとに最初の 1 画面の並びを決める雛形は、部品の並べ方の話で、`a2ui` の変種でも要る。雛形を `Report`・`Stats`・`Row` などの組み合わせで書く                                                                                                                        |
| `row`・`panel` の使われ方を見る課題         | hold のまま。本文を `Row`・`Card` の言い方に揃える     | 使われ方を見る前提は同じ                                                                                                                                                                                                                                                  |
| 入れ子の union を平らにする課題             | 取り下げる                                             | `components` の平らな一覧と ID の参照が、課題の狙い（入れ子の深い引数での生成精度の低下を避ける）を満たす。旧い変種はいずれ外すので平らにする意味が無い                                                                                                                   |
| 短い型の表記の版の採否を決める課題          | 取り下げる                                             | 短い型の表記の版は撤去の対象で、採否を測る意味が無い                                                                                                                                                                                                                      |
| 軽くした定義の `alwaysLoad` を測り直す課題  | 取り下げる                                             | 短い型の表記の版の測り直し。遅延の参照の話は論点 5 の未決 4 が引き取る                                                                                                                                                                                                    |
| 旧 chart を書き手の口から外す課題           | hold のまま。カタログから `Chart` を外す課題に言い直す | 並走の 14 日後に使われ方を見て決める筋は同じ。外す先が「書き手の口」から「カタログの部品」に変わる                                                                                                                                                                        |
| 塊を足すかを決める課題（配置・判定）の 2 件 | hold のまま。「塊」を「部品」に言い直す                | 足すかどうかを決める課題で、足すなら塊でなく部品として足す                                                                                                                                                                                                                |

### 論点 7: 操作できる部品

- **最初に作るのは操作できる `Table`**（列の見出しを押して並べ替える・語で絞り込む）。表は `report` の中で最も使われ、並べ替えと絞り込みの需要が分かりやすい（推測。使われ方の記録で確かめていない）。`Table` の props に任意の `sortable`・`filterable` を足す。状態は部品の中に閉じ、書き手は path を書かなくても動く。
- **操作の状態を置く path は tsukumo が決める。** データモデルの `/view/<componentId>/<キー>`（`sort`・`filter`）。書き手が path を選ばないので衝突しない。開き直したら初期化する（データモデルを復元しない）。状態は `ReportEvent`・transcript・記録に載せない。
- **`Tabs` と `ChoicePicker` との組み合わせ。** `Tabs` は表示の切り替えに使う（子は葉か配置の部品）。基本の `Tabs` は選択中のタブを結ぶ欄を持たないので、選択はその部品の内部の状態で、他の部品から操作しない。`ChoicePicker` は絞り込みの値を選ぶ。`value` を `{path: "/view/<TableのID>/filter"}` に結ぶと、その `Table` が絞られる。この組み合わせの規約は構造の検査に足す: path が実在する `Table` の ID を指す・`Table` が `filterable`・選択肢の値が表のセルに現れる。基本の関数に絞り込みも並べ替えも無いので、絞る・並べるは `Table` の実装が持つ。
- **AI が書ける率の測り方（比較の測定に載せる）。** 試作と同じ呼び出し（`claude -p`・カタログの JSON Schema・JSON Lines の出力）で、操作できる部品を求める依頼を 1 題材あたり 12 件ずつ書かせ、(1) 一発で通る率、(2) エラー文を返して直る率、(3) path の整合の違反数を、操作無しの 12 件と並べる。
- 演出との関係（推測）: 絞り込みは表の行を隠すだけで DOM の根は同じなので、演出のマウント時の DOM を前提にした癖は避けられる見込み。ブラウザ描画の目視で確かめる。

## 段の移行

| 段                                      | 変える場所                                                                                                                                             | 壊れないもの                                                                           | 戻し方                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 0. 依存（済）                           | `package.json`・`.pnpmfile.cjs`                                                                                                                        | 全部（誰も読まない）                                                                   | 依存を外す                                                               |
| 1. 決定（この ADR）                     | `docs/`                                                                                                                                                | 全部                                                                                   | ADR を直す                                                               |
| 2. カタログの定義                       | `src/shared/report/` にカタログの定義と JSON Schema の出力                                                                                             | 全部（読む側がまだ無い）                                                               | ファイルを消す                                                           |
| 3. 入口の変種                           | `schema-variant.ts` に `a2ui` を足す。`sdk-report-tool.ts`・`reportEvents`・構造の検査・差し戻しの文。`ReportEvent` に `components` を足す（既定は空） | 既定の `json-schema`・`short-type`・`body-fence`。イベントは `components: []` 以外同じ | `TSUKUMO_REPORT_SCHEMA` を戻す。変種を外す                               |
| 4. ブラウザの描画                       | `src/browser/` に `A2uiSurface` の口とカタログの React 実装。`components` があれば使う                                                                 | `components` が空の記録の描画。目次・演出・復元は同じ DOM                              | `components` を読む分岐を外す。`a2ui` の変種を使わない                   |
| 4b. 操作できる部品                      | `Table` の並べ替え・絞り込み。`ChoicePicker` と path の整合の検査（課題は登録済みで、ブラウザの描画の課題のあとに進める）                              | 操作の props を使わない描画                                                            | `sortable`・`filterable` を外す                                          |
| 5. 測定（比較と段階描画）               | `docs/research/` に記録。コードは変えない                                                                                                              | 全部                                                                                   | 記録を消す                                                               |
| 6. 切り替えと撤去（利用者の判断のあと） | 既定を `a2ui` に。旧い変種と `sections`・`body` の受け口を外す。`report_part_card` を向け直す                                                          | `ReportEvent.sections` は変換の出力として残り、検査・記録・復元は同じ                  | 撤去の前の commit に戻す。撤去前に旧い変種で出た記録は読み戻せるまま残す |

各段は 1 コミットで説明が付く単位にする。段 3 と 4 の E2E は、イベントの型が変わる（`components` の欄）ので `pnpm run test:e2e:update` を `check` より先に打つ。

## 採らなかった案

| 案                                                                  | 採らなかった理由                                                                                                                                                         |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `createSurface` + `updateComponents` のメッセージを書き手に書かせる | 封筒は書き手が選べる情報を持たず、試作で `version` の書き忘れが 1 件落ちた。書く量を減らすほうが通りやすい（推測。通過率は比較の測定で測る）                             |
| 部分的な `updateComponents`（差分だけ送る）                         | 差し戻し後の出し直しで、どの部品が置き換わるかを書き手も検査も追う必要が出る。全部書かせる（未決 1 で再訪する）                                                          |
| `keyFigures`・`checks`・`retrospective`・`favor` を部品にする       | 置き場が欄で固定されている。部品にすると「根の子に何個まで」の規約と ID の参照が増えるだけ                                                                               |
| 葉を減らす（`Matrix` を `Table` に畳むなど）                        | 部品は減らさない決定（ADR 0038 と、部品を減らす案を取り下げた決定）に反する                                                                                              |
| 基本の `Text`・`List`・`Image` に寄せる                             | `Text` の見出しの `variant` が節の見出しの規約とぶつかり、`List` は繰り返しの雛形で意味が違い、`Image` は URL でパスと違う。基本の名前に違う型を載せると書き手が混同する |
| 基本の Lit の実装を読み込む                                         | 利用者の決定。配布物が増え、デザインシステムと別の見た目になる                                                                                                           |
| `@a2ui/*` を `src/shared/` に読ませる（`shared-packages` を緩める） | 共有層を zod 3 の依存から離す線を壊す。共有に zod 4 の定義と JSON を置き、ブラウザが `fromJson` で読む形で足りる                                                         |
| `ReportEvent` を `components` だけにして検査を先に書き直す          | 検査 48 条・記録・復元・E2E が同時に動く。安全に移るという決定に反する。最終の形として別に決める（未決 2）                                                               |
| 葉を React で書き直す                                               | 見た目・図表番号・傍注の置き場が二重になる。デザインシステムは既存の描画を使えば満たされる                                                                               |
| 段階描画を最初から採る                                              | `useReportReveal` がマウント時の DOM だけを見る癖があり、Agent SDK が引数の断片を流すかも未測定。段階描画の測定に預ける                                                  |

## 未決

1. 差し戻し後の出し直しで部品の一覧を引き継ぐか。この ADR は「全部書かせる」とした。差し戻しの記録で出し直しの字数が重いと分かれば再訪する。
2. 検査を `components` から読む形（`ReportEvent.sections` を導出に格下げする）へ進めるか。既定の切り替えのあとで、利用者が決める。
3. 塊 1 つぶんを Markdown にする関数を切り出せるか（図表番号と傍注の割り当てを context で渡す案）。ブラウザ描画の課題が実物で確かめ、切り出せなければ節単位に倒す。
4. ツール定義に部品の JSON Schema を全部載せるか、名前の列挙だけにして `report_part_card` で引かせるか。比較の測定が大きさと通過率で決める。
5. 配置の部品の入れ子の上限（2 階層）と、`Card` の中の見出しの置き方。推測で、9 本の再描画で足りなければ広げる。
6. 部品名（`Paragraph`・`ItemList`・`Picture` ほか）。推測で、カタログの定義の課題が直してよい。

## 影響

- `src/shared/report/` にカタログの定義が増える。写し元の Zod を再利用するので、説明（`describe`）は 2 か所に書かない。
- `ReportEvent` に `components` の欄が増え、`pnpm run test:e2e:update` が要る。旧い変種の記録・復元は変わらない。
- 操作できる部品の課題（段 4b）は登録済みで、ブラウザの描画の課題のあとに進める。
- 0031（欄ごとの描画と演出・目次の区切り）・0032（自由な HTML を載せない）・0034（描き方は tsukumo が持つ）・0038（部品を減らさず遅延で参照する）は覆さない。0010（`report` はツールで受ける）の受け口の形だけが変わる。
