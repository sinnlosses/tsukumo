import { describe, expect, it } from "vitest"

import {
  beforeAfterPairIdsInOrder,
  pairSwitchLabels,
} from "../../../../../src/browser/features/report/domain/pair-view.ts"
import type { A2uiReportComponent } from "../../../../../src/shared/report/a2ui-report-catalog.ts"

type Side = Extract<A2uiReportComponent, { readonly component: "Compare" }>["sides"][number]

const points = (heading: string): Side => ({ kind: "points", heading, points: ["架空の点"] })

const compare = (
  id: string,
  relation: "before-after" | "versus",
  before = "",
  after = "",
): A2uiReportComponent => ({
  id,
  component: "Compare",
  title: "",
  relation,
  sides: [points(before), points(after)],
  fold: "",
  aside: "",
})

const section = (id: string, children: string[]): A2uiReportComponent => ({
  id,
  component: "Section",
  heading: "",
  children,
})

const partsOf = (list: A2uiReportComponent[]) => new Map(list.map((part) => [part.id, part]))

describe("beforeAfterPairIdsInOrder", () => {
  it("versus を飛ばして最初の before-after を返す", () => {
    const parts = partsOf([compare("v", "versus"), compare("b", "before-after")])
    expect(beforeAfterPairIdsInOrder(["v", "b"], parts)).toEqual(["b"])
  })

  it("入れ子の Section を開いて探す", () => {
    const parts = partsOf([
      section("s1", ["s2"]),
      section("s2", ["b"]),
      compare("b", "before-after"),
    ])
    expect(beforeAfterPairIdsInOrder(["s1"], parts)).toEqual(["b"])
  })

  it("渡した順の先頭を優先する（図の欄が先）", () => {
    const parts = partsOf([compare("fig", "before-after"), compare("body", "before-after")])
    expect(beforeAfterPairIdsInOrder(["fig", "body"], parts)).toEqual(["fig", "body"])
  })

  it("対が無ければ空", () => {
    expect(beforeAfterPairIdsInOrder(["v"], partsOf([compare("v", "versus")]))).toEqual([])
  })
})

describe("pairSwitchLabels", () => {
  it("全部の対で側の見出しが同じなら、その語に合わせる", () => {
    const parts = partsOf([
      compare("a", "before-after", " 今 ", "採ったあと"),
      compare("b", "before-after", "今", "採ったあと"),
    ])
    expect(pairSwitchLabels(parts)).toEqual({ after: "採ったあとだけ", before: "今だけ" })
  })

  it("見出しが対ごとに違うと「後だけ」「前だけ」のまま", () => {
    const parts = partsOf([
      compare("a", "before-after", "今", "後A"),
      compare("b", "before-after", "旧", "後B"),
    ])
    expect(pairSwitchLabels(parts)).toEqual({ after: "後だけ", before: "前だけ" })
  })

  it("見出しが空なら「後だけ」「前だけ」", () => {
    expect(pairSwitchLabels(partsOf([compare("a", "before-after")]))).toEqual({
      after: "後だけ",
      before: "前だけ",
    })
  })
})
