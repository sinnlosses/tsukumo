# 用語集: 詳細とレポート

ステータス: **正典**。入口は `docs/glossary.md`（用語集の方針と、子のファイルの一覧）。

責務: 詳細（ターンの本文）とレポートの結論部の用語（本文の欄・最終レポート・目録の1行・報告の種類・変更の札・中間レポート・経過の畳み・お願い・検証結果・合図の行）を持つ。
読む時: レポートとその結論部・中間レポートを指す語の表記に迷ったとき。
直す時: この範囲の用語を足す・識別子を変えるとき（用語はこの子に足し、親には足さない）。

## 表示

### 詳細

- **英語識別子**: `detail`
- **定義**: **ターンの本文**そのもの（手順・コード・表・判断とその理由）。メインビューに
  レポートとして出す
- **注記**: **中身は変えない。** 読みづらさの主因は見た目なので、整形は見た目の範囲に留める
  （`docs/requirements.md` 2.2）。**文体は中立の技術文**で、キャラクターの口調はセリフが担う
  （`docs/architecture/display.md` 4.2）
- **注記**: 表示単位としては「レポート」と呼ぶ。「詳細」はセリフと対になる役割の名前
- **注記**: レポート本文と質問の選択肢の `preview` の入れ物の CSS の class 名は `detailBlockClassName`
  （Markdown の部品が公開する。外の部品は CSS を import せずこの名前を自分の要素に重ねて付ける）
- **避ける言い方**: ログ、詳細情報

### 本文の欄

- **英語識別子**: `MainViewReportBody`（メインビューの本文。`regions` か `markdown`）/ `MainViewReportRegions`（`report` ツールの本文の欄の並び）/
  `head`（頭）/ `finalHead`（最終のときの頭）/ `MainViewReportSection`（節の欄。`id`・`heading`・`markdown`）/
  `retrospective`（振り返りの欄）/ `favor`（お願いの欄）/ `MainViewReportRegion`（描く順に並べた欄1つ）/
  `orderedReportRegions`（本文を描く順の欄に並べる）
- **定義**: **メインビューの本文を、Markdown 1本に畳まずに分けて持つ単位**。`report` ツールの本文は、頭（結論と合図の行）・
  節の並び・振り返り・お願いの欄を持つ。最終のときの頭は、頭に段ごとの所要時間を足したもの。節の欄の `id` は、整形して
  図を先頭に足したあとの節の並びの位置。`report` ツール以外の本文（詳細・段のまとめ）は Markdown 1本の欄にする
- **注記**: 欄が正で、描く側は欄を描く順に並べて（`orderedReportRegions`。`src/browser/domain/main-view/main-view-report-body.ts`）欄ごとに描く。
  形の決めは `docs/architecture/adr/0031-report-body-as-regions.md`
- **避ける言い方**: ブロック、塊（節の中の `ReportBlock` と紛れる）、パート

### 最終レポート

- **英語識別子**: `final`（`MainViewStep.final`）
- **定義**: **そのやり取りで最後の、中間でない本文**。`report` ツールが呼ばれたターンでは
  最後の呼び出し、呼ばれなかったターンでは最後の本文（`browser/domain/main-view/main-view.ts` の `markFinalReport` /
  `selectLastText`）。ラベル「最終レポート」（目録の1行の頭）が出るのは、同じやり取りに中間レポートがあるときか、
  本文に `report` の `task` があるときだけ（どちらも無ければ区別にならないため）。**いちばん新しいやり取りでは、加えて
  そのやり取りが閉じている（ターンが `running` でなく、バックグラウンドタスクも残っていない）ときだけ
  `final` が立つ**（閉じていないあいだは、次の `report` でいま最後の本文が
  中間レポートへ回るかもしれないため）
- **注記**: **以前は「締めの本文」と呼んでいた。** `report` が呼ばれなかったターンの受け皿
  だけに残る過去の呼び名で、いまは判定を持たない（本文の中身が実況かどうかも問わない）。
  それまで積んでいた実況・英訳・資料の判定と、その経緯は `docs/history/decision.md` が正典
