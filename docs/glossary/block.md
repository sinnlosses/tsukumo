# 用語集: レポートの節と塊

ステータス: **正典**。入口は `docs/glossary.md`（用語集の方針と、子のファイルの一覧）。

責務: レポートの本文の組み立ての用語（節・塊・形の札・確度つきの主張・余白の柱）と、メインビューのやり取りの列・選択肢の比較の用語を持つ。
読む時: レポートの本文の節・塊とその欄を指す語の表記に迷ったとき。
直す時: この範囲の用語を足す・識別子を変えるとき（用語はこの子に足し、親には足さない）。

## 節の索引

| 節      | 収録している用語                                                           |
| ------- | -------------------------------------------------------------------------- |
| ## 表示 | 節 / 塊 / 形の札 / 確度つきの主張 / 余白の柱 / やり取りの列 / 選択肢の比較 |

## 表示

### 節

- **英語識別子**: `ReportSection`（`src/shared/report/report-block.ts`）/ `sections`（記録と
  `SessionEvent` の `report` の欄）/ `heading`（節の見出し）
- **定義**: **レポートの本文を区切る1段**。見出し（`heading`）と、その下に平らに並ぶ塊の並びを持つ。
  本文は節の並びで、入れ子は節の1段だけ。見出しが空の節は見出しを描かない
- **注記**: `report` の引数 `sections` がこの形で、節が2つ以上なら全部に見出しを付けさせる（無ければ
  差し戻す）。引数が文字列の `body` だったころの記録は、呼び出しをイベントに変える境目
  （`sdk-report-message.ts` の `reportEvents`）で見出しの無い節1つ・逃げ道の塊1つに畳むので、描く側は文字列の
  本文を見ない。形の案は `docs/research/report-block.md`、決定は `docs/architecture/display.md` 4.2
- **避ける言い方**: セクション（Markdown の見出しの区切りと紛れる）、章

### 塊

- **英語識別子**: `ReportBlock`（`src/shared/report/report-block.ts`）/ `kind`（`text` / `list` /
  `table` / `matrix` / `compare` / `beforeAfter`（前後）/ `dimension`（寸法図）/ `note` / `stats` / `code` / `mermaid` / `graph`（`source` の1行1辺の記法で受ける flowchart。行頭の `+ ` / `- ` / `~ ` が足した・消した・変えたの印。2026-10-12 利用者決定）/ `chart` / `svg`（座標つきの図形で書く図）/ `progress` / `options` / `claims`（確度つきの主張）/ `image`（画面の画像）/ `files` / `markdown`）/ `fold`（畳むときの見出し）/ `aside`（塊の傍注。下の「余白の柱」）/
  欄の `from` / `to`（表のセルの前後）・`before`（`stats` の前の値）・`total`（`stats` の全体の数）・`label`（`list` の項目の名前）・
  `flow`（`list` の `style` の一本道の流れ）・`sides`（`compare` の2つの側。`heading` と `points`）・
  `before` / `after`（`beforeAfter` の前の側と後の側。`kind` が `image`〔`path`と任意の `region`（変わった場所の枠。% の `left`・`top`・`width`・`height`）〕/ `code`〔`language`・`source`〕/ `points` / `mermaid`〔`source`〕/ `svg`〔`width`・`height`・`shapes`〕の合併型）・
  `width` / `height`（`svg` の viewBox の大きさ）・`shapes`（`svg` の図形の並び。`kind` が `rect`〔`x`・`y`・`width`・`height`・`label`・`emphasis`〕/ `line`〔`x1`・`y1`・`x2`・`y2`・`arrow`・`label`〕/ `text`〔`x`・`y`・`text`〕の合併型）・`emphasis`（`rect` の枠を強調する真偽値）・`arrow`（`line` の終点に矢じりを付ける真偽値）・
  `parts`（`dimension` の上から積む並び。領域の `name` / `size` / `before` と余白の `gap` / `before`）・`verdict`（`options` の候補の判定）・`claim` / `certainty` / `basis` / `howToVerify`（`claims` の項目。下の「確度つきの主張」）・`change`（`files` の変更の種別）・
  `path`（`image` の画像のファイル）・`caption`（`image` の何が見えるかの1行）・`notes`（`image` の番号つきの説明の並び）・
  `chartKind`（`chart` の種類。`bar` / `line` / `pie` / `arrow` / `slope` / `span` / `share`）・`labels`（`chart` の横軸・扇形・項目・部分の名前）・
  `series`（`chart` の系列。`name` と `values`）・`horizontal`（`chart` の `bar` を横棒にする真偽値）/
  `ReportBlockField`（使われ方の記録で数える欄の名前）
