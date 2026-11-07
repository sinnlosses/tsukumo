import { cleanup } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import { loadMarkdown } from "../../../../../src/browser/features/report/markdown.tsx"
import { newLeafHtml } from "../../../../fixture/direct-leaf-compare.tsx"

beforeAll(async () => {
  await loadMarkdown()
})

afterEach(() => {
  cleanup()
})

const NO_UNCERTAIN = { until: "", label: "" }

const NO_AFTER: string[] = []

const ROWS = [
  {
    name: "架空の受付",
    start: "14:00",
    end: "14:12",
    extra: [],
    uncertain: NO_UNCERTAIN,
    after: NO_AFTER,
    lane: "",
  },
  {
    name: "架空の実装",
    start: "14:12",
    end: "14:30",
    extra: ["14:40", "14:50"],
    uncertain: NO_UNCERTAIN,
    after: NO_AFTER,
    lane: "架空の役A",
  },
  {
    name: "架空の確認",
    start: "14:30",
    end: "",
    extra: [],
    uncertain: NO_UNCERTAIN,
    after: NO_AFTER,
    lane: "架空の役B",
  },
  {
    name: "架空の検証",
    start: "14:50",
    end: "15:00",
    extra: [],
    uncertain: NO_UNCERTAIN,
    after: NO_AFTER,
    lane: "架空の役B",
  },
]

const EVENTS = [{ at: "14:35", label: "架空の割り込み" }]

function pair(rows: typeof ROWS, events: typeof EVENTS) {
  const fields = { title: "架空の時間", rows, events, emphasis: [] }
  return {
    block: { kind: "timeline", ...fields, fold: "", aside: "" } as const,
    part: { id: "tl", component: "Timeline", ...fields, fold: "", aside: "" } as const,
  }
}

describe("Timeline の部品", () => {
  it("帯の位置と幅は % の style で出る", () => {
    const { block, part } = pair(ROWS, EVENTS)

    expect(newLeafHtml(block, part)).toMatch(/margin-left: [\d.]+%/)
    expect(newLeafHtml(block, part)).toMatch(/width: [\d.]+%/)
  })

  it("待つ行ごとに矢印の svg を1つ描き、止まりうる区間の一言を棒の下に出す", () => {
    const rows = [
      ...ROWS,
      {
        name: "架空の公開",
        start: "15:00",
        end: "15:10",
        extra: [],
        uncertain: { until: "15:20", label: "架空の承認待ち" },
        after: ["架空の実装", "架空の検証"],
        lane: "架空の役B",
      },
    ]
    const { block, part } = pair(rows, EVENTS)
    const html = newLeafHtml(block, part)

    expect(html.match(/<svg[^>]*report-timeline-arrow"/g)).toHaveLength(2)
    expect(html).toMatch(/report-timeline-uncertain-label[^>]*>架空の承認待ち</)
  })
})
