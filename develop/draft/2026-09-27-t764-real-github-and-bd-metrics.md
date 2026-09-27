# T-764 の完了条件に、本物の GitHub・bd の設定で確かめていない3点を足す（振り返り: T-762）

- 根拠: T-762 は偽の `gh`・`bd github sync` でしか試していない。(1) actor（作業ツリー名）が Issue の assignee に送られて弾かれないか、(2) `gh project item-edit` と Project の JSON の形が偽物と合っているか（形は記憶から作った）、(3) 自己テストで `bd init --stealth` を並列に回した時間帯に `~/.config/bd/config.yaml` の `metrics.disabled` が `false` に変わっていた（戻し済み。`bd init` を1本ずつ打つことは WORKFLOW.md に書いた）
- 出し先: T-764 の `## 完了条件`（移したあと `bd github sync --push-only` で Issue 1件と Status 欄が期待どおりになること、`bd init` のあと `bd metrics` が OFF のままであることを確かめる）
