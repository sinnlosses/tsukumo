import { cleanup, render } from "@testing-library/react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import { ChartTermLinkScope } from "../../../../../src/browser/features/report/leaf/chart-term-link.tsx"
import {
  DirectLeaf,
  directLeafViewOf,
} from "../../../../../src/browser/features/report/leaf/direct-leaf-view.tsx"
import { ParagraphLeaf } from "../../../../../src/browser/features/report/leaf/paragraph-leaf.tsx"
import { loadMarkdown } from "../../../../../src/browser/features/report/markdown.tsx"

beforeAll(async () => {
  await loadMarkdown()
})

afterEach(() => {
  cleanup()
})

describe("Paragraph の部品", () => {
  it("欄の直接の子として p だけを返す", () => {
    const part = {
      id: "p1",
      component: "Paragraph",
      text: "架空の本文。",
      fold: "",
      aside: "",
    } as const
    const view = directLeafViewOf(part)
    const { container } = render(
      <div data-report-region="section">
        {view !== undefined && (
          <DirectLeaf
            part={part}
            imageSource={{ kind: "none" }}
            value={{
              captionNumber: { kind: "none" },
              tagTones: {},
              gutterNotes: [],
              mergedIntoPrevious: false,
            }}
            view={view}
          />
        )}
      </div>,
    )

    expect(
      [...(container.querySelector("[data-report-region]")?.children ?? [])].map(
        (child) => child.tagName,
      ),
    ).toEqual(["P"])
  })

  it("入れ物が無い・図の無い節の入れ物の中では、語を含んでいても同じ HTML で印を足さない", () => {
    const part = {
      id: "p1",
      component: "Paragraph",
      text: "架空1月は多い。",
      fold: "",
      aside: "",
    } as const
    const value = {
      captionNumber: { kind: "none" },
      tagTones: {},
      gutterNotes: [],
      mergedIntoPrevious: false,
    } as const
    const leaf = <ParagraphLeaf part={part} value={value} />

    const alone = renderToStaticMarkup(leaf)
    const scoped = renderToStaticMarkup(<ChartTermLinkScope charts={[]}>{leaf}</ChartTermLinkScope>)

    expect(scoped).toBe(alone)
    expect(alone).not.toContain("data-chart-term")
  })
})
