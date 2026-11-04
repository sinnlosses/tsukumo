import { describe, expect, it } from "vitest"

import { a2uiReportInput } from "../../../../../src/server/report/core/body/a2ui-report-message.ts"
import {
  compareOfLegacyBlock,
  compareOfLegacyComponent,
} from "../../../../../src/server/report/core/body/legacy-before-after.ts"
import { legacyReportComponents } from "../../../../../src/server/report/core/body/legacy-report-component-list.ts"

const FIELDS = {
  title: "架空の前後",
  before: { kind: "image", path: "架空/前.png" },
  after: { kind: "code", language: "ts", source: "const a = 1\n" },
}

const EXPECTED = {
  component: "Compare",
  title: "架空の前後",
  relation: "before-after",
  sides: [
    { heading: "", kind: "image", path: "架空/前.png" },
    { heading: "", kind: "code", language: "ts", source: "const a = 1\n" },
  ],
  fold: "",
  aside: "",
}

describe("旧い BeforeAfter の受け口", () => {
  it("部品は Compare の before-after に組み直し、側の見出しは空になる", () => {
    expect(compareOfLegacyComponent({ id: "ba", component: "BeforeAfter", ...FIELDS })).toEqual({
      id: "ba",
      ...EXPECTED,
    })
  })

  it("塊は compare の塊に組み直し、row の中の塊も同じ", () => {
    const { component: _component, ...fields } = EXPECTED

    expect(compareOfLegacyBlock({ kind: "beforeAfter", ...FIELDS })).toEqual({
      kind: "compare",
      ...fields,
    })
    expect(
      compareOfLegacyBlock({ kind: "row", blocks: [{ kind: "beforeAfter", ...FIELDS }] }),
    ).toMatchObject({ blocks: [{ kind: "compare", relation: "before-after" }] })
  })

  it("旧い形に合わない値と、旧い形でない値はそのまま返す", () => {
    const broken = { id: "ba", component: "BeforeAfter", title: "t", before: { kind: "text" } }
    const other = { id: "p", component: "Paragraph", text: "架空" }

    expect(compareOfLegacyComponent(broken)).toBe(broken)
    expect(compareOfLegacyComponent(other)).toBe(other)
    expect(compareOfLegacyBlock("架空")).toBe("架空")
  })

  it("a2ui の部品の一覧では、節でも図でも Compare に読め、形の合わない旧い部品は落として数える", () => {
    const { components, droppedCount } = a2uiReportInput([
      {
        id: "root",
        component: "Report",
        conclusion: ["架空の結論。"],
        figure: "fig",
        children: ["sec"],
      },
      { id: "sec", component: "Section", heading: "", children: ["ba"] },
      { id: "ba", component: "BeforeAfter", ...FIELDS },
      { id: "fig", component: "BeforeAfter", ...FIELDS },
      { id: "bad", component: "BeforeAfter", title: "t", before: { kind: "text" } },
    ])

    expect(droppedCount).toBe(1)
    expect(components.find((part) => part.id === "ba")).toEqual({ id: "ba", ...EXPECTED })
    expect(components.find((part) => part.id === "fig")).toEqual({ id: "fig", ...EXPECTED })
  })

  it("旧い引数の sections・figure・retrospective.blocks の beforeAfter が Compare の before-after になる", () => {
    const result = legacyReportComponents({
      conclusion: "架空の結論。",
      sections: [
        {
          heading: "",
          blocks: [
            { kind: "beforeAfter", ...FIELDS },
            { kind: "panel", title: "架空の枠", blocks: [{ kind: "beforeAfter", ...FIELDS }] },
          ],
        },
      ],
      figure: { kind: "beforeAfter", ...FIELDS },
      retrospective: { summary: "架空の結果", blocks: [{ kind: "beforeAfter", ...FIELDS }] },
    })
    const compares = (result?.components ?? []).filter((part) => part.component === "Compare")

    expect(result?.unknownBlockCount).toBe(0)
    expect(compares).toHaveLength(4)
    for (const compare of compares) {
      expect(compare).toMatchObject({ relation: "before-after", sides: EXPECTED.sides })
    }
    expect(result?.components.find((part) => part.component === "Report")).toMatchObject({
      figure: "figure",
    })
  })

  it("形の合わない旧い塊は落ちるが、知らない種類には数えない", () => {
    const result = legacyReportComponents({
      conclusion: "架空の結論。",
      sections: [
        {
          heading: "",
          blocks: [
            { kind: "text", text: "架空" },
            { kind: "beforeAfter", title: "t" },
          ],
        },
      ],
    })

    expect(result?.components.filter((part) => part.component === "Compare")).toEqual([])
    expect(result?.unknownBlockCount).toBe(0)
  })
})
