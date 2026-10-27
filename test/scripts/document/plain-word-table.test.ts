import { readFileSync } from "node:fs"

import { describe, expect, test } from "vitest"

import {
  PLAIN_WORD_TABLE_END,
  PLAIN_WORD_TABLE_START,
  plainWordRows,
  readPlainWordRows,
  rewritePlainWordTable,
} from "../../../scripts/document/plain-word-table.ts"
import { REPOSITORY_ROOT } from "../../../scripts/shared/repository-root.ts"
import { PLAIN_WORDS } from "../../../src/server/report/core/plain-word.ts"

describe("rewritePlainWordTable", () => {
  test("印に挟まれた範囲を、語から組んだ表に書き直す", () => {
    const text = `前\n${PLAIN_WORD_TABLE_START}\n古い\n${PLAIN_WORD_TABLE_END}\n後\n`

    expect(readPlainWordRows(rewritePlainWordTable(text, PLAIN_WORDS))).toEqual(
      plainWordRows(PLAIN_WORDS),
    )
  })

  test("印が無い文書は変えない", () => {
    expect(rewritePlainWordTable("本文\n", PLAIN_WORDS)).toBe("本文\n")
  })
})

describe("用語集の表", () => {
  test("PLAIN_WORDS から書き直した表と同じ行が書かれている（pnpm run format で直す）", () => {
    const text = readFileSync(`${REPOSITORY_ROOT}/docs/glossary/plain-word.md`, "utf8")

    expect(readPlainWordRows(text)).toEqual(plainWordRows(PLAIN_WORDS))
  })
})
