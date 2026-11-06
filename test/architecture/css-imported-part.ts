// `.module.css` が `@import` で束ねる部品の CSS を引く、CSS の規約のテストの共有部品。

import { readFileSync } from "node:fs"

import { resolveRelativeImport, SRC_ROOT } from "./source-file.ts"

export function importedPartsOf(entry: string): readonly string[] {
  return [...readFileSync(`${SRC_ROOT}/${entry}`, "utf8").matchAll(/@import "(\.[^"]+)"/g)].map(
    ([, part]) => resolveRelativeImport(entry, part ?? ""),
  )
}
