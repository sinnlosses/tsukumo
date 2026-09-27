# 未対応の指示メモ（ここに書くと次のセッションが `/plan-tasks` でタスク化する。エージェントのドラフトは `develop/draft/` に1件1ファイル。正典: `task-workflow` の `WORKFLOW.md`）

## ユーザーから

### タスクIDを GitHub の Issue 番号にし、GitHub と Beads を双方向に同期する（2026-09-27）

- いまは `T-xxx`（Beads では `t-xxx`）と GitHub の `#n` が別の番号で、GitHub 側で書いた変更は `--push-only` のため捨てられる。見る場所が2つあるのに書けるのが片方だけで、どちらを見ればよいか迷う
- 決めたこと: **GitHub の Issue 番号をタスクIDにする。** 同期は `bd github sync` の双方向（既定の形）にし、GitHub で書いた登録・編集・状態の変更も Beads に入るようにする。錠（`bd update --claim`）は今のまま Beads
- 解くべき論点（タスク化のときに決める）:
  - 表記: コミットの件名・`task` の入出力で `#5` と書くか別の形か。過去の `T-001`〜`T-811`（git の履歴・`docs/history/`）と見分けが付くこと
  - 採番: 登録は先に Issue を作って番号を得る流れになる（採番の錠と `last-id` は要らなくなるか）。GitHub で人が立てた Issue を `difficulty`・`loopable` の付いた着手できるタスクにする手順（今の `task adopt`）
  - 未完了の50件の付け替え（Beads の `external_ref` に Issue の URL がある）
  - 衝突の解き方（`--prefer-newer` / `--prefer-github` / `--prefer-local`）。双方向の `sync` は試していないので、捨てたリポジトリで実測してから決める
  - 着手中の T-763（tsukumo のタスク板と成果を Beads から読む）がタスクIDの形に依存する
- 直す先: claude-skills の `task-workflow`（`WORKFLOW.md`「Beads 方式」・`scripts/`）と追随するスキル、tsukumo の `CLAUDE.md`・`docs/workflow.md`
