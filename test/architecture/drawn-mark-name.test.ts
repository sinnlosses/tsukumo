import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import {
  REPORT_DRAWN_MARK_NAMES,
  REPORT_NOTATION_NAMES,
} from "../../src/shared/report/report-notation.ts"
import { listSourceFiles, SRC_ROOT } from "./source-file.ts"

// 読むのは `class="…"` の属性値に直に書いた語だけ。
// 定数に置いて `${…}` で差し込む語や、`${…}` で組む名前は静的に決まらないので見ない。
describe("tsukumo が組む class 名", () => {
  it("src/shared/report/ の class 属性に直に書いた語は、すべて印の名前の一覧に入っている", () => {
    const known = new Set<string>([...REPORT_NOTATION_NAMES, ...REPORT_DRAWN_MARK_NAMES])
    const words = listSourceFiles(SRC_ROOT)
      .filter((relPath) => /^shared\/report\/[^/]+\.ts$/.test(relPath))
      .flatMap((relPath) => literalClassNames(readFileSync(`${SRC_ROOT}/${relPath}`, "utf8")))

    expect(words.length).toBeGreaterThan(0)
    expect([...new Set(words.filter((word) => !known.has(word)))]).toEqual([])
  })
})

function literalClassNames(source: string): readonly string[] {
  return [...source.matchAll(/class="((?:\$\{[^}]*\}|[^"])*)"/g)].flatMap((match) =>
    (match[1] ?? "")
      .replace(/\$\{[^}]*\}/g, "\u0000")
      .split(/\s+/)
      .filter((word) => word !== "" && !word.includes("\u0000")),
  )
}
