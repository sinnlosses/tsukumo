// 正典の節を「ファイル名＋番号＋「句」」で引いている参照のうち、句が参照先に見つからないもの
// （迷子の参照）を一覧する。`docs/` の節を削る・移したあとに打つ。1件でもあれば終了コード1。
//
// 拾う形・照合の強さは `scripts/section-reference.ts` の冒頭。`bun run check` では
// `test/section-reference.test.ts` が同じものを0件に保つので、ここは一覧を見るための入口。

import process from "node:process"
import { fileURLToPath } from "node:url"

import { collectStrayReferences } from "./lib/repository-reference.ts"
import { formatStrayReference } from "./section-reference.ts"

const REPOSITORY_ROOT = fileURLToPath(new URL("..", import.meta.url))

const strays = collectStrayReferences(REPOSITORY_ROOT)
for (const stray of strays) {
  process.stdout.write(`${formatStrayReference(stray)}\n`)
}
process.stdout.write(`迷子の参照: ${strays.length}件\n`)
process.exit(strays.length === 0 ? 0 : 1)
