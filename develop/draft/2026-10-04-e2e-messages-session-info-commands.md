# E2E の messages の期待値から session-info のコマンド一覧を外し、フィクスチャのコマンドを1つ足すたびに全シナリオを撮り直さなくて済むようにする（振り返り: GH-283）

- 札: 黄 構造の重さ（1回目）
- 根拠: GH-283 で `test/fixture/fake-session.json` の `slashCommands` に `next-task` を1つ足しただけで、`test/e2e/expected/*.messages.json` 105 件を撮り直した。105 件とも差分は `session-info` の一覧に1行が増えたことだけで、各シナリオが確かめたいこととは関係がない
- 出し先: タスク。E2E の messages の期待値を書き出す箇所で `session-info` の `slashCommands`・`commandDescriptions` を件数か印に畳む（またはコマンド一覧を確かめる1シナリオにだけ残す）。次にフィクスチャのコマンドを変えたとき、撮り直しが 105 ファイルから 1 ファイル以下になる
