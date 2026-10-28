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

type Tone = "info" | "warn" | "ng" | "ask" | "memo"

function pair(tone: Tone, text: string, fold = "") {
  return {
    block: { kind: "note", tone, text, fold, aside: "" } as const,
    part: { id: "n1", component: "Note", tone, text, fold, aside: "" } as const,
  }
}

function both(tone: Tone, text: string, fold = "") {
  const { block, part } = pair(tone, text, fold)
  return { fresh: newLeafHtml(block, part), old: oldLeafHtml(block) }
}

function pausePoints(html: string): number {
  return html.split("report-pause-point").length - 1
}

describe("Note の部品", () => {
  it.each(["info", "warn", "ng", "ask"] as const)("%s が旧い描画と一致する", (tone) => {
    const { fresh, old } = both(tone, "架空の注意 `a.ts` と **太字**")

    expect(fresh).toBe(old)
  })

  it("筆を留める印は warn と ng だけに付く", () => {
    expect(
      (["info", "warn", "ng", "ask"] as const).map((tone) => pausePoints(both(tone, "架空").fresh)),
    ).toEqual([0, 1, 1, 0])
  })

  it("ラベルの字は本物のテキストノードで出る", () => {
    const labels = (["info", "warn", "ng", "ask"] as const).map((tone) => {
      const { block, part } = pair(tone, "架空")
      const view = directLeafViewOf(part)
      const value = {
        captionNumber: { kind: "none" },
        tagTones: {},
        gutterNotes: [],
        mergedIntoPrevious: false,
        children: [],
      } as const
      const { container } = render(
        <div data-report-region="section">
          {view !== undefined && <DirectLeaf part={part} value={value} view={view} />}
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
            value={{
              captionNumber: { kind: "none" },
              tagTones: {},
              gutterNotes: [],
              mergedIntoPrevious: true,
              children: [],
            }}
            view={view}
          />
        )}
      </div>,
    )

    expect(container.querySelector("[data-report-region]")?.children).toHaveLength(0)
  })

  it("字が空の Note は本文を描かず、fold つきでも畳まない", () => {
    const { fresh, old } = both("warn", "  ", "架空の根拠")

    expect(fresh).not.toContain("report-note")
    expect(fresh).toBe(old)
  })

  it("fold つきは details で包む", () => {
    const { fresh, old } = both("info", "架空の注記", "架空の根拠")

    expect(fresh).toContain("<details>")
    expect(fresh).toBe(old)
  })
})
