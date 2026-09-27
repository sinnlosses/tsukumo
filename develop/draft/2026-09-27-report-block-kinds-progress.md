# `REPORT_BLOCK_KINDS` に `progress` を足し、塊の一覧を形から導いて抜けを防ぐ（作業中: T-804）

- 根拠: `src/shared/report/report-block.ts` の `REPORT_BLOCK_KINDS` に `progress` が無い（`satisfies readonly ReportBlock["kind"][]` は部分集合しか検査しない）。そのため描けた `progress` の塊が `parseReportSections` の `unknownBlockCount` に数えられ、`~/.tsukumo/report-usage/2026-09-27.jsonl` の112件のうち3件（`progress` を含む3件すべて）が「知らない種類で落とした塊1つ」と記録されている。`scripts/report-block-usage.ts` の表も `progress` を既知の種類として持たないので、0件になった週に行が出ず外す基準が当たらない
- 出し先: `REPORT_BLOCK_KINDS` を `reportBlockSchema` の選択肢から導く（か、全種類を持つことを型で検査する）タスク。`unknownBlockCount` の数え方を直すテストを足す。difficulty は sonnet の見込み（`shared` の1ファイルと集計のスクリプト。プロトコルは変わらない）
