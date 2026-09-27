# 捨てるリポジトリを作る前に、消す権限があるかを確かめる（振り返り: T-812）

- 札: 赤 道具（1回目）
- 根拠: T-812 の委譲先は実測のために `gh repo create --private` で `sinnlosses/tsukumo-bd-sync-probe-1790517328` を作ったが、`gh` のトークンに `delete_repo` スコープが無く、`gh repo delete` が HTTP 403 で拒まれた。捨てるはずのリポジトリが残り、人に削除を頼むことになった
- 出し先: 外部に捨てる資源（リポジトリ・Project）を作る完了条件を書くとき、または委譲の依頼に、「作る前に `gh auth status` のスコープで消せることを確かめ、消せなければ作らずに人にスコープの追加を頼む」を1行足す（`task-workflow` の `WORKFLOW.md` か `next-task` の手順5）