- **避ける言い方**: 結論、まとめ、サマリー（`report` ツールの `conclusion` 引数と紛れる）

### 目録の1行

- **英語識別子**: `catalog`（`report-head.tsx` の `report-catalog`）。載せるタスクは `ReportTask`
  （`report` の `task`。終わり方は `outcome`）
- **定義**: **レポートの結論部のいちばん上の1行**。ラベル（「中間レポート」「最終レポート」）・タスクID・
  終わり方（✓ 完了〔`finished`〕 / ？ 答え待ち。`stopped` は描かない）・変更の札のうち、あるものだけを `·` で
  つなぐ。`task` があれば、その下に作業の名前を見出しとして出す（`docs/architecture/display/conclusion.md`
  「タスクの作業のレポートは、結論部を「目録の1行・見出し・一文」の3段にする」）
- **避ける言い方**: パンくず、メタ情報（パンくずはタスクのモーダルの「戻る」の呼び名）

### 報告の種類

- **英語識別子**: `genre`（`report` の `task` の欄）。型は `ReportGenre`、値は `work`（作業）・`decision`（判断）・
  `research`（調べもの）。無い・読めないときは `unspecified`
- **定義**: **終わった仕事の報告の型**。種類ごとに既定の節の並びを選ぶ（並びの正典は `REPORT_TASK_DESCRIPTION`）。
  省略できる。止めた報告（`outcome` の `stopped`）は種類によらず中断の型で、この欄とは別
- **避ける言い方**: 報告の kind、type（`kind` は `ReportTask` の判別子）

### 変更の札

- **英語識別子**: `changeSummary`（型は `ReportChangeSummary`、配る出来事は `report-change-summary`）
- **定義**: **`task` のある最終レポートの目録の1行の末尾に出す「変更 n ファイル +a −b」**。依頼の頭の HEAD から
  `git` の `numstat` で tsukumo が数え（件名が `<タスクID>:` のコミットだけ。絞れないときは範囲全体で、数の後ろに
  「※他の変更を含みうる」を添える）、モデルには書かせない。数えられないときは出さない。
  触ったファイルの一覧（`changed`）も運び、最終レポートの頭に畳んだ節「変更したファイル n」で出す
  （`docs/architecture/display/conclusion.md`「`task` のある最終レポートだけ、目録の末尾に変更の札「変更 n ファイル +a −b」を出す」）
- **避ける言い方**: diffstat、差分の統計

### 中間レポート

- **英語識別子**: `interim`（`MainViewStep.interim`）
- **定義**: **ターンの途中で出たレポート**。出どころは2つ: 1つのターンで `report` ツールが何度か
  呼ばれたときの最後でない呼び出し（`src/browser/domain/main-view/main-view.ts` の `selectToolReports`）と、
  段を進めた `work_plan` の**段のまとめ**（委譲中は `phase_result` では空で、メインが同じ位置で渡す `work_plan` の `phaseSummary` が段のまとめになる。
  `docs/architecture/display.md`「ワークプラン」）。メインビューには印を付けた枠で残る。通った
  `report` はそこで SDK のターンを閉じるので、`report` からの中間レポートはバックグラウンドタスクや委譲の返却で
  始まる続きのターンをまたいで生まれる。段のまとめからの中間レポートは1つのターンの中で生まれ、届いた
  時点で中間と決まるのでターンが動いているあいだも出る
- **注記**: `report` も段のまとめも無いターンには中間レポートは無い（最後の本文だけを出す）。規則は
  `docs/architecture/display.md` 4.2 が正典
- **注記**: あとに別のレポートが出た中間レポートは `<details>` で畳む（`MainViewStep.superseded` /
  `firstLine`）。まだ追い越されていない最後の1件だけは開いたまま。規則は `docs/architecture/display.md`
  4.2 が正典
- **避ける言い方**: 途中経過、進捗レポート、速報

### 経過の畳み

