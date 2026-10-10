# tw 自身を直すタスクでは、作業先の作業ツリーの `task.py` を直に打って確かめると `other-repo.md` に書く（振り返り: GH-526）

- 観点: 黄 情報への手の届き
- 根拠: GH-526 で委譲先が作業先の作業ツリー（`tsukumo-plugins-gh-526`）で `tw verify` を打つと、グローバルの `tw` が本体の main の旧スクリプトを指すため `MISSING …/tsukumo-plugins/.beads` が返り、直した版は `python3 skills/task-workflow/scripts/task.py verify` を直に打って確かめた（friction log 2行）。`other-repo.md` の「実装の依頼文に足す項目（手順5c）」は作業ツリーで `tw verify` を打つとだけ書いている
- 出し先: tsukumo-plugins の `skills/next-task/other-repo.md`「実装の依頼文に足す項目（手順5c）」に、作業先が tsukumo-plugins で `skills/task-workflow/scripts/` を直すときは作業ツリーの `python3 skills/task-workflow/scripts/task.py <サブコマンド>` で打つ、の1行を足す
