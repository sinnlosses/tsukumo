import { describe, expect, it } from "vitest"

import { draftPendingOf } from "../../../../src/browser/domain/main-view/a2ui-draft-pending.ts"
import { a2uiPartsById } from "../../../../src/shared/report/a2ui-report-outline.ts"
import { a2uiParts, STAGED_PARTS } from "../../../fixture/a2ui-component.ts"

const pendingOf = (...inputs: readonly unknown[]) =>
  draftPendingOf(a2uiPartsById(a2uiParts(...inputs)))

const ROOT = { id: "root", component: "Report", conclusion: ["架空の結論。"] }
const S1 = { id: "s1", component: "Section", heading: "架空の節一" }
const PARAGRAPH = { component: "Paragraph", text: "架空の段落" }

describe("draftPendingOf", () => {
  it("根がまだ届いていなければ、届いていない部品を数えない", () => {
    expect(draftPendingOf(a2uiPartsById(STAGED_PARTS.slice(1)))).toEqual({ openSections: [] })
  })

  it("全部届いていれば、次に届く見込みの部品は無い", () => {
    expect(draftPendingOf(a2uiPartsById(STAGED_PARTS))).toEqual({ openSections: [] })
  })

  it.each([
    ["根の子がどれも届いていなければ、先頭の根の子", [], "s1"],
    ["節が届いて子が届いていなければ、その節の先頭の子", [{ ...S1, children: ["p1", "p2"] }], "p1"],
    [
      "先頭の子が届けば、次の子",
      [
        { ...S1, children: ["p1", "p2"] },
        { id: "p1", ...PARAGRAPH },
      ],
      "p2",
    ],
    [
      "配置の部品の中の子は、その後ろの兄弟より先",
      [
        { ...S1, children: ["r1", "p2"] },
        { id: "r1", component: "Row", children: ["a", "b"] },
        { id: "a", ...PARAGRAPH },
      ],
      "b",
    ],
    [
      "先頭の節が埋まれば、次の根の子",
      [
        { ...S1, children: ["p1"] },
        { id: "p1", ...PARAGRAPH },
      ],
      "s2",
    ],
  ] as const)("次に届く見込みは紙の順で先頭の穴: %s", (_, arrived, next) => {
    const pending = pendingOf({ ...ROOT, children: ["s1", "s2"] }, ...arrived)

    expect(pending.next).toBe(next)
  })

  it("自分か子孫がまだ届いていない根の子だけを、開いている節に数える", () => {
    const pending = pendingOf(
      { ...ROOT, children: ["s1", "s2", "s3"] },
      { ...S1, children: ["c1"] },
      { id: "c1", component: "Card", child: "deep" },
      { id: "s3", component: "Section", heading: "架空の節三", children: ["p9"] },
      { id: "p9", ...PARAGRAPH },
    )

    expect(pending).toEqual({ next: "deep", openSections: ["s1", "s2"] })
  })

  it("Tabs の子もたどる", () => {
    const pending = pendingOf(
      { ...ROOT, children: ["s1"] },
      { ...S1, children: ["t1"] },
      {
        id: "t1",
        component: "Tabs",
        tabs: [
          { title: "架空のタブ一", child: "x" },
          { title: "架空のタブ二", child: "y" },
        ],
      },
      { id: "x", ...PARAGRAPH },
    )

    expect(pending).toEqual({ next: "y", openSections: ["s1"] })
  })

  it("図と振り返りの参照はたどらない", () => {
    const pending = pendingOf(
      {
        ...ROOT,
        children: ["s1"],
        figure: "f1",
        retrospective: { summary: "架空の振り返り。", blocks: ["rb1"] },
      },
      { ...S1, children: ["p1"] },
      { id: "p1", ...PARAGRAPH },
    )

    expect(pending).toEqual({ openSections: [] })
  })

  it("2か所から名指された部品は、最初の1か所で1回だけ数える", () => {
    const pending = pendingOf(
      { ...ROOT, children: ["s1", "s2"] },
      { ...S1, children: ["shared"] },
      { id: "s2", component: "Section", heading: "架空の節二", children: ["shared"] },
    )

    expect(pending).toEqual({ next: "shared", openSections: ["s1"] })
  })
})
