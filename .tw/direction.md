# 未対応の指示メモ（ここに書くと次のセッションが `/plan-tasks` でタスク化する。エージェントのドラフトは `.tw/draft/` に1件1ファイル。正典: `task-workflow` の `WORKFLOW.md`）

## ユーザーから

- （tsukumo-plugins）`/next-task` の受け入れで main が1歩ずつ打っている機械的な並びを、`tw` の束ねたコマンドにする。束ねる候補は「受け入れの準備」（`tw lap … accept`・`tw plan-check`・`tw verify-check`・`review_needed.py`・レビュー前の木の控え）と「完了から送り出しまで」（`tw done`・`tw prune`・`tw ship`）の2つ。根拠: main は1歩ごとに文脈を丸ごと読み直し（直近7日で1歩あたり約16.4万、1ターンあたり7.3歩）、main の道具の呼び出し 7602 回のうち Bash が 5442 回を占める（2026-10-10、`token-usage-diet` の `summarize_usage.py --days 7`）。GH-490 の受け入れでも、上の8つほどをほぼ1回ずつ別の歩で打った。ただし 5442 回には `/next-task` の外の作業も混じっているので、タスクにする前に、`/next-task` の main の Bash のうち `tw` とスキルのスクリプトの並びが何割かを測る
- （tsukumo-plugins）`/next-task` の受け入れ（差分のレビューの指摘の採否・目視の判定・振り返りの材料の値）を、Opus のサブエージェントに出す。main は判定を受け取って `tw done`・送り出しを打つだけにし、差分や撮った画像を main の文脈に入れない。目視の判定も含める（GH-490 では、仕切りの線が途中で切れることと、狭い器で開く口が効かないことを main が目視で止めた。レビュアーが拾ったのは呼び名の取り残しだけだった）。GH-550（main を Sonnet にする）の前提になる
