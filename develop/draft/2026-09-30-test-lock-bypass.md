# `pnpm run test`・`test:e2e` を直に打っても、作業ツリーをまたぐ錠を通るようにする（振り返り: GH-122）

- 札: 赤 道具（5回目）
- 根拠: GH-122 の測定中、tsukumo-2・tsukumo-task が `pnpm run test`・`test:e2e` を直に打って vitest を走らせ続け、1分平均の負荷が 22〜41 から下がらなかった。錠を取るのは `scripts/check.ts` の重い段だけなので、直に打つと錠をすり抜けて check と重なる。利用者にほかの作業ツリーを止めてもらうまで測定を始められず、`maxWorkers` を 30%＋30% に下げても、すり抜けた分が重なれば手元は重いままになる
- 出し先: 錠を取る処理を vitest の `globalSetup`（`vitest.config.ts`・`vitest.e2e.config.ts`）へ移し、どの入口から走らせても同じ錠を通るようにするタスク（`scripts/check.ts` が単体と E2E を並べて走らせる形は変えず、check が取った錠の中で走るときは取り直さない）
