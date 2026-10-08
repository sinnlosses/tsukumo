# setup-tasks の手順と init.py の引数を揃える（振り返り: GH-497）

- 観点: 黄 道案内
- 根拠: tsukumo-plugins の `skills/setup-tasks/SKILL.md` の手順1は `init.py develop` と打たせるが、`skills/task-workflow/scripts/init.py` は引数を取らず usage で終了コード2を返した。委譲先が一時の Beads プロジェクトを作るときに1回空振りした。claude-skills から写したずれで、tsukumo-plugins を単独で入れた人が最初に踏む
- 出し先: tsukumo-plugins の `skills/setup-tasks/SKILL.md` の手順1を `init.py` の今の呼び方に合わせ、自己検査でスキルの手順が打つ形を落とせるかも見るタスク（tsukumo-plugins）
