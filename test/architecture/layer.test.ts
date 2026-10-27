import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { withoutComments } from "./comment-line.ts"
import { layerOf } from "./feature-graph.ts"
import { importSpecifiers, listSourceFiles, SRC_ROOT } from "./source-file.ts"

// 層の辺は `.dependency-cruiser.cjs` が見る。ここは import の辺でない層の制約を `vite` の `parseSync` の構文木と
// node:fs で落とす。

describe("shared の制約", () => {
  it("shared は document/window/localStorage に触らない", () => {
    const offenders = listSourceFiles(SRC_ROOT)
      .filter((relPath) => layerOf(relPath) === "shared")
      .filter((relPath) => {
        const code = withoutComments(readFileSync(`${SRC_ROOT}/${relPath}`, "utf8"))
        return /\b(document|window|localStorage)\b/.test(code)
      })

    expect(offenders).toEqual([])
  })
})

describe("import の拾い方", () => {
  it("構文エラーのある本文は throw する", () => {
    expect(() => importSpecifiers("const = (")).toThrow("source.ts を読めない")
  })
})

// 経路名のリテラルは shared にだけ書く。両側（core と browser）が見る値は import で共有し、
// 文字列リテラルとして再掲しない（`src/shared/view-server/session-socket.ts` が代表例）。
describe("経路名のリテラル", () => {
  it('"/ws" "/character/" "/vendor/" を文字列リテラルで書くのは shared/ だけ', () => {
    const pathLiteralPatterns = [/["']\/ws["']/, /["']\/character\/["']/, /["']\/vendor\/["']/]
    const offenders = listSourceFiles(SRC_ROOT)
      .filter((relPath) => !relPath.startsWith("shared/"))
      .filter((relPath) => {
        const content = readFileSync(`${SRC_ROOT}/${relPath}`, "utf8")
        return pathLiteralPatterns.some((pattern) => pattern.test(content))
      })

    expect(offenders).toEqual([])
  })
})
