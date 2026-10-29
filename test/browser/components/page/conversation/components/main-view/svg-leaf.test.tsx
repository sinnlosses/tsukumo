import { cleanup, render } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import {
  DirectLeaf,
  directLeafViewOf,
} from "../../../../../../../src/browser/components/page/conversation/components/main-view/direct-leaf-view.tsx"
import { loadMarkdown } from "../../../../../../../src/browser/components/page/conversation/components/markdown/markdown.tsx"
import { newLeafHtml, oldLeafHtml } from "../../../../../../fixture/direct-leaf-compare.tsx"

beforeAll(async () => {
  await loadMarkdown()
})

afterEach(() => {
  cleanup()
})

const SHAPES = [
  {
    kind: "rect",
    x: 10,
    y: 10,
    width: 120,
    height: 60,
    label: "架空の箱",
    sub: "架空の説明",
    labelAt: "center",
    tone: "a",
    emphasis: true,
  },
  {
    kind: "rect",
    x: 200,
    y: 10,
    width: 120,
    height: 60,
    label: "架空の題",
    sub: "架空の下書き",
    labelAt: "top-left",
    tone: "none",
    emphasis: false,
  },
  {
    kind: "line",
    x1: 130,
    y1: 40,
    x2: 200,
    y2: 40,
    label: "渡す",
    arrow: true,
    dashed: true,
    tone: "b",
  },
  { kind: "text", x: 12, y: 95, text: "架空の注釈" },
] as const

function pair(legend: readonly { tone: "a" | "b"; label: string }[], fold = "") {
  const fields = {
    title: "架空の図",
    width: 340,
    height: 110,
    shapes: [...SHAPES],
    legend: [...legend],
  }
  return {
    block: { kind: "svg", ...fields, fold, aside: "" } as const,
    part: { id: "s1", component: "Svg", ...fields, fold, aside: "" } as const,
  }
}

describe("Svg の部品", () => {
  it.each([
    ["凡例なし", []],
    [
      "凡例あり",
      [
        { tone: "a", label: "架空の甲" },
        { tone: "b", label: "架空の乙" },
      ],
    ],
  ] as const)("%s が旧い描画と一致する", (_, legend) => {
    const { block, part } = pair(legend)

    expect(newLeafHtml(block, part)).toBe(oldLeafHtml(block))
  })

  it("畳みがあれば details で包んで旧い描画と一致する", () => {
    const { block, part } = pair([], "架空の畳み")

    expect(newLeafHtml(block, part)).toBe(oldLeafHtml(block))
  })

  it("図の根に svg があり、色の目印は列挙した値だけが付く", () => {
    const { part } = pair([])
    const view = directLeafViewOf(part)
    if (view === undefined) throw new Error("一覧に Svg が無い")
    const { container } = render(
      <DirectLeaf
        part={part}
        value={{
          captionNumber: { kind: "figure", ordinal: 1 },
          tagTones: {},
          gutterNotes: [],
          mergedIntoPrevious: false,
        }}
        imageSource={{ kind: "none" }}
        view={view}
      />,
    )

    expect(container.querySelector("svg")).not.toBeNull()
    expect(
      [...container.querySelectorAll("[data-tone]")].map((el) => el.getAttribute("data-tone")),
    ).toEqual(["a", "b"])
    expect(container.querySelector("line")?.getAttribute("marker-end")).toBe(
      "url(#report-svg-arrow)",
    )
    expect(container.textContent).toContain("図 1")
  })
})
