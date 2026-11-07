import { cleanup, render } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import {
  DirectLeaf,
  directLeafViewOf,
} from "../../../../../src/browser/features/report/leaf/direct-leaf-view.tsx"
import { loadMarkdown } from "../../../../../src/browser/features/report/markdown.tsx"
import type { LeafValue } from "../../../../../src/shared/report/report-leaf-value.ts"
import { stubIntersectionObserver } from "../../../../fixture/intersection.ts"

beforeAll(async () => {
  stubIntersectionObserver(false)
  await loadMarkdown()
})

afterEach(() => {
  cleanup()
})

const VALUE: LeafValue = {
  captionNumber: { kind: "figure", ordinal: 1 },
  tagTones: {},
  gutterNotes: [],
  mergedIntoPrevious: false,
}

function drawn(headings: readonly string[]) {
  const part = {
    id: "g1",
    component: "ChartGrid" as const,
    title: "架空の並びの題",
    chartKind: "bar" as const,
    labels: ["架空1", "架空2"],
    panels: headings.map((heading, index) => ({
      heading,
      series: [{ name: "架空系列", values: [index, index + 1] }],
    })),
    fold: "",
    aside: "",
  }
  const view = directLeafViewOf(part)
  return render(
    <div data-report-region="section">
      {view !== undefined && (
        <DirectLeaf part={part} imageSource={{ kind: "none" }} value={VALUE} view={view} />
      )}
    </div>,
  ).container
}

describe("ChartGrid の部品", () => {
  it("図の数だけ、小見出しとその下の図が読む順に並び、並びの題が番号つきで付く", () => {
    const container = drawn(["架空の甲", "架空の乙", "架空の丙"])

    const panels = [...container.querySelectorAll("[data-chart-grid] > figure")]
    expect(panels.map((panel) => panel.querySelector("figcaption")?.textContent)).toEqual([
      "架空の甲",
      "架空の乙",
      "架空の丙",
    ])
    expect(panels.map((panel) => panel.firstElementChild?.tagName)).toEqual([
      "FIGCAPTION",
      "FIGCAPTION",
      "FIGCAPTION",
    ])
    expect(panels.every((panel) => panel.querySelector("canvas") !== null)).toBe(true)
    expect(container.textContent).toContain("架空の並びの題")
  })
})
