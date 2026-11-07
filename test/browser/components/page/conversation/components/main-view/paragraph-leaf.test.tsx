import { cleanup, render } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import {
  DirectLeaf,
  directLeafViewOf,
} from "../../../../../../../src/browser/components/page/conversation/components/main-view/direct-leaf-view.tsx"
import { loadMarkdown } from "../../../../../../../src/browser/features/report/markdown.tsx"

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
})