- **定義**: **節の中に並ぶ、種類の決まった本文の1単位**。種類ごとに決まった形で Markdown に組んで
  描く（`reportSectionsMarkdown`）。塊の文字は行頭の塊の記法と `<` を逃がし、インラインの記法
  （inline code・太字・リンク）だけが効く。`fold` のある塊は `<details>` に畳む
- **注記**: **`markdown` の塊が逃げ道**で、中身は逃がさず今の本文と同じ経路で描き、行を落とす整形
  （`tidyReportSections`）もこの塊に掛かる。どの塊にも当てはまらないときだけ使い、逃げ道の外側に塊の
  種類がある記法（見出し・表・箇条書き・`note`・`stats`・`progress`・フェンス）を書いた `report` は
  差し戻す。崩れた塊・知らない種類の塊は入口で落とす。種類ごとの使いどころは各塊の `describe` が持つ。
  **`progress` は段（フェーズ）の位置**（`steps` と `current`）を、済んだ段・いまの段・残りの段が
  枠と文字（済／今／番号）の両方で見分けられる図として描く（`docs/architecture/display.md` 4.2）。
  **`options` は候補の比較**（候補ごとの判定〔採る / 検討 / 採らない〕と理由を1案1行に積む。書き手の順のまま描く）、
  **`files` は触ったファイルの一覧**（1行に1ファイルで、変更の種別〔追加 / 変更 / 削除 / 読んだ〕とパス）。
  **欄**は事実か判定を言うものだけで（前後の値・名前・流れ・判定・変更の種別）、描き方は tsukumo がその意味から決める。
  段ごとに文が要る一本道は `list` の `flow`、一本道でも段の名前が短ければ・分岐・合流があれば `graph`（`source` の1行1辺の記法〔`A -> B: 語`〕で渡し、ID とラベルの引用符は tsukumo が組む。2026-10-12 利用者決定。flowchart 以外の図が `mermaid`）
- **避ける言い方**: ブロック（Markdown の block と紛れる）、要素（HTML の要素と紛れる）、`options` を
  「選択肢の比較」と呼ぶこと（質問の `preview` を並べた面の名前と紛れる。`options` は「候補の比較」）

### 形の札

- **英語識別子**: `ReportShapeTag`（`src/shared/report/report-shape-tag.ts`）/ 列挙 `REPORT_SHAPE_TAGS` /
  札ごとの表 `REPORT_SHAPE_TAG_RULES` / 節の欄 `shapeTag` / 札を省いた節を含む `RecordedReportShapeTag`（`unspecified`）。
  値は 因果 `cause`・つながり `connection`・位置 `position`・状態 `state`・時間 `time`・順序 `order`・量 `quantity`・
  選択 `choice`・属性の並び `attribute`・対応 `mapping`・見比べ `comparison`・境界 `boundary`・並列 `parallel`・一言 `single`
- **定義**: **節が表す内容の形。** 書き手が節ごとに1つ言い、札ごとに第一候補・許す代替・許さない塊が決まる。
  許さないのは下の段（`table`・`list`・`text`）だけ
- **注記**: 前後・確度・所在は札にせず、どの札にも掛かる添え物として扱う（確度は `claims` の塊が受ける）。`svg` の塊の欄 `shapes` と紛れるので、
  識別子に `shape` を単独で使わない
- **避ける言い方**: タグ、型（`task` の `genre`〔報告の種類〕と紛れる）

### 確度つきの主張

