# 塊を足す・外す基準（2026-09-27 決定、2026-09-30 改訂）

戻り: `docs/architecture/display.md`「塊を足す・外す基準」

**塊の種類・欄・逃げ道の中の記法を足すかは、上の物差し（読んで分かるまでの時間が短くなるか）で
決める。外すかは使われ方の数で決める**（docs/research/report-block.md 6章、記録の語彙は
`docs/research/report-architecture.md` 6章）。`report` を描く（差し戻されなかった）
たびに、その回に出た塊の種類・既定の値でない塊の欄（表のセルの `from` / `to`・`stats` の `before` / `total` / `series` / `better`・
`list` の `label`・`list` の `flow`・`dimension` の `before`・`image` の `notes`・塊の `aside`）と、逃げ道（`markdown` の塊）に出た記法の種類（重複無し。同じ種類が
同じレポートに何回出ても1回と数える）を `~/.tsukumo/report-usage/<YYYY-MM-DD>.jsonl` に1行記録する。
逃げ道に出た記法は3つに分けて持つ: **塊のある記法**（表・箇条書き・`note` など、逃げ道の外側
〔HTML の容れ物の中でないところ〕に出たもの）・**同じ塊のある記法が HTML の容れ物
（`<details>` / `<div>`）の中に出たもの**（複数の塊を畳む・並べるのは逃げ道の役目なので、
差し戻しではなく別に数える）・**塊の無い記法**（`cols` / `card`〔規約から外したので、書かれ続けるかを見る数〕・
`svg`・`dl`・引用・区切り線・`<details>` そのもの。塊に当てはまらないので昇格のきっかけになる）。知らない種類で境界で
落とした塊の数（`parseReportSections` の `unknownBlockCount`）も同じ行に足す。

- 版4からは、
  `files` に `modified` の項目があるか・`beforeAfter` か `image` の塊があるか・`task` を渡した最終レポートかの
  3つの真偽値も足す（modified があるのに前後図も画像も無い回を数えるためのもので、塊の欄とは別。外す基準の対象にしない）。
- 版5からは、段1の図（`image`・`mermaid`・`graph`・`svg`。`beforeAfter` の側を含む）があるかの `hasFigure` と、
  このターンにメインが画像のファイルを `Read` したのに `image` の塊が無かったかの `readImageWithoutImageBlock`
  （サブエージェントの `Read` は数えない）も足す。
- 版6からは、`figure` の欄の種類（図の塊の `kind` か `none`）の `figureKind` と、
  `none` のときだけその理由の `noneReason` を足す。
- 版6からは塊の種類・欄・段1の図・画像の有無を `figure` の図も含めて数える。
- 版7からは、強調（`text` の本文・`list` の項目の text・表のセルの `**…**` の対。インラインコードの中は数えない）の数 `emphasisCount` と、`graph` の辺の数 `graphEdgeCount`・ラベルの無い辺の数 `graphUnlabeledEdgeCount`・節点数 `graphNodeCount`（複数あれば最大）を足す。
- 版8からは、`checks` に `unverified` の行があるかの `hasUnverifiedCheck` と、その全部に確かめ方（`howToVerify`）があるかの `hasHowToVerify` を足す。
- 版9からは、`task` の報告の種類 `taskGenre`（`task` の無いレポートは `none`）と終わり方 `taskOutcome`、`favor` が空でないかの `hasFavor`、本文（`text`・`note`・`list` の項目・表のセル・`markdown`）に URL か `path:line` があるか `code` の塊に `path` があるかの `hasSourceReference` を足す。
- 版10からは、行が2つ以下の表が1つでもあるかの `shortTable` を足す（`rest` が空でない表は塊の欄の `tableRest` で数え、版は上げない）。
- 版11からは `stats` の `series` / `better` を塊の欄の `statsSeries` / `statsBetter` で数える（行の形は版10と同じで、版だけ上げて古い行と見分ける）。`code` の `marks` が空でない塊は塊の欄の `codeMarks` で数え、版は上げない。
- 版12からは、`aside` が空でない塊があるかを塊の欄の `blockAside` で数える（行の形は版10と同じ）。

