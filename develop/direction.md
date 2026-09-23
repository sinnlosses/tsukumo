# 未対応の指示メモ（ここに書くと次のセッションが `/plan-tasks` でタスク化する。正典: `task-workflow` の `WORKFLOW.md`）

## ユーザーから

## エージェントのドラフト

- **押せる部品の書体の継承を `theme.css` の1か所に寄せ、各 CSS の `font: inherit` をやめる**（振り返り: T-385, T-386, T-396, T-397, T-398, T-399, T-412）
  - 根拠: `e59e0be`..`e2a24c5` で `font: inherit` を足す行が7タスク・9行あった（いまは12ファイルに43か所）。`theme.css` には `button` / `select` / `input` / `textarea` の書体の既定が無いので、部品を1つ足すたびにこの1行を手で書いている。T-396 ではモックの値に写す途中でこの1行が消え、送信ボタンの書体が UA 既定の Arial に落ちた（受け入れで気づいて戻した。evidence の「受け入れで3点直した」の(2)）
  - 出し先: タスク。`src/browser/styles/theme.css` に `button, input, select, textarea { font: inherit; }` を置き、各 `*.module.css` の `font: inherit` / `font-family: inherit` のうち、それだけの意味のものを消す（`font: inherit` のあとに `font-size` を上書きしている形は、上書きだけ残す）。`docs/design.md` 13.3 に「書体は theme.css が継がせる」と1行
- **並行の作業ツリーではアーカイブのコミットをすぐ `main` へ送り、`--ff-only` が落ちたら自分のアーカイブを捨てて取り込み直してからやり直す**（振り返り: 2026-09-23 の `/plan-tasks`。コミットは残っていない）
  - 根拠: `/plan-tasks` の手順5でトリガーに当たり、枝の上で完了6件をアーカイブした。その間に別の作業ツリーが `4fd2169` で同じ範囲（に T-404 を足した7件）を `main` へアーカイブしていて、`git merge main` が `develop/tasks.json` と `docs/history/tasks.md` の両方で衝突した。`progress.md` はマージドライバが畳むが、この2ファイルには無い。アーカイブは `archive.py` がやり直せる機械的な操作なので、衝突を手で解くより捨ててやり直すほうが安い（実際そうした）。起きたのはこの1回だけだが、トリガーは `main` の完了件数で決まるので、5つの作業ツリーが同じ時点で一斉に当たる形になっている
  - 出し先: `docs/workflow.md`（共通の `WORKFLOW.md` のアーカイブ手順に対する、このリポジトリでの上乗せ）。「アーカイブは単独のコミットにし、`doing` と同じく `--ff-only` で `main` へ送る。落ちたら `git reset` でそのコミットを捨て、`git merge main` してトリガーを判定し直す」
