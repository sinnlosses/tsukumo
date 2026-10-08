# tsukumo が tsukumo-plugins をコミット単位で固定して取り込み、セッションに載せる

- 根拠: 2026-10-08 の利用者の決定。tsukumo の中では同梱の next-task を使い、素の Claude Code では利用者の next-task を使う。中身は当面同じ。いまの `buildQuerySeedOptions` は、リポジトリの中の `plugin/` だけをセッションに渡している
- 出し先: `tsukumo-plugins` をコミット単位で固定して取り込む（git submodule か pnpm の git 依存。どちらも新しい外部コマンドは増えない）。取り込んだプラグインを `buildQuerySeedOptions` からセッションに渡す。セッションには `~/.claude/skills` の同名のスキルも並ぶので、`next-task` と `tsukumo-plugins` 側のスキルが両方見えることを確かめる（中身が同じあいだは実害が無いので、優先の決めは中身を分けるときまで先送りしてよい）。docs の置き場・組み立て・依存の節を合わせる
- 先に済むもの: 2026-10-08-tsukumo-plugins-repo
