import { describe, expect, it } from "vitest"

import {
  indexFilePaths,
  matchingFilePaths,
  MAX_FILE_SUGGESTIONS,
} from "../../../../../../src/browser/components/page/conversation/domain/file-suggestion-index.ts"

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
  it("パスの途中に含むだけでも候補になる（部分一致）", () => {
    expect(match(PATHS, "composer")).toEqual(["src/browser/features/festival/composer.tsx"])
  })

  it("前方一致と部分一致が両方あるときは、前方一致が先に並ぶ", () => {
    expect(match(["cli.ts", "src/cli.ts"], "cli")).toEqual(["cli.ts", "src/cli.ts"])
  })

  it("大文字小文字は区別しない", () => {
    expect(match(PATHS, "readme")).toEqual(["README.md"])
  })

  it("打った文字列が空（@ だけ）のときは辞書順に出す", () => {
    expect(match(PATHS, "")[0]).toBe("README.md")
  })

  it(`候補は最大 ${String(MAX_FILE_SUGGESTIONS)} 件に絞る`, () => {
    const many = Array.from({ length: 25 }, (_, index) => `src/file-${String(index)}.ts`)

    expect(match(many, "src/")).toHaveLength(MAX_FILE_SUGGESTIONS)
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
    const expected = [...many].sort().slice(0, MAX_FILE_SUGGESTIONS)

    expect(match([...many, "x/a-.ts"], "a-")).toEqual(expected)
  })

  it("前方一致が上限に満たないときは、部分一致で埋める", () => {
    const partial = Array.from({ length: 20 }, (_, index) => `dir/sub-${String(index + 10)}.ts`)
    const result = match(["sub-first.ts", ...partial], "sub")

    expect(result).toHaveLength(MAX_FILE_SUGGESTIONS)
    expect(result[0]).toBe("sub-first.ts")
    expect(result.slice(1)).toEqual([...partial].sort().slice(0, MAX_FILE_SUGGESTIONS - 1))
  })

  it("同じ索引に何度呼んでも結果は変わらない", () => {
    const index = indexFilePaths(PATHS)

    expect(matchingFilePaths(index, "s")).toEqual(matchingFilePaths(index, "s"))
  })
})

describe("indexFilePaths", () => {
  it("入力の配列は書き変えない", () => {
    const input = ["b.ts", "a.ts"]

    indexFilePaths(input)

    expect(input).toEqual(["b.ts", "a.ts"])
  })
})
