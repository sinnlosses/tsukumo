# 未対応の指示メモ（ここに書くと次のセッションが `/plan-tasks` でタスク化する。エージェントのドラフトは `develop/draft/` に1件1ファイル。正典: `task-workflow` の `WORKFLOW.md`）

## ユーザーから

- プロジェクトの設定（`.tsukumo/project.json`）を無くし、Beads でタスクを持つことを前提にする。外すのは3つ: `tasks.runPrompt`（「tsukumo に頼む」の文面は既定の「タスク {id} を進めて（bd show {id} で読める）。」に固定する。どのスキルを呼ぶかはスキル側の責務）・`tasks: "off"`（タスクの節は `.beads` の有無だけで出し分ける）・`tasks.mainBranch`（マージ先や PR に留めるかはワークフローの責務で、tsukumo が設定に持つ理由は成果の数え先だけ）。設定画面（`project-settings-dialog.tsx`）と読み書きの口・要件・設計文書も合わせて消す。GH-480（設定が無くても `.beads` があれば「タスクにする」を受け付ける）は設定の判定ごと消えるので、このタスクに吸収する。解くべき論点: 成果で何を数えるか。いまはコミットを数える枝の履歴（設定の主ブランチ、無ければ `HEAD`）と Beads の閉じた課題（`closed_at`）の2つで、暦のマスは枝が読めればコミット、読めなければ閉じた課題を数える（`src/server/achievement/adapter/main-history.ts`）。終えたタスクは Beads の履歴に残っているので、閉じた課題だけで数えて枝を読まない案、枝を `origin/HEAD` から決める案などを比べて決める
- （claude-skills）「tsukumo に頼む」の既定の文面「タスク {id} を進めて（bd show {id} で読める）。」で `/next-task` が呼ばれるように、`next-task` の description を整える。tsukumo の文面から `/next-task` を外すため、呼ぶかどうかはスキルの description だけで決まる
