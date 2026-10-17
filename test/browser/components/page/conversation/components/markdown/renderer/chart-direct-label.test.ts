import { describe, expect, it } from "vitest"

import { spreadLabels } from "../../../../../../../../src/browser/components/page/conversation/components/markdown/renderer/chart-direct-label.ts"

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
