import { cleanup, render } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import {
  DirectLeaf,
  directLeafViewOf,
} from "../../../../../../../src/browser/components/page/conversation/components/main-view/direct-leaf-view.tsx"
import { loadMarkdown } from "../../../../../../../src/browser/features/report/markdown.tsx"
import type { A2uiReportComponent } from "../../../../../../../src/shared/report/a2ui-report-catalog.ts"

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

describe("Svg の部品", () => {
  it("図の根に svg があり、色の目印は列挙した値だけが付く", () => {
    const part = {
      id: "s1",
      component: "Svg",
      title: "架空の図",
      width: 340,
      height: 110,
      shapes: [...SHAPES],
      legend: [],
      fold: "",
      aside: "",
    } satisfies Extract<A2uiReportComponent, { readonly component: "Svg" }>
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
