# `pnpm exec vitest` が作業ツリーの根に残す `.vitest/` を `.gitignore` に入れ、計画の前の計測で `tw edit` が `WORK_BEFORE_PLAN` に拒まれないようにする（振り返り: GH-429）

- 札: 赤 道具（28回目）
- 根: vitest-dir-blocks-plan
- 根拠: GH-429 で委譲先が計画を書く前に `pnpm exec vitest run <2ファイル> --reporter=json --outputFile=…` で所要を測ったところ、作業ツリーの根に未追跡の `.vitest/` ができ、続く `tw edit --section 'やること'` が `WORK_BEFORE_PLAN` で拒まれた（委譲先の friction log。消して打ち直したら通った）。`.gitignore` に `.vitest` の行は無く、「計画の前に測る」タスク（テストの所要を縮める系）では毎回同じ所で止まる
- 出し先: タスク1件。`.vitest/` ができる条件を確かめ、`.gitignore` に足す（できないようにする設定があればそちら）
