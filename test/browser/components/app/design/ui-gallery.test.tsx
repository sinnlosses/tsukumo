import { readdirSync } from "node:fs"

import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { UiGallery } from "../../../../../src/browser/components/app/design/ui-gallery.tsx"

afterEach(cleanup)

/** 見本帳に並べない `ui/` の部品と、その理由。 */
const EXCLUDED: Readonly<Record<string, string>> = {
  "layout-resizer": "動かす対象（親の配置）が無いと意味を持たない仕切りで、単独では何も見えない",
}

function uiPartDirectories(): readonly string[] {
  return readdirSync(`${process.cwd()}/src/browser/components/ui`, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
}

function drawnParts(container: HTMLElement): readonly string[] {
  return [...container.querySelectorAll("[data-ui-part]")].flatMap((element) =>
    (element.getAttribute("data-ui-part") ?? "").split(/\s+/).filter((name) => name !== ""),
  )
}

describe("ui/ の見本", () => {
  it("ui/ の部品は、除外の一覧に載せたものを除いて全部が見本帳に並ぶ", () => {
    const { container } = render(<UiGallery />)

    const expected = uiPartDirectories().filter((name) => !(name in EXCLUDED))
    expect(drawnParts(container).toSorted()).toEqual(expected.toSorted())
  })

  it("除外は3件までに収める", () => {
    expect(Object.keys(EXCLUDED).length).toBeLessThanOrEqual(3)
  })

  it("除外の一覧に載せた部品は、ui/ に実在する", () => {
    expect(uiPartDirectories()).toEqual(expect.arrayContaining(Object.keys(EXCLUDED)))
  })
})
