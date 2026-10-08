# tw verify が主ブランチを取り込んだあと、未初期化の submodule があれば全段を走らせる前に止める（振り返り: GH-504）

- 観点: 赤 機械の検査
- 根拠: GH-504 の `tw verify` が GH-498 の submodule 取り込みを FOLDED したあと全段を流し、`test/cli.test.ts` の2件が `vendor/tsukumo-plugins` 未初期化で落ちて人に預けた（`.tw/local/task-verify.failed-20261008T141946580941Z.log`）
- 出し先: tsukumo-plugins の `tw verify`（取り込みのあと `git submodule status` に `-` の行があれば、検証コマンドを打たずに理由つきで止める）
