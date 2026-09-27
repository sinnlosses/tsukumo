import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import {
  collectMissingFileReferences,
  collectStrayReferences,
} from "../scripts/lib/repository-reference.ts"
import { formatMissingFileReference, formatStrayReference } from "../scripts/section-reference.ts"

// 正典の節を「ファイル名＋番号＋「句」」で引いている参照が、参照先に残っているかを0件に保つ。
// `docs/` の節を削る・移したときに、引かれていた句が消えたことをここで知る（拾う形と照合の
// 強さは `findSectionReferences` に書いてある）。「」の無い素のパスは、指すファイルがあるかを0件に保つ。一覧を見るだけなら
// `node scripts/find-stray-reference.ts`。

const REPOSITORY_ROOT = fileURLToPath(new URL("..", import.meta.url))

describe("節の参照", () => {
  it("引いている句はすべて参照先のファイルに残っている", () => {
    expect(collectStrayReferences(REPOSITORY_ROOT).map(formatStrayReference)).toEqual([])
  })

  it("docs/ 以下の .md を指すパスはすべて実在する", () => {
    expect(collectMissingFileReferences(REPOSITORY_ROOT).map(formatMissingFileReference)).toEqual(
      [],
    )
  })
})
