// 正典の節を「ファイル名＋番号＋「句」」で引いている参照のうち、句が参照先に見つからないもの
// （迷子の参照）と、無いファイルを指す `docs/` 以下の `.md` のパスと、文書が指す `test/`・`scripts/`・`src/` のパスと、
// 文書が指しているソースのシンボルの置き場所が無いものを一覧する。
// `docs/` の節を削る・移したあと、関数や定数を別のファイルへ移したあとに打つ。1件でもあれば終了コード1。
//
// 拾う形・照合の強さは `findSectionReferences` と `findSymbolReferences` に書いてある。
// 同じものを0件に保つ検査は `pnpm run check` にあるので、ここは一覧を見るための入口。

import process from "node:process"

import { REPOSITORY_ROOT } from "../shared/repository-root.ts"
import {
  collectMissingFileReferences,
  collectMissingSourcePathReferences,
  collectStrayReferences,
  collectStraySymbolReferences,
} from "./lib/repository-reference.ts"
import { formatMissingFileReference, formatStrayReference } from "./section-reference.ts"
import { formatStraySymbolReference } from "./symbol-reference.ts"

const strays = [
  ...collectStrayReferences(REPOSITORY_ROOT).map(formatStrayReference),
  ...collectMissingFileReferences(REPOSITORY_ROOT).map(formatMissingFileReference),
  ...collectMissingSourcePathReferences(REPOSITORY_ROOT).map(formatMissingFileReference),
  ...collectStraySymbolReferences(REPOSITORY_ROOT).map(formatStraySymbolReference),
]
for (const stray of strays) {
  process.stdout.write(`${stray}\n`)
}
process.stdout.write(`迷子の参照: ${strays.length}件\n`)
process.exit(strays.length === 0 ? 0 : 1)
