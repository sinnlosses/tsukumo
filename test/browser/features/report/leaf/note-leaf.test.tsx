import { cleanup, render } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import {
  DirectLeaf,
  directLeafViewOf,
} from "../../../../../src/browser/features/report/leaf/direct-leaf-view.tsx"
import { loadMarkdown } from "../../../../../src/browser/features/report/markdown.tsx"
import { renderDirectLeaf } from "../../../../fixture/direct-leaf-compare.tsx"

beforeAll(async () => {
  await loadMarkdown()
})

afterEach(() => {
  cleanup()
})

type Tone = "info" | "warn" | "ng" | "ask" | "memo"

function pair(tone: Tone, text: string) {
  return {
    block: { kind: "note", tone, text, fold: "", aside: "" } as const,
    part: { id: "n1", component: "Note", tone, text, fold: "", aside: "" } as const,
  }
}

describe("Note の部品", () => {
  it("ラベルの字は本物のテキストノードで出る", () => {
    const labels = (["info", "warn", "ng", "ask"] as const).map((tone) => {
      const { block, part } = pair(tone, "架空")
      const view = directLeafViewOf(part)
      const value = {
        captionNumber: { kind: "none" },
        tagTones: {},
        gutterNotes: [],
        mergedIntoPrevious: false,
      } as const
      const { container } = render(
        <div data-report-region="section">
          {view !== undefined && (
            <DirectLeaf part={part} value={value} imageSource={{ kind: "none" }} view={view} />
          )}
        </div>,
      )
      const text = container.querySelector("[data-report-region] > div")?.firstChild?.textContent
      cleanup()
      expect(block.kind).toBe("note")
      return text
    })

    expect(labels).toEqual(["情報", "注意", "異常", "疑問"])
  })

  it("memo は何も描かない", () => {
    const { part } = pair("memo", "架空の覚え書き")
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
              mergedIntoPrevious: true,
            }}
            view={view}
          />
        )}
      </div>,
    )

    expect(container.querySelector("[data-report-region]")?.children).toHaveLength(0)
  })

  it("字が空の Note は本文を描かず、fold つきでも畳まない", () => {
    const { container } = renderDirectLeaf({
      id: "n1",
      component: "Note",
      tone: "warn",
      text: "  ",
      fold: "架空の根拠",
      aside: "",
    })

    expect(container.querySelector("details")).toBeNull()
    expect(container.textContent?.trim()).toBe("")
  })
})
