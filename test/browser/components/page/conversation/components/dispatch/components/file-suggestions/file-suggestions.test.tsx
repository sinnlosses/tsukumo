import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import {
  FileSuggestions,
  filePathQuery,
  matchingFilePaths,
  MAX_FILE_SUGGESTIONS,
} from "../../../../../../../../../src/browser/components/page/conversation/components/dispatch/components/file-suggestions/file-suggestions.tsx"
import { typedElement } from "../../../../../../../../typed-element.ts"

// フィクスチャはすべて手で書いた架空のパス（docs/coding-standards.md「会話内容の扱い」）。
const PATHS = [
  "src/browser/features/festival/composer.tsx",
  "src/browser/features/festival/file-suggestions.tsx",
  "src/cli.ts",
  "README.md",
] as const

afterEach(() => {
  cleanup()
})

describe("filePathQuery", () => {
  it("行頭の @ は合図（@ の位置と打った文字列を返す）", () => {
    expect(filePathQuery("@src/ui", 7)).toEqual({ start: 0, end: 7, term: "src/ui" })
  })

  it("空白の直後の @ も合図（前に書いた文には触らない範囲を返す）", () => {
    expect(filePathQuery("これを見て @src/ui", 13)).toEqual({ start: 6, end: 13, term: "src/ui" })
  })

  it("@ だけでも合図（打った文字列は空）", () => {
    expect(filePathQuery("@", 1)).toEqual({ start: 0, end: 1, term: "" })
  })

  it("語中の @ は合図にしない（メールアドレスのような書き方）", () => {
    expect(filePathQuery("someone@example", 15)).toBeUndefined()
  })

  it("@ の後ろに空白が入ったら合図は終わり", () => {
    expect(filePathQuery("@src/ui みたいな", 12)).toBeUndefined()
  })

  it("@ が無ければ合図ではない", () => {
    expect(filePathQuery("架空の依頼", 5)).toBeUndefined()
  })

  it("キャレットより後ろの @ は見ない", () => {
    expect(filePathQuery("架空の依頼 @src", 5)).toBeUndefined()
  })
})

describe("matchingFilePaths", () => {
  it("前方一致を先に、続けて部分一致を出す", () => {
    expect(matchingFilePaths(PATHS, "src/browser/fe")).toEqual([
      "src/browser/features/festival/composer.tsx",
      "src/browser/features/festival/file-suggestions.tsx",
    ])
  })

  it("パスの途中に含むだけでも候補になる（部分一致）", () => {
    expect(matchingFilePaths(PATHS, "composer")).toEqual([
      "src/browser/features/festival/composer.tsx",
    ])
  })

  it("前方一致と部分一致が両方あるときは、前方一致が先に並ぶ", () => {
    expect(matchingFilePaths(["cli.ts", "src/cli.ts"], "cli")).toEqual(["cli.ts", "src/cli.ts"])
  })

  it("大文字小文字は区別しない", () => {
    expect(matchingFilePaths(PATHS, "readme")).toEqual(["README.md"])
  })

  it("打った文字列が空（@ だけ）のときは辞書順に出す", () => {
    expect(matchingFilePaths(PATHS, "")[0]).toBe("README.md")
  })

  it(`候補は最大 ${String(MAX_FILE_SUGGESTIONS)} 件に絞る`, () => {
    const many = Array.from({ length: 25 }, (_, index) => `src/file-${String(index)}.ts`)

    expect(matchingFilePaths(many, "src/")).toHaveLength(MAX_FILE_SUGGESTIONS)
  })

  it("当たるパスが無ければ空", () => {
    expect(matchingFilePaths(PATHS, "見つからない綴り")).toEqual([])
  })
})

describe("FileSuggestions", () => {
  it("候補が無いときは何も描かない", () => {
    render(<FileSuggestions matches={[]} selectedIndex={0} onSelect={() => {}} />)

    expect(screen.queryAllByRole("listitem")).toHaveLength(0)
  })

  it("選んでいる1件に印が付き、押すと位置を返す", () => {
    const selected: number[] = []
    render(
      <FileSuggestions
        matches={["src/cli.ts", "README.md"]}
        selectedIndex={1}
        onSelect={(index) => selected.push(index)}
      />,
    )

    const items = screen.getAllByRole("listitem")
    expect(items.map((item) => item.textContent)).toEqual(["src/cli.ts", "README.md"])
    expect(items[1]?.className).toContain("is-selected")

    fireEvent.mouseDown(typedElement(items[0], HTMLElement, "1件目の候補"))
    expect(selected).toEqual([0])
  })
})
