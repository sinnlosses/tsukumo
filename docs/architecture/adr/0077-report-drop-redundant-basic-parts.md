# `report` の書き手に見せる部品から、基本の5部品を外す（2026-11-20）

ステータス: 採用

**書き手に見せる部品（`report` ツールの定義・部品カード・書いた部品を受ける検査）から、A2UI の基本カタログから写した `Row`・`Column`・`Card`・`Divider`・`ChoicePicker` を外す。書き手の部品は33種から28種になる。過去のレポートを読み戻して描く経路は、この5種を受けたまま残す。** ADR 0039 の「基本から取る5つ」（`Row`・`Column`・`Card`・`Tabs`・`ChoicePicker`。`Divider` は後から足された）を、`Tabs` だけ残してこの ADR で上書きする（ADR 0039 の本文は書き換えない）。

## 何が困っていたか

5種は、ほかの部品で同じものが描けるのにほとんど使われていない。`~/.tsukumo/report-usage/*.jsonl` の、受け付けた691件（2026-10-28〜11-20）を、レポートごとに `componentNames` へ含むかで数えた。

| 部品           | 使ったレポート |
| -------------- | -------------- |
| `Row`          | 2件            |
| `Column`       | 3件            |
| `Card`         | 1件            |
| `Divider`      | 0件            |
| `ChoicePicker` | 0件            |

書き手の定義に残すと、部品カードと `report` ツールの定義が長くなり、選ぶ手間だけが増える。

## 決めたこと

- **外す5種と、代わりの部品。**
  - `Row`・`Column`: 横に並べるのは `Grid`（狭い幅で段に折り返す）、縦に積むのは `Section.children` の並びで足りる
  - `Card`: 囲む役は `Section` と `Grid` が持つ
  - `Divider`: 区切りは `Section` の見出しで足りる
  - `ChoicePicker`: 表の絞り込みは `Table` の `filterable`・`filterColumn` が題の行のバッジで作る。`ChoicePicker` は同じものを path で手で結ぶ形だった
- **残す部品。** `Tabs`・`Grid` は残す（2026-11-20 に利用者が決めた）。
- **読み戻しは残す。** 過去のレポートの `components` を読み戻して描く経路（transcript の `tool_use` を読む `readWrittenComponent` が通す `a2uiWrittenComponentSchema`・静的な一覧の `a2uiReportComponentSchema`・`buildReportCatalogDocument`・ブラウザの React 実装）は、5種を受けたまま描く。旧い変種を組み直す `legacyReportComponents` が出す `Row`・`Column`・`Card` も、同じ経路で読む。記録済みのレポートは、外す前の部品を持っている。
- **外した5種を書いた呼び出しは、知らない部品として差し戻る。** 構造の検査が、書き手に見せる部品の表に無い名前を `unknown-component` で拒む。`report_part_card` に5種の名前を渡しても「知らない部品」が返る。
- **検査の結び。** `ChoicePicker` を `Table` の `filterable` へ結ぶ検査（結び先の欠け・`filterable` の欠け・選択肢の値がセルに無い）は、書き手が `ChoicePicker` を書けなくなるので外す。

## 結果

- 書き手の定義は28種（根・節・格子・内容部品22種・つまみ2種・`Tabs`）。読み戻しの部品とカタログ文書は33種のまま。
- 外した5種を書いた旧い手順は、差し戻しの文で `Grid`・`Section`・`Table` の `filterable` へ書き直せる。
