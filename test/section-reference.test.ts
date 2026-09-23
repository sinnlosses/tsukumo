import { describe, expect, it } from "bun:test"
import { fileURLToPath } from "node:url"

import { collectStrayReferences } from "../scripts/lib/repository-reference.ts"
import { formatStrayReference } from "../scripts/section-reference.ts"

// 正典の節を「ファイル名＋番号＋「句」」で引いている参照が、参照先に残っているかを0件に保つ。
// `docs/` の節を削る・移したときに、引かれていた句が消えたことをここで知る（拾う形と照合の
// 強さは `scripts/section-reference.ts` の冒頭）。一覧を見るだけなら
// `bun run scripts/find-stray-reference.ts`。

const REPOSITORY_ROOT = fileURLToPath(new URL("..", import.meta.url))

describe("節の参照", () => {
  it("引いている句はすべて参照先のファイルに残っている", () => {
    expect(collectStrayReferences(REPOSITORY_ROOT).map(formatStrayReference)).toEqual([])
  })
})
