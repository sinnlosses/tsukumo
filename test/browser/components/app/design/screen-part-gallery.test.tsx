import { readdirSync } from "node:fs"

import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { SCREEN_PART_EXAMPLES } from "../../../../../src/browser/components/app/design/screen-part-example.tsx"
import { ScreenPartGallery } from "../../../../../src/browser/components/app/design/screen-part-gallery.tsx"

afterEach(cleanup)

/** 見本帳に並べない `presentational-*.tsx` と、その理由。ページの根は部品を組む側で、単独の部品ではない。 */
const EXCLUDED: Readonly<Record<string, string>> = {
  "page/achievement/presentational-achievement.tsx": "ページの根",
  "page/character/presentational-character.tsx": "ページの根",
  "page/token-usage/presentational-token-usage.tsx": "ページの根",
  "page/conversation/presentational-conversation.tsx": "ページの根",
  "page/conversation/components/conversation-layout/presentational-conversation-layout.tsx":
    "ページの根",
}

const MAX_EXCLUDED = 7

function presentationalPaths(): readonly string[] {
  const root = `${process.cwd()}/src/browser/components`
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /^presentational-.*\.tsx$/.test(entry.name))
    .map((entry) => `${entry.parentPath}/${entry.name}`.slice(root.length + 1))
}

describe("画面の部品の見本", () => {
  it("presentational-*.tsx は、除外の一覧に載せたものを除いて全部が見本帳の例に載る", () => {
    const expected = presentationalPaths().filter((path) => !(path in EXCLUDED))
    expect(SCREEN_PART_EXAMPLES.map((example) => example.path).toSorted()).toEqual(
      expected.toSorted(),
    )
  })

  it("除外はページの根の5件に、理由つきで2件足すまでに収める", () => {
    expect(Object.keys(EXCLUDED).length).toBeLessThanOrEqual(MAX_EXCLUDED)
  })

  it("除外の一覧に載せた部品は実在する", () => {
    expect(presentationalPaths()).toEqual(expect.arrayContaining(Object.keys(EXCLUDED)))
  })

  it("各例の見出しに部品のパスが出る", () => {
    const { container } = render(<ScreenPartGallery />)

    const headings = [...container.querySelectorAll("[data-screen-part]")].map((element) =>
      element.getAttribute("data-screen-part"),
    )
    expect(headings.toSorted()).toEqual(
      SCREEN_PART_EXAMPLES.map((example) => example.path).toSorted(),
    )
    for (const example of SCREEN_PART_EXAMPLES) {
      expect(container.textContent).toContain(example.path)
    }
  })
})
