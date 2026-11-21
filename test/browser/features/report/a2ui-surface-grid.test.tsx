import { cleanup, render } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import { loadMarkdown } from "../../../../src/browser/features/report/markdown.tsx"
import { Report } from "../../../../src/browser/features/report/report.tsx"
import { regionsOfParts } from "../../../fixture/report-region.ts"

beforeAll(async () => {
  await loadMarkdown()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const NO_CLASS_NAMES = { className: "", revealClassName: "", blockClassName: "" }

const GRID_PARTS = [
  { id: "root", component: "Report", conclusion: ["架空の結論。"], children: ["s1"] },
  { id: "s1", component: "Section", heading: "架空の格子", children: ["g1"] },
  { id: "g1", component: "Grid", children: ["n1", "n2", "n3", "n4"] },
  ...["n1", "n2", "n3", "n4"].map((id) => ({
    id,
    component: "Paragraph",
    text: `架空の${id}。`,
  })),
]

/** 格子の幅を決めて描き、格子の要素を返す。 */
function renderGrid(width: number): HTMLElement {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(width)
  const { container } = render(
    <Report reveal={false} turnId={1} {...NO_CLASS_NAMES} body={regionsOfParts(GRID_PARTS)} />,
  )
  const grid = container.querySelector<HTMLElement>("[data-part-grid]")
  if (grid === null) throw new Error("格子が描かれていない")
  return grid
}

const columnsOf = (grid: HTMLElement) => grid.style.getPropertyValue("--report-grid-columns")

describe("Grid の描画", () => {
  it("子ごとにセルを1つ置き、子は節の中で格子の中に並ぶ", () => {
    const grid = renderGrid(2000)

    expect([...grid.children].map((cell) => cell.textContent)).toEqual([
      "架空のn1。",
      "架空のn2。",
      "架空のn3。",
      "架空のn4。",
    ])
  })

  it("広い器では子が横に並び、狭い器では1列に折り返す", () => {
    expect(columnsOf(renderGrid(2000))).toBe("4")
    cleanup()
    expect(columnsOf(renderGrid(200))).toBe("1")
  })
})
