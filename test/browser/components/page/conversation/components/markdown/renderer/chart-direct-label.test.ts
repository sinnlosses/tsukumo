import { describe, expect, it } from "vitest"

import {
  arrowPadding,
  spreadLabels,
} from "../../../../../../../../src/browser/components/page/conversation/components/markdown/renderer/chart-direct-label.ts"

describe("spreadLabels", () => {
  it("近い2つは gap だけ離し、遠いものは動かさない", () => {
    expect(spreadLabels([10, 12, 100], 14)).toEqual([10, 24, 100])
  })

  it("入力と同じ並びで返し、上から順に押し下げる", () => {
    expect(spreadLabels([50, 10, 12], 14)).toEqual([50, 10, 24])
  })

  it("3つ以上が詰まっていれば連鎖して離す", () => {
    expect(spreadLabels([0, 1, 2], 10)).toEqual([0, 10, 20])
  })
})

describe("arrowPadding", () => {
  it("両側に、矢じり・すき間・数字の幅のはみ出しを取り、左はその外に項目名の列を足す", () => {
    expect(arrowPadding(60, 30)).toEqual({ left: 60 + 12 + 45, right: 45, overhang: 45 })
  })

  it("数字が広いほどはみ出しが増え、項目名の列は数字の幅に食われない", () => {
    expect(arrowPadding(60, 40).overhang).toBeGreaterThan(arrowPadding(60, 30).overhang)
    expect(arrowPadding(60, 40).left - arrowPadding(60, 40).overhang).toBe(60 + 12)
  })
})
