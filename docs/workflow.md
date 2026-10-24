# タスク運用：このリポジトリでの上乗せ

**運用の正典は `~/.claude/skills/task-model/` の `WORKFLOW.md`**（複数のプロジェクトで
共通。フィールド定義・`summary` の書き方・`difficulty` の基準・結果の書き方・
コミットメッセージ・ドラフトの課題は、すべてそちらにある）。
プロジェクト固有の値は `.tw/config.toml` が持つ（このリポジトリでは
検証コマンド = `pnpm run check`、整形コマンド = `pnpm run format`、タスクの置き場 = Beads、
トラッカー = GitHub の `sinnlosses/tsukumo` と Project 1）。

**2026-09-12 に、共通版と重複していた節をこの文書から落とした**（正典が二重になり、片方だけ
直して気づかない事故を避けるため）。ここに残すのは、**共通版が知らないこのリポジトリの事情**だけ。

責務: タスク運用の共通版（`task-model` スキルの `WORKFLOW.md`）に対する、このリポジトリ
固有の上乗せを持つ。
読む時: タスクを書く・受け入れる、作業ツリーを並行させる、tsukumo を起こすとき。
直す時: このリポジトリ固有の運用（`loopable` の判定・`summary` の長さなど）を変えたとき。

## このファイルの読み方

節の本文は子のファイル（`docs/workflow/`）にある。下の索引で節を1つ特定し、その子のファイルだけを開いて読む。

## 節の索引

この表は `pnpm run format` が子のファイルの題と見出しから書き直すので、手で直さない。

| ファイル                              | 題                                                 | 節                                                                                                                                             |
| ------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/workflow/loopable.md`           | タスク運用: loopable の判定                        | `loopable` の判定（2026-09-15 決定）                                                                                                           |
| `docs/workflow/reference-material.md` | タスク運用: 参考に示された画像・ディレクトリを残す | 参考に示された画像・ディレクトリを残す（2026-09-23 決定）                                                                                      |
| `docs/workflow/task-writing.md`       | タスク運用: タスクを書く・受け入れる               | タスクを書くとき・受け入れるとき / `summary` の長さ                                                                                            |
| `docs/workflow/worktree-and-ship.md`  | タスク運用: 作業ツリーと送り出し                   | 作業ツリーを並行させるとき / タスクに紐付かない作業を main へ送る / コミット前のファイルの大きさの検査 / 実機の Claude Code を動かす計測のとき |

## シェルでの書き込みの拒否

シェルでの書き込みの拒否は tsukumo の hook（`scripts/hook/bash-guard.ts` の `findWorktreeShellWriteDenial`。記録の hook 名は `deny-sed-in-place`）が持ち主で、`.tw/config.toml` の `shell_write_guard = "project"` により tw は `SHELL_WRITE` を見ない。

## 関連

- 手順そのもの: `next-task` スキルの手順（`tw claim`）と、`task-workflow` スキルの `SKILL.md`「手順」（`tw done` / `tw ship`）。
  **tsukumo 独自の上乗せは無い**——2026-09-23 に「`doing` をコミットする」「アーカイブも `main` へ
  単独で送る」という覆しを入れていたが、理由（作業ツリーを分けるのが orca になり、作業ツリーの
  中だけの着手の印が別の作業ツリーから見えない）は、2026-09-24 の切り替えで共通版が
  「着手の印は全作業ツリーが共有する `.git` の台帳に置く」形になったことで共通版の側が解消した。
  当時の記述は `docs/history/decision.md`「workflow.md「`doing` をコミットする」「アーカイブも
  `main` へ単独で送る」」に残してある
- 運用の正典: `~/.claude/skills/task-model/WORKFLOW.md`
- 過去の判断の経緯: `docs/history/decision.md`。完了タスクは `tw show <ID>`（`docs/history/tasks.md`・`progress.md` は凍結済み）
