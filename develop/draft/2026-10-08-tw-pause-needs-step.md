# 委譲の依頼文の `tw pause` を、段の番号まで含む形で書く（振り返り: GH-469）

- 観点: 黄 道具の経済
- 根拠: GH-469 の段5で、委譲先が依頼文どおり `tw pause GH-469` を打って使い方の誤り（終了コード2）で止まり、`tw pause GH-469 5` と打ち直した。`tw verify GH-469` も同じく引数の誤りで空振りした（GH-468 の段5でも同じ）
- 出し先: claude-skills の next-task SKILL.md 手順5の共通の依頼文と visual-review.md の「目視待ち」の項で、`tw pause T-xxx <段の番号>`・`tw verify`（ID を取らない）と書く