- **英語識別子**: `progressFold`（`progressFoldSummary`）
- **定義**: **最終レポートのある閉じたやり取りで、最終レポートの下に置く1つの畳み**。中に中間レポートを
  届いた順に1行の畳みで入れ（質問の記録も同じ並びに入る）、`<summary>` は「経過 n 件」（n は中間レポートの数）に
  「 · 質問 m 件」と段の所要を添える。
  働くあいだと、最終レポートの無いまま閉じたやり取りには置かない。規則は `docs/architecture/display.md` 4.2 が正典
- **避ける言い方**: 履歴、ログ（セリフのログ・診断ログと紛れる）

### お願い

- **英語識別子**: `favor`（`report` ツールの引数の名前。描くときは `note-favor` の塊）
- **定義**: **キャラクターから利用者への1件**。利用者にしか決められない・できないこと
  （判断・作業・情報）を、`report` の `favor` に1つだけ入れる。**作業を終えた・止めたあとに残るものに限り**、
  作業の途中で利用者の手が要るときは `report` を呼ばず `AskUserQuestion` で聞く。レポートの最後に印を付けた塊で描かれ、
  「お願い」のラベルは tsukumo 側（`src/browser/components/page/conversation/components/markdown/renderer/notation.tsx`）が
  文字として付ける
- **注記**: **向きが「依頼」と逆。** 依頼は利用者からキャラクターへ、お願いは
  キャラクターから利用者へ向く
- **注記**: **レポートが正典**で、`speak` の側では「お願いがある」ことだけを言う（中身を二重に
  書かない）。**無いターンでは置かない**。規約は `src/server/report/core/report-notation.ts` と
  各パックの `persona.md`
- **避ける言い方**: 依頼（逆向き）、質問（選択肢を出して答えを待つ
  `AskUserQuestion` は別物で、そちらは `PendingAsk`）、宿題・TODO（やり残しと読める）

### 検証結果

- **英語識別子**: `checks`（`report` ツールの引数の名前）/ `ReportCheck`（1項目。
  `src/shared/report/report-check.ts`）/ `ReportCheckStatus`（`ok` / `ng` / `unobserved` / `blocked`）/
  `howToVerify`（確かめ方。`unobserved` の行で、知らない人が繰り返せる手順）
- **定義**: **そのターンで何をどう確かめたか**（テスト・型検査・手で見たこと）。1項目は
  状態（`status`）・何で確かめたか（`label`）・結果の数（`figure`）・打ったコマンド（`command`）・
  理由（`detail`）・確かめ方（`howToVerify`）で、`report` の `checks` に並べて入れる。tsukumo が結論のすぐ下の
  合図の行に総括行を出し、落ちた・確かめていない行だけを開き、通った行は1行に畳む。状態は記号と語
  （✓ 通った / ✕ 落ちた / ？ 確かめていない / ⊘ 止まっている）の両方で見せる
- **注記**: **検証をしていないターンでは渡さない**（総括も出ない）。確かめなかった・飛ばしたものは
  `unobserved`、前提が止まって確かめられなかったものは `blocked` にし、理由は `detail` に書く。確かめ方は `unobserved` の行だけ `howToVerify` に書く。`conclusion` と `sections` には書かない（規約は
  `src/server/report/core/report-notation.ts` の「確かめたことは断定し…」の条）。規則は `docs/architecture/display.md` 4.2 が正典
- **避ける言い方**: テスト結果（型検査や目視も入る）、確認結果

### 合図の行

- **英語識別子**: `verdict`（描く印の名前。`src/shared/report/report-notation.ts` の `REPORT_DRAWN_MARK_NAMES`）
- **定義**: レポートの結論のすぐ下に置く、検証結果の塊（総括行と、落ちた・確かめていない行と、通った行の畳み）
- **注記**: 検証の無いレポートでは出ない。お願いがあれば総括行の右端に、末尾のお願いへ飛ぶ「お願い 1 ↓」の印を置く。
  規則は `docs/architecture/display/check-result.md`「検証結果は、総括行と開く行で描く」が正典
- **避ける言い方**: サマリー行（何の要約か分からない）、委譲の返却（別の語。委譲先からの知らせ）