- **英語識別子**: 塊の `kind` の `claims`（`src/shared/report/report-block-prose.ts` の `claimsBlockSchema`）/ 項目の欄 `claim`（主張）・
  `certainty`（確度。確定 `confirmed`・推測 `inferred`・未確認 `unverified`）・`basis`（根拠）・`howToVerify`（確かめ方）
- **定義**: **主張ごとに確度・根拠・確かめ方を1組で持つ塊。** 確かめていないこと・推測を書く置き場で、確定でない項目は確かめ方を空にできない
- **注記**: 検証の結果（テスト・型検査）は `checks` に書き、この塊に入れない。`note` の `ask` は答えの出ていない問い1つに使う。
  決定は `docs/architecture/display.md` の「出力の分離（セリフと詳細）」（`display/block-field.md`）
- **避ける言い方**: `claim` を単独で概念の名前にすること（セッションの占有 `SessionClaim` と紛れる）、確信度

### 余白の柱

- **英語識別子**: `gutter`（記法の印は `with-gutter`〔塊と傍注の包み〕/ `gutter`〔傍注の並び〕/ `gutter-note`〔傍注1つ〕、
  CSS は `report-gutter` ほか）/ 塊の欄 `aside`（**塊の傍注**。出典・どこを見るかの1行）
- **定義**: **レポートの本文の列（42em）の右に置く、傍注の列**。出すのは `memo` の `note` と塊の `aside` だけで、
  直前の塊の上端に揃える。本文の列の右に 160px 以上空かないときは、塊の直後の1行として本文の中に畳む
- **注記**: 塊の欄の `aside` は「脇の話」の `aside` とは別物。「柱」とだけ書くと中くらいの窓幅でサイドバーを畳んだ
  柱（`rail`）と紛れるので、文書では「余白の柱」と書く
- **避ける言い方**: 柱（`rail` と紛れる）、サイドノート、脇（脇の話と紛れる）

### やり取りの列

- **英語識別子**: `ReportOutline`（部品。`main-view/components/report-outline/`）/
  `ReportOutlineEntry`（見出し1つ。`level` は `section`〔`##`〕/ `sub`〔`###`〕）
- **定義**: **メインビューの左の列**。窓の中のやり取りの一覧と、見ているやり取りのレポートの見出しの
  並びを、本文を押しのける列として置く。押すとそのやり取り・見出しへ転がす。名前は「やり取り」
  （2026-10-08。以前は「目次」）
- **注記**: 見出しは描いた本文の DOM（`h4` / `h5`）から拾い、畳んだ `<details>` の中のものは数えない。
  列は隠さず常に出し、幅が足りないときは畳んだ細い列になる。出し方の規則は `docs/architecture/display.md` 4.2、
  寸法・畳みの幅は `docs/architecture/screen-design/layout.md` 13.4「やり取りの列」
- **注記**: 狭い画面（760px 以下）では、やり取りの並びは引き出しの「やり取り」のタブに移る（2026-10-09）
- **避ける言い方**: 目次（見出しだけの並びだった頃の名前）、アウトライン、TOC

### 選択肢の比較

- **英語識別子**: `QuestionOption.preview`（`src/shared/session-driver/question.ts`。札は `<Inquiry>`）
- **定義**: 質問（`AskUserQuestion`）の**選択肢ごとに付く Markdown の本文**と、それをメインビューに
  並べた面。表・図・メリットとデメリットで案を見比べるためのもので、答え待ちの間だけ出る
- **注記**: **選択肢そのものは入力欄の箱に出たまま**（押す場所と読む場所を分ける。2026-09-21 決定。
  `docs/architecture/display.md` 4.2）。箱で触れた選択肢の札が比較の面で光る
- **注記**: `preview` は `AskUserQuestion` が元から持つ項目名なので**そのまま使う**。描くのは
  レポートと同じ経路（同じ記法・同じサニタイズ）
- **避ける言い方**: プレビュー（カタカナだけだと「下書きの見え方」と読める）、選択肢の詳細
  （`description` と紛れる）
