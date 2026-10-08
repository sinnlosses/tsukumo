# 作業先が別のリポジトリのときの、受け入れ後の作業ツリーと枝の片付けを auto mode で止まらない形にする（振り返り: GH-460）

- 観点: 赤 道具の経済
- 根拠: GH-460 の受け入れで、next-task の other-repo.md「受け入れ（手順6）」どおりに `git merge --ff-only` と `git worktree remove`・`git branch -d` を1つの Bash で打ったら、auto mode の分類器に [Git Destructive] で拒まれた。`merge --ff-only` だけを打ち直すと通ったが、作業ツリー（scratchpad の claude-skills-gh-460）と枝 gh-460 は残り、人に預けた。作業先が別のリポジトリのタスクは毎回この段を踏む
- 出し先: claude-skills の `skills/next-task/other-repo.md`「受け入れ（手順6）」と `tw`。片付け（main へ入ったことを確かめてから作業ツリーと枝を消す）を `tw` の1コマンドにして許可規則で通せるようにするか、片付けを人に預ける段として書くか、のどちらかを決めるタスク
