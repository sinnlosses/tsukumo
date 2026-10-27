import { describe, expect, it } from "vitest"

import { histogramLayoutOf } from "../../../../../../../../src/browser/components/page/conversation/components/markdown/renderer/histogram-layout.ts"

const spec = (bins: [number, number, number][], median: number, min: number, max: number) => ({
  kind: "histogram" as const,
  title: "架空の題",
  unit: "分",
  bins: bins.map(([from, to, count]) => ({ from, to, count })),
  median,
  min,
  max,
})

describe("histogramLayoutOf", () => {
  it("階級が 1 つで幅が 0 でも棒に幅があり、中央値と範囲の字が出る", () => {
    const layout = histogramLayoutOf(spec([[7, 7, 25]], 7, 7, 7))
    expect(layout.bars).toHaveLength(1)
    expect(layout.bars[0]?.width).toBeGreaterThan(0)
    expect(layout.medianText).toBe("中央値 7")
    expect(layout.noteText).toBe("範囲 7〜7 ・ 最多の階級 25 件")
  })

  it("最も高い階級が枠の高さいっぱいになり、棒は軸の内に収まる", () => {
    const layout = histogramLayoutOf(
      spec(
        [
          [0, 5, 2],
          [5, 10, 8],
        ],
        6,
        0,
        10,
      ),
    )
    expect(layout.bars[1]?.top).toBeLessThan(layout.bars[0]?.top ?? 0)
    for (const bar of layout.bars) {
      expect(bar.at).toBeGreaterThanOrEqual(layout.minAt)
      expect(bar.at + bar.width).toBeLessThanOrEqual(layout.maxAt)
    }
    expect(layout.noteText).toBe("範囲 0〜10 ・ 最多の階級 8 件")
  })
})
