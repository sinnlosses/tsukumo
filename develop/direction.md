# 未対応の指示メモ（ここに書くと次のセッションが `/plan-tasks` でタスク化する。正典: `task-workflow` の `WORKFLOW.md`）

## ユーザーから

## エージェントのドラフト

### T-328 で決めた形の横展開（2026-09-22 洗い出し）

T-328 とその指摘対応で、機能の中を **`hooks/`（React に縛られたロジック）/ `components/`（部品）/
`domain/`（React を知らない純関数）/ container・presenter** に分ける形が決まった
（正典は `docs/design.md` 2章「機能の中を分ける」）。同じ形が当てはまる場所を、実物を見て洗い出した。

**1. 部品ファイルに同居しているフックを `hooks/` へ出す（3件）**

- `src/browser/features/character-view/character-view.tsx:60,95` — `useNowForPortraitMotion` /
  `usePortraitMotion` が部品と同じファイルにある
- `src/browser/features/dispatch/file-suggestions.tsx:92` — `useRepositoryFilePaths` が同上
- `src/browser/features/main-view/report-reveal.ts:86` — `useReportReveal` は専用ファイルだが
  `hooks/` の外にある（361行で、このファイルにはフック以外も入っている）

`task-board` で `use-task-board.ts` を出したのと同じ形。**T-336〜T-339 の対象外のファイル**なので、
それらとは別に扱う。

**2. 部品ファイルに同居している純関数を `domain/` へ出す（2ファイル・4関数）**

- `src/browser/features/dispatch/command-suggestions.tsx:23,35` —
  `shouldShowCommandSuggestions` / `matchingCommands`
- `src/browser/features/dispatch/file-suggestions.tsx:55,75` — `filePathQuery` / `matchingFilePaths`

`task-list.tsx` の中にあった `taskListTitle` を `domain/task-list-title.ts` へ出したのと同じパターン
（テストも `test/.../domain/` へ割った）。**この2ファイルは T-337 の対象（composer と
pending-answer）とは別ファイル**なので、重なるかどうかを着手前に見る。

**3. 1秒刻みの `now` が2箇所にある → `browser/hooks/` へ上げるか決める**

- `src/browser/features/character-view/character-view.tsx:60` — 次の窓までの遅延を毎回計算して
  タイマーを立て直す（可変）
- `src/browser/features/dispatch/turn-status.tsx:46` — `setInterval` で固定1秒

**同じものではない**ので、まず「共通化できるか」を確かめる。できるなら `browser/hooks/use-now.ts`、
できないなら**なぜ別なのか**を両方のコメントに残す（`browser/hooks/` は 2026-09-22 に作った箱で、
いま入っているのは `use-modal-dialog.ts` 1本だけ）。

**4. 機能の中の置き場を `test/architecture.test.ts` で守るか決める**

いまの検査は「機能どうしの import」と「箱をまたぐ import」だけで、**機能の中に
`hooks/` `components/` `domain/` 以外のディレクトリを作っても落ちない**。T-336〜T-339 で4機能に
同じ形を広げるなら、その前に検査を足すかを決めておく（`BROWSER_REGIONS` の載せ忘れを `throw` に
したのと同じ考え方）。

**5. 「部品は `function` で書く」を機械で守れるようにするか**

規約は `docs/coding-standards.md`「部品は `function` で書く」に書き、既存の3件
（`Report` / `ReportBlock` / `TaskTable`）も揃えた。ただし**いまは人が見るしかない**。
oxlint のルールで書けるか、小さな検査テストにするかを決める。

**6. props を分解する例外を規約に落とすか**

`presentational-task-board.tsx` と `task-board.tsx` の2つだけ props を分解している
（ref を `props.ref` の形で描画中に読むと `react(refs)` が落ちるため）。他の部品が同じ状況に
なったときに迷わないよう、`docs/coding-standards.md`「レンダー中に ref を読み書きしない」に
1行足すかを決める。

**確認済み・対応不要**: T-336〜T-339 の本文は「分け方の型は `docs/design.md` 2章」と**正典を指して
いる**ので、今回の書き換え（`components/` と `domain/` の追加、container/presenter）が自動で効く。
4タスクの本文を書き換える必要は無い。
