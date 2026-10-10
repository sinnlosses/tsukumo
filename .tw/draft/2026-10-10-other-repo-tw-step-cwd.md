# 作業先が別のリポジトリのとき、tw step を打つ作業ツリーを依頼文で名指す（振り返り: GH-548）

- 観点: 黄 道案内
- 根拠: GH-548 で委譲先が plugins 側の作業ツリーで `task.py step GH-548 1` を打ち、`MISSING .../tsukumo-plugins/.beads` で印を立てられず、メインが着手した作業ツリーで代わりに打った（friction log 1件）。依頼文の「`tw step`・`tw pause` は着手した作業ツリーを cwd にして打つ」が、作業先の作業ツリーと取り違えられた
- 出し先: `next-task/other-repo.md` の「実装の依頼文に足す項目（手順5c）」の該当文を、`tw step` は着手した側（Beads のある本体の作業ツリー）で打ち、作業先の作業ツリーでは `tw verify` だけを打つ、と書き分けるタスク（tsukumo-plugins）
