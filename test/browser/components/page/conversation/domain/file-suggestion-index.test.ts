import { describe, expect, it } from "vitest"

import {
  indexFilePaths,
  matchingFilePaths,
} from "../../../../../../src/browser/components/page/conversation/domain/file-suggestion-index.ts"

const MAX_SUGGESTIONS = 10

const PATHS = [
  "src/browser/features/festival/composer.tsx",
  "src/browser/features/festival/file-suggestions.tsx",
  "src/cli.ts",
  "README.md",
] as const

function match(paths: readonly string[], term: string): readonly string[] {
  return matchingFilePaths(indexFilePaths(paths), term)
}

describe("matchingFilePaths", () => {
  it("打った文字列が空（@ だけ）のときは辞書順に出す", () => {
    expect(match(PATHS, "")[0]).toBe("README.md")
  })

  it("当たるパスが無ければ空", () => {
    expect(match(PATHS, "見つからない綴り")).toEqual([])
  })

  it("入力が辞書順でなくても、各グループの中は辞書順で、前方一致が先に並ぶ", () => {
    expect(match(["z/ab.ts", "ab-b.ts", "Ab-a.ts", "m/AB.ts", "ab-c.ts"], "ab")).toEqual([
      "Ab-a.ts",
      "ab-b.ts",
      "ab-c.ts",
      "m/AB.ts",
      "z/ab.ts",
    ])
  })

  it("前方一致が上限を超えるときは、辞書順の先頭から上限まで", () => {
    const many = Array.from({ length: 30 }, (_, index) => `a-${String(99 - index)}.ts`)
    const expected = [...many].sort().slice(0, MAX_SUGGESTIONS)

    expect(match([...many, "x/a-.ts"], "a-")).toEqual(expected)
  })

  it("前方一致が上限に満たないときは、部分一致で埋める", () => {
    const partial = Array.from({ length: 20 }, (_, index) => `dir/sub-${String(index + 10)}.ts`)
    const result = match(["sub-first.ts", ...partial], "sub")

    expect(result).toHaveLength(MAX_SUGGESTIONS)
    expect(result[0]).toBe("sub-first.ts")
    expect(result.slice(1)).toEqual([...partial].sort().slice(0, MAX_SUGGESTIONS - 1))
  })
})
