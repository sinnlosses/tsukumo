// zod がオブジェクトのスキーマを速くするために `Function` でコードを組むのを止める。
// ページの CSP は `'unsafe-eval'` を許さないので、組めるかを試すだけで違反が1件出る。
// zod はスキーマを作るときにこの設定を読むので、どのスキーマよりも先に評価されるよう、入口が最初に import する。

import { z } from "zod"

z.config({ jitless: true })
