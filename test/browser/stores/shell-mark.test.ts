import { afterEach, describe, expect, it } from "vitest"

import { applyShellMark } from "../../../src/browser/stores/shell-mark.ts"

afterEach(() => {
  localStorage.clear()
})

function markFor(search: string): string | undefined {
  const root = document.createElement("html")
  applyShellMark(search, root)
  return root.dataset["shell"]
}

describe("器の切り替えの印", () => {
  it("何も渡されていなければ旧い器", () => {
    expect(markFor("")).toBe("classic")
  })

  it("URL の shell=stage で新しい器になり、引数を外して読み直しても保たれる", () => {
    expect(markFor("?shell=stage")).toBe("stage")
    expect(markFor("")).toBe("stage")
    expect(markFor("?shell=classic")).toBe("classic")
    expect(markFor("")).toBe("classic")
  })

  it("知らない値の引数は印を変えない", () => {
    markFor("?shell=stage")
    expect(markFor("?shell=paper")).toBe("stage")
  })
})
