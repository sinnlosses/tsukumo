# 未対応の指示メモ（ここに書くと次のセッションが `/plan-tasks` でタスク化する。正典: `task-workflow` の `WORKFLOW.md`）

## ユーザーから

- **振り返りが済んだ `done` / `dropped` のタスクファイルを `develop/task/` から消す**（2026-09-24 決定）。
  1日に70件前後が `done` になり、いまの「アーカイブの段は無い」（`task-workflow` の `WORKFLOW.md`
  「ファイル配置と CLAUDE.md」）のままだと `develop/task/` が際限なく増える。移すのではなく
  `git rm` で消し、本文は git の履歴から読む。ファイルが無い ID を解決済みとみなす規則は既にあるので、
  依存の解決は変えなくてよい
  - 消してよいのは、`done` / `dropped` にしたコミットが `develop/retrospective.md` の
    「最後に振り返ったコミット」に含まれるものだけ（`/retrospect` が読み終える前に消さない）
  - **消すのは `/retrospect` ではない**（あのスキルは `develop/task/` を直接書き換えない約束）。
    `task` のサブコマンド（例: `task prune`）か別の手順にする。どちらにするかはタスク化のときに決める
  - `retrospect/scripts/material.py` の `print_task` は `HEAD:develop/task/T-xxx.md` しか読まないので、
    消したあとは「どこにも無い」になる。ファイルが最後にあったコミットの版を読むように直す
    （`print_task_file_diff` も同じ前提か確かめる）
  - 直す先は共通のスキル（`~/.claude/skills` の実体の `claude-skills` リポジトリ）。枝を切るなら
    本体とは別の作業ツリーで

## エージェントのドラフト
