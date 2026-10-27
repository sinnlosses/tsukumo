import { describe, expect, it } from "vitest"

import { gaugeLayoutOf } from "../../../../../../../../src/browser/components/page/conversation/components/markdown/renderer/gauge-layout.ts"

const bullet = (rows: { value: number; target: number; bands: number[] }[]) =>
  gaugeLayoutOf({
    kind: "bullet",
    title: "架空の題",
    unit: "分",
    rows: rows.map((row, index) => ({
      label: `行${String(index)}`,
      value: row.value,
      target: row.target,
      bands: row.bands.map((upTo) => ({ upTo })),
    })),
  })

describe("gaugeLayoutOf", () => {
  it("値が区間の外でも軸が広がり、印は軸の内に収まる", () => {
    const layout = bullet([{ value: 15, target: 10, bands: [10] }])
    if (layout.kind !== "bullet") throw new Error("bullet のはず")
    expect(layout.axis).toEqual({ min: 0, max: 15 })
    const [row] = layout.rows
    expect(row?.valueAt).toBeCloseTo(layout.maxAt)
    expect(row?.bands[0]?.to).toBeLessThan(layout.maxAt)
  })

  it("区間が 1 つなら先頭の濃さで、軸の下端から上端までを塗る", () => {
    const layout = bullet([{ value: 4, target: 10, bands: [10] }])
    if (layout.kind !== "bullet") throw new Error("bullet のはず")
    expect(layout.rows[0]?.bands).toMatchObject([
      { from: layout.minAt, to: layout.rows[0]?.targetAt, shade: 0 },
    ])
  })

  it("区間が複数なら濃いほうから薄いほうへ並ぶ", () => {
    const layout = bullet([{ value: 4, target: 10, bands: [10, 4, 7] }])
    if (layout.kind !== "bullet") throw new Error("bullet のはず")
    expect(layout.rows[0]?.bands.map((band) => band.shade)).toEqual([0, 0.5, 1])
  })

  it("長い項目名は上限で切って「…」にし、短い名前はそのまま", () => {
    const layout = gaugeLayoutOf({
      kind: "bullet",
      title: "架空の題",
      unit: "分",
      rows: [
        {
          label: "丙の名前を少し長くした項目をさらに長くしたもの",
          value: 3,
          target: 8,
          bands: [{ upTo: 8 }],
        },
        { label: "甲", value: 3, target: 8, bands: [{ upTo: 8 }] },
      ],
    })
    if (layout.kind !== "bullet") throw new Error("bullet のはず")
    const [long, short] = layout.rows.map((row) => row.label)
    expect([...(long ?? "")]).toHaveLength(18)
    expect(long?.endsWith("…")).toBe(true)
    expect(short).toBe("甲")
  })

  it("行をまたいで軸を共有する", () => {
    const layout = bullet([
      { value: 3, target: 5, bands: [5] },
      { value: 30, target: 20, bands: [20] },
    ])
    if (layout.kind !== "bullet") throw new Error("bullet のはず")
    expect(layout.axis.max).toBe(30)
  })

  it("数直線は最小と最大だけを札にし、1 点でも軸が潰れない", () => {
    const layout = gaugeLayoutOf({
      kind: "numberLine",
      title: "題",
      unit: "分",
      values: [4, 31, 12],
    })
    if (layout.kind !== "numberLine") throw new Error("numberLine のはず")
    expect(layout.points.map((point) => point.labelled)).toEqual([true, true, false])
    expect(layout.points.map((point) => point.anchor)).toEqual(["start", "end", "middle"])
    const single = gaugeLayoutOf({ kind: "numberLine", title: "題", unit: "分", values: [5] })
    if (single.kind !== "numberLine") throw new Error("numberLine のはず")
    expect(single.axis.max).toBeGreaterThan(single.axis.min)
  })
})
