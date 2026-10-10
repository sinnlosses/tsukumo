# tsukumo-plugins に .tw/config.toml（verify = ./check.sh）を置き、作業先で tw verify の控えを効かせる（振り返り: GH-499）

- 観点: 黄 道具の経済
- 根拠: GH-499 で作業先の `tw verify` が6段とも `MISSING` を返し、関門は作業先の検証を求めずに通した。受け入れでメインが `./check.sh --full` を打ち直した（1回 330〜487秒の呼び出しが3つ）
- 出し先: tsukumo-plugins に `.tw/config.toml` を置くタスク（`.beads` が要るか、置くと tsukumo-plugins がタスク運用の対象として扱われるかを確かめてから）
