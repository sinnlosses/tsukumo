# claude-skills から移したワークフローを外し、~/.claude/skills を tsukumo-plugins へ向ける

- 根拠: 2026-10-08 の利用者の決定。claude-skills の task-workflow はファイル方式をやめてよい。いま `~/.claude/skills/` の各スキルは claude-skills を symlink で指していて、`~/.claude/agents/` の2つも同じ形。`~/.claude/skills/token-usage-diet` だけは symlink ではない写しで、tsukumo の `plugin/skills/token-usage-diet` と中身がずれている（SKILL.md と `summarize_usage.py` が違い、`summarize_subagent_steps.py` が片方に無い。2026-10-08 に diff で確かめた）
- 出し先: claude-skills から、`tsukumo-plugins` へ移した一式を消す（claude-skills の枝は本体とは別の作業ツリーで切る）。claude-skills が `.tw/` で回している自分のタスクは Beads へ移す。`~/.claude/skills/` と `~/.claude/agents/` の該当する symlink は `tsukumo-plugins` を指すように張り替えるか、マーケットプレイスから入れる形に切り替える。`~/.claude/skills/token-usage-diet` の写しは、行き先に合わせて置き換える。どれもグローバルの設定の書き換えなので、着手する前に利用者の承認を得る
- 先に済むもの: 2026-10-08-tsukumo-plugins-repo
