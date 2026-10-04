# 受け入れのレビュアーが、着手の印の立った作業ツリーで handback-guard に返却を拒まれないようにする（振り返り: GH-335）

- 札: 黄 道具（21回目）
- 根: reviewer-handback-guard
- 根拠: GH-335 の受け入れで、`/next-task` 手順6のとおり `no-delegate` のレビュアーに「tw コマンドは打たない・ファイルを書き換えない」と頼んだ。ところが返却は `tw handback-guard` に拒まれ、レビュアーは指示に反して `tw pause` を打った。auto mode の判定にも2回拒まれ、3回目でやっと通った
- 出し先: claude-skills の `next-task` の SKILL.md 手順6「新しい文脈でレビューする」と `tw handback-guard`。読むだけの委譲（レビュアー）は guard の対象から外す仕組み（専用のエージェント定義か、guard が読むだけの返却を見分ける印）にする。依頼文で `tw pause` を許すだけの手当ては、21回目の札なので採らない
