import { cleanup } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import { loadMarkdown } from "../../../../../../../src/browser/components/page/conversation/components/markdown/markdown.tsx"
import { newLeafHtml, oldLeafHtml } from "../../../../../../fixture/direct-leaf-compare.tsx"

beforeAll(async () => {
  await loadMarkdown()
})

afterEach(() => {
  cleanup()
})

const ROWS = [
  { name: "架空の受付", start: "14:00", end: "14:12", extra: [], lane: "" },
  {
    name: "架空の実装",
    start: "14:12",
    end: "14:30",
    extra: ["14:40", "14:50"],
    lane: "架空の役A",
  },
  { name: "架空の確認", start: "14:30", end: "", extra: [], lane: "架空の役B" },
  { name: "架空の検証", start: "14:50", end: "15:00", extra: [], lane: "架空の役B" },
]

const EVENTS = [{ at: "14:35", label: "架空の割り込み" }]

function pair(rows: typeof ROWS, events: typeof EVENTS, emphasis: readonly string[], fold = "") {
  const fields = { title: "架空の時間", rows, events, emphasis: [...emphasis] }
  return {
    block: { kind: "timeline", ...fields, fold, aside: "" } as const,
    part: { id: "tl", component: "Timeline", ...fields, fold, aside: "" } as const,
  }
}

describe("Timeline の部品", () => {
  it.each([
    ["レーン・延び・一点・出来事・注目", ROWS, EVENTS, ["架空の実装"]],
    ["出来事なし・注目なし", ROWS, [], []],
    ["レーンなし", ROWS.slice(0, 1), [], []],
  ] as const)("%s が旧い描画と一致する", (_, rows, events, emphasis) => {
    const { block, part } = pair([...rows], [...events], emphasis)

    expect(newLeafHtml(block, part)).toBe(oldLeafHtml(block))
  })

  it("畳みがあれば題の包みごと details で包んで旧い描画と一致する", () => {
    const { block, part } = pair(ROWS, EVENTS, [], "架空の畳み")

    expect(newLeafHtml(block, part)).toBe(oldLeafHtml(block))
  })

  it("帯の位置と幅は % の style で出る", () => {
    const { block, part } = pair(ROWS, EVENTS, [])

    expect(newLeafHtml(block, part)).toMatch(/margin-left: [\d.]+%/)
    expect(newLeafHtml(block, part)).toMatch(/width: [\d.]+%/)
  })
})
