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

本文は4つの子のファイルに分けてある。節の見出しはここに残し、中身は移し先を引く。

- `docs/workflow/task-writing.md`: タスクを書くとき・受け入れるとき、`summary` の長さ
- `docs/workflow/loopable.md`: `loopable` の判定、tsukumo を起こすときの作法と hook
- `docs/workflow/reference-material.md`: 参考に示された画像・ディレクトリの残し方
- `docs/workflow/worktree-and-ship.md`: 作業ツリーの並行、`main` への送り出し、コミット前のファイルの大きさの検査、実機の Claude Code を動かす計測

## 節の索引

| 節                                                           | 中身                                |
| ------------------------------------------------------------ | ----------------------------------- |
| ## タスクを書くとき・受け入れるとき                          | 書き方・受け入れ方                  |
| ## 参考に示された画像・ディレクトリを残す（2026-09-23 決定） | 参考に示されたものの残し方          |
| ## `loopable` の判定（2026-09-15 決定）                      | `loopable` の判定、起こすときの作法 |
| ## `summary` の長さ                                          | 全角40文字以内                      |
| ## 作業ツリーを並行させるとき                                | ポートとホームの分け方              |
| ## タスクに紐付かない作業を main へ送る                      | `pnpm run ship`                     |
| ## コミット前のファイルの大きさの検査                        | 20,000 バイトの上限                 |
| ## 実機の Claude Code を動かす計測のとき                     | 応答の確かめ方                      |
| ## 関連                                                      | 手順・正典・記録の置き場            |

## タスクを書くとき・受け入れるとき

本文は `docs/workflow/task-writing.md`「タスクを書くとき・受け入れるとき」。

## 参考に示された画像・ディレクトリを残す（2026-09-23 決定）

本文は `docs/workflow/reference-material.md`「参考に示された画像・ディレクトリを残す」。

## `loopable` の判定（2026-09-15 決定）

本文は `docs/workflow/loopable.md`「`loopable` の判定」。

### 起こすときの作法

本文は `docs/workflow/loopable.md`「起こすときの作法」。

## `summary` の長さ

本文は `docs/workflow/task-writing.md`「`summary` の長さ」。

## 作業ツリーを並行させるとき

本文は `docs/workflow/worktree-and-ship.md`「作業ツリーを並行させるとき」。

シェルでの書き込みの拒否は tsukumo の hook（`scripts/hook/bash-guard.ts` の `findWorktreeShellWriteDenial`。記録の hook 名は `deny-sed-in-place`）が持ち主で、`.tw/config.toml` の `shell_write_guard = "project"` により tw は `SHELL_WRITE` を見ない。

## タスクに紐付かない作業を main へ送る

本文は `docs/workflow/worktree-and-ship.md`「タスクに紐付かない作業を main へ送る」。

## コミット前のファイルの大きさの検査

本文は `docs/workflow/worktree-and-ship.md`「コミット前のファイルの大きさの検査」。

## 実機の Claude Code を動かす計測のとき

本文は `docs/workflow/worktree-and-ship.md`「実機の Claude Code を動かす計測のとき」。

## 関連

- 手順そのもの: `next-task` スキルの手順（`tw claim`）と、`task-workflow` スキルの `SKILL.md`「手順」（`tw done` / `tw ship`）。
  **tsukumo 独自の上乗せは無い**——2026-09-23 に「`doing` をコミットする」「アーカイブも `main` へ
  単独で送る」という覆しを入れていたが、理由（作業ツリーを分けるのが orca になり、作業ツリーの
  中だけの着手の印が別の作業ツリーから見えない）は、2026-09-24 の切り替えで共通版が
  「着手の印は全作業ツリーが共有する `.git` の台帳に置く」形になったことで共通版の側が解消した。
  当時の記述は `docs/history/decision.md`「workflow.md「`doing` をコミットする」「アーカイブも
  `main` へ単独で送る」」に残してある
- 運用の正典: `~/.claude/skills/task-model/WORKFLOW.md`
- 完了タスク・過去セッションの記録: `docs/history/tasks.md` /
  `docs/history/progress.md`
