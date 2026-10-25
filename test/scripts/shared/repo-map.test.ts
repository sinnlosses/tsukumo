import { describe, expect, test } from "vitest"

import { buildRepoMap } from "../../../scripts/shared/repo-map.ts"

describe("buildRepoMap", () => {
  const sources = new Map([
    ["src/shared/b.ts", "export const beta = 1\nexport type Gamma = string\n"],
    ["src/shared/a.ts", "export function alpha() {}\nexport default 1\n"],
    ["src/main.ts", "const local = 1\n"],
  ])

  test("ファイルごとの export の名前と、実在する鏡のテストを載せる", () => {
    const map = buildRepoMap(sources, new Set(["test/shared/a.test.ts"]))

    expect(map).toContain("- a.ts — alpha, default — test/shared/a.test.ts")
    expect(map).toContain("- b.ts — beta, Gamma — テスト無し")
  })

  test("export の無いファイルも載せる", () => {
    expect(buildRepoMap(sources, new Set())).toContain("- main.ts — export なし — テスト無し")
  })

  test("ディレクトリごとにパス順で並べ、入力の並びに依らず同じ出力になる", () => {
    const reversed = new Map([...sources].toReversed())
    const map = buildRepoMap(sources, new Set())

    expect(buildRepoMap(reversed, new Set())).toBe(map)
    expect(map.indexOf("### src\n")).toBeLessThan(map.indexOf("### src/shared\n"))
  })

  test("読めないファイルは、読めないと載せる", () => {
    const map = buildRepoMap(new Map([["src/x.ts", "export const = ("]]), new Set())

    expect(map).toContain("- x.ts — 読めない — テスト無し")
  })
})
