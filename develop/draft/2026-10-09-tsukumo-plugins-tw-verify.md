# tsukumo-plugins でも `tw verify` が検証を打って控えを残すようにする（振り返り: GH-515）

- 観点: 黄 機械の検査
- 根拠: GH-515 の作業先 tsukumo-plugins では `tw verify` と `tw verify-check` が `MISSING`（終了コード6）を返し、委譲先は `./check.sh` を手で打ち、最後の段の返却の関門も作業先の検証を求めずに通った。受け入れでもメインが `./check.sh` を2回打ち直した。tsukumo-plugins 向けの未着手の札（GH-464・GH-481・GH-485・GH-486・GH-494）も同じ道を通る
- 出し先: tsukumo-plugins に `tw` の設定（検証コマンド `./check.sh`）を置き、台帳の無いリポジトリでも `tw verify` が控えを残せるようにするタスク（tsukumo-plugins）
