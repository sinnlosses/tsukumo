import { matchesGlob } from "node:path"

import { describe, expect, it } from "vitest"

import { fileCountOf } from "../../../../src/server/architecture-map/core/map-file-count.ts"

const FILES = ["src/ui/a.ts", "src/ui/deep/b.ts", "src/view/c.ts", "README.md", "package.json"]

describe("fileCountOf", () => {
  it("再帰の glob とファイル名の glob に当たる数を数える", () => {
    expect(fileCountOf(["src/ui/**"], FILES, matchesGlob)).toBe(2)
    expect(fileCountOf(["src/view/*"], FILES, matchesGlob)).toBe(1)
    expect(fileCountOf(["*.md"], FILES, matchesGlob)).toBe(1)
  })

  it("2つの glob に当たる同じファイルは1回に数える", () => {
    expect(fileCountOf(["src/ui/**", "src/ui/a.ts"], FILES, matchesGlob)).toBe(2)
  })

  it("glob が空なら 0", () => {
    expect(fileCountOf([], FILES, matchesGlob)).toBe(0)
  })
})
