# タスク運用：このリポジトリでの上乗せ

**運用の正典は `~/.claude/skills/task-model/` の `WORKFLOW.md`**（複数のプロジェクトで
共通。フィールド定義・`summary` の書き方・`difficulty` の基準・結果の書き方・
コミットメッセージ・ドラフトの課題は、すべてそちらにある）。
プロジェクト固有の値は `.tw/config.toml` が持つ（このリポジトリでは
検証コマンド = `pnpm run check`、整形コマンド = `pnpm run format`、タスクの置き場 = Beads、
トラッカー = GitHub の `sinnlosses/tsukumo` と Project 1）。

ここに残すのは、**共通版が知らないこのリポジトリの事情**だけ。

責務: タスク運用の共通版（`task-model` スキルの `WORKFLOW.md`）に対する、このリポジトリ
固有の上乗せを持つ。
読む時: タスクを書く・受け入れる、作業ツリーを並行させる、tsukumo を起こすとき。
直す時: このリポジトリ固有の運用（`loopable` の判定・`summary` の長さなど）を変えたとき。

## このファイルの読み方

節の本文は子のファイル（`docs/workflow/`）にある。下の目次で子を1つ特定し、その子のファイルを丸ごと読む。

## 目次

この表は `pnpm run format` が子のファイルの責務の行から書き直すので、手で直さない。

| ファイル                              | 説明                                                                                                                       |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `docs/workflow/loop-stages.md`        | 夜間の掃除や自動の振り返りのような新しい `/loop` の流れを入れる順序と、段階を上げる条件を持つ。                            |
| `docs/workflow/loopable.md`           | `loopable` を `"Y"` にしてよい範囲と、tsukumo を起こして確かめるときの作法・hook を持つ。                                  |
| `docs/workflow/reference-material.md` | 指示で参考に示された画像・ディレクトリを、タスクにする時点で残す手順を持つ。                                               |
| `docs/workflow/task-writing.md`       | `plan-tasks` と `next-task` が共通版の手順に加えて守る、このリポジトリ固有の書き方・受け入れ方と、`summary` の長さを持つ。 |
| `docs/workflow/worktree-and-ship.md`  | 作業ツリーの並行、タスクに紐付かない作業の送り出し、実機の Claude Code を動かす計測の作法を持つ。                          |

## シェルでの書き込みの拒否

シェルでの書き込みの拒否は tsukumo の hook（`scripts/hook/bash-guard.ts` の `findWorktreeShellWriteDenial`。記録の hook 名は `deny-sed-in-place`）が持ち主で、`.tw/config.toml` の `shell_write_guard = "project"` により tw は `SHELL_WRITE` を見ない。

## 関連

- 手順そのもの: `next-task` スキルの手順（`tw claim`）と、`task-workflow` スキルの `SKILL.md`「手順」（`tw done` / `tw ship`）。
  **tsukumo 独自の上乗せは無い**（過去の覆しは `docs/history/decision.md` に残してある）
- 運用の正典: `~/.claude/skills/task-model/WORKFLOW.md`
- 過去の判断の経緯: `docs/history/decision.md`。完了タスクは `tw show <ID>`
