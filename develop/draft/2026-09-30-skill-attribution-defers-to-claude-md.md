# スキルの「attribution はセッションの指示に従う」を、利用者の CLAUDE.md を先に見る文面に直す（振り返り: GH-136）

- 札: 黄 正典の不備（4回目）
- 根拠: GH-136 で commit-msg フックが `Co-Authored-By: Claude …` を拒むようになった。一方で `~/.claude/skills/next-task/SKILL.md` 手順7は「末尾はセッションの attribution の指示に従う」、`~/.claude/skills/task-workflow/WORKFLOW.md` は「末尾の attribution はセッションの指示に従う」のままで、スキルに従うとフックに拒まれる。委譲先も申し送りでこの2か所を挙げた
- 出し先: claude-skills の正典そのものを書き換える（`skills/next-task/SKILL.md` 手順7と `skills/task-workflow/WORKFLOW.md` の該当の文を「利用者の CLAUDE.md に署名の定めがあればそれに従い、無ければセッションの attribution の指示に従う」に）。claude-skills の枝は別の作業ツリーで切る
