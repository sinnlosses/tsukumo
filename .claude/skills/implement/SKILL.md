---
name: implement
description: "spec（仕様）やチケットに基づいて作業を実装する。"
disable-model-invocation: true
---

ユーザーが示した spec またはチケットに書かれた作業を実装する。このリポジトリでは
`docs/requirements.md` と `develop/tasks.json` の各タスク本文が spec にあたる。

可能な箇所では、事前に合意したシーム（seam）で `/tdd` を使う。

チェックコマンド（`CLAUDE.md`「よく使うコマンド」）をこまめに実行し、単体のテストファイルも
こまめに実行し、最後に一度、テストスイート全体を実行する。

完了したら `/code-review` を使って作業をレビューする。

作業を現在のブランチにコミットする（`CLAUDE.md`「Git運用」のとおり、通常は `main`）。