数えるだけで差し戻しにはしない。中身は一切持たない
——数と名前だけ（`docs/coding-standards.md`「会話内容の扱い」）。書くのは
`src/server/report/adapter/report-usage-log.ts`、何を1行にするかは
`src/server/report/core/report-usage.ts` が持つ。逃げ道の記法の検出は `src/server/report/core/report-markdown-notation.ts`、
差し戻しの判定は `src/server/report/core/report-violation.ts`、図の不具合の検出は `src/server/report/core/report-figure-fault.ts` にある。

**集計するスクリプトは `scripts/runtime/report-block-usage.ts`**（`node scripts/runtime/report-block-usage.ts
--days <日数>`、既定28日）。「塊の種類 × レポート数」「塊の欄 × レポート数」「modified のファイルがあるのに前後図も画像も無いレポート」
「逃げ道の外の記法 × レポート数」「逃げ道の容れ物の中の記法 × レポート数」「塊の無い記法 × レポート数」に、「段1の図を含むレポート」と「画像を読んだのに image が無いレポート」（全レポートと task の最終レポートの2行ずつ）、
「`figure` の種類 × レポート数」と「`none` の理由 × レポート数」を、全レポートと task の最終レポートのそれぞれについて出す。
欄を記録する前の行（版2）も読み、欄の表だけは欄を記録した行を、modified の表は版4以降の行を、図と画像の表は版5以降の行を分母にする（欄を足す前後で使われ方を見比べるため）。
`figure` の表では、版5以前の行を理由が `unrecorded` の `none` に数える。
版7の欄の表は「強調の数の分布」（0・1・2・3以上 × レポート数）・「graph のあるレポートのラベルの無い辺の割合」（0%・1〜49%・50%以上）・「graph の節点数の分布」（〜5・6〜10・11以上）で、
全レポートと task の最終レポートのそれぞれに出し、分母は版7以降の行（割合と節点数は graph のあるレポート）。外す基準の対象ではない。
版8の欄の表は「unverified のあるレポートのうち確かめ方のある割合」で、全レポートと task の最終レポートの2行を出し、
分母は版8以降の行のうち `hasUnverifiedCheck` の行。外す基準の対象ではない。
版9の欄の表は「報告の種類 × レポート数」（`work`・`decision`・`research`・`unspecified`）と「種類ごとに必須の塊が無い割合」
（判断で `options` が無い・調べもので出典も `path:line` も無い・中断〔`stopped`〕で `favor` が無い）で、分母は版9以降の task の最終レポート。
外す基準の対象ではなく、差し戻しにもしない（差し戻すかは28日の数を見てから決める）。
版10の欄の表は「2行以下の表のあるレポート」で、全レポートと task の最終レポートの2行を出し、分母は版10以降の行。
外す基準の対象ではなく、差し戻しにもしない（表にする意味の薄いものの多さを数えてから決める）。
`report` が差し戻されたときも同じファイルに1行書く（`kind: "rejected"`・時刻・セッションID・差し戻しの種類の名前だけで、
手続きの種類〔`REPORT_PROCEDURE_REJECTIONS` の名前〕と記法の違反の `kind`。本文も文面も持たない）。
集計は「差し戻しの種類 × 回数」の表で、割合は `report` の呼び出し（受け付け＋差し戻し）の数に対して出す。
よく当たる規則は欄の形や説明で防ぎ、当たらない規則は削る判断に使う。

- **足すきっかけ**: 塊の無い記法の同じ種類が、直近2週間（14日）のレポートの3%以上に出たら、
  塊に上げるタスクを立てる。**数が届かないことは足さない理由にならない**（書くのが重い記法は、
  速く分かる内容でも使われない。`chart` は 2026-09-27〜09-30 の364回で1回）
- **容れ物の判断**: 塊のある記法が容れ物の中に出た数を見て、`<details>` / `div` の使われ方
  （畳む・並べる）を判断する。足す・外す基準の対象にはしない
- **外す基準**: 塊の種類か塊の欄が、直近4週間（28日）で0回だった。数が決めるので、あとの判断は
  「タスクを立てるかどうか」だけになる。**`markdown`（逃げ道そのもの）は外す基準の対象にしない**
  ——逃げ道を無くす話は塊の一覧の増減とは別の議論になる
