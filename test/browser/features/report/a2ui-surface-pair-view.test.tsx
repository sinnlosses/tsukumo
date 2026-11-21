import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import { loadMarkdown } from "../../../../src/browser/features/report/markdown.tsx"
import { Report } from "../../../../src/browser/features/report/report.tsx"
import { regionsOfParts } from "../../../fixture/report-region.ts"

beforeAll(async () => {
  await loadMarkdown()
})

afterEach(() => {
  cleanup()
})

const NO_CLASS_NAMES = { className: "", revealClassName: "", blockClassName: "" }

const side = (heading: string, point: string) => ({ kind: "points", heading, points: [point] })

const pairPart = (id: string, relation: string, title: string, left: string, right: string) => ({
  id,
  component: "Compare",
  title,
  relation,
  sides: [side("今", left), side("採ったあと", right)],
  fold: "",
  aside: "",
})

function renderReport(components: readonly unknown[]) {
  return render(
    <Report reveal={false} turnId={1} {...NO_CLASS_NAMES} body={regionsOfParts(components)} />,
  )
}

const ROOT = {
  id: "root",
  component: "Report",
  conclusion: ["架空の結論。"],
  children: ["s1"],
}

describe("紙の見せ方の切り替え", () => {
  it("対が2つあっても切り替えは最初の対に1つだけ出て、押すと全部の対が片側になる", () => {
    const { container } = renderReport([
      ROOT,
      { id: "s1", component: "Section", heading: "架空の節", children: ["a", "b"] },
      pairPart("a", "before-after", "架空の一つ目", "左A", "右A"),
      pairPart("b", "before-after", "架空の二つ目", "左B", "右B"),
    ])

    expect(screen.getAllByRole("group", { name: "見せ方" })).toHaveLength(1)
    expect(container.textContent).toContain("左B")

    fireEvent.click(screen.getByRole("button", { name: "採ったあとだけ" }))

    expect(
      screen.getByRole("button", { name: "採ったあとだけ" }).getAttribute("aria-pressed"),
    ).toBe("true")
    expect(container.textContent).toContain("右A")
    expect(container.textContent).toContain("右B")
    expect(container.textContent).not.toContain("左A")
    expect(container.textContent).not.toContain("左B")

    fireEvent.click(screen.getByRole("button", { name: "並べる" }))

    expect(container.textContent).toContain("左A")
    expect(container.textContent).toContain("左B")
  })

  it("側の見出しが対ごとに違うと字は「後だけ」「前だけ」のままで、押しボタンは Tab で届く button", () => {
    renderReport([
      ROOT,
      { id: "s1", component: "Section", heading: "架空の節", children: ["a", "b"] },
      pairPart("a", "before-after", "架空の一つ目", "左A", "右A"),
      {
        ...pairPart("b", "before-after", "架空の二つ目", "左B", "右B"),
        sides: [side("別の前", "左B"), side("別の後", "右B")],
      },
    ])

    const button = screen.getByRole("button", { name: "後だけ" })
    expect(screen.getByRole("button", { name: "前だけ" })).toBeTruthy()
    expect(button.tagName).toBe("BUTTON")
    expect(button.tabIndex).toBeGreaterThanOrEqual(0)
  })

  it("versus の対だけの紙には切り替えが出ない", () => {
    renderReport([
      ROOT,
      { id: "s1", component: "Section", heading: "架空の節", children: ["a"] },
      pairPart("a", "versus", "架空の対等", "左A", "右A"),
    ])

    expect(screen.queryByRole("group", { name: "見せ方" })).toBeNull()
  })
})
