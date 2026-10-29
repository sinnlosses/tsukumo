import { describe, expect, it } from "vitest"

import { reportImagePaths } from "../../../../src/server/report/core/report-image-shelf.ts"
import { reportViolations } from "../../../../src/server/report/core/report-violation-check.ts"
import {
  parseLegacyBody,
  parseLegacySections,
} from "../../../../src/server/session-driver/core/legacy-report-section-list.ts"
import { drawnLeaves, reportOutline } from "../../../../src/shared/report/report-outline.ts"
import { draft } from "../../../fixture/report-draft-block.ts"
import { reportOfSections } from "../../../fixture/report-event.ts"

const text = (value: string): unknown => ({ kind: "text", text: value })
const row = (blocks: readonly unknown[]): unknown => ({ kind: "row", blocks })
const panel = (blocks: readonly unknown[]): unknown => ({
  kind: "panel",
  title: "架空の枠",
  blocks,
})

const sectionsOf = (blocks: readonly unknown[]) => [{ heading: "", blocks }]

describe("parseLegacyBody", () => {
  it("body を節1つに読み、空白だけの本文は節を持たない", () => {
    expect(parseLegacyBody(" \n\n ")).toEqual({
      sections: [],
      unknownBlockCount: 0,
      brokenFenceCount: 0,
    })
    expect(parseLegacyBody("\n\n    架空の字下げ\n\n架空の本文。  \n")).toEqual({
      sections: [
        {
          heading: "",
          blocks: [
            { kind: "markdown", markdown: "    架空の字下げ\n\n架空の本文。", fold: "", aside: "" },
          ],
        },
      ],
      unknownBlockCount: 0,
      brokenFenceCount: 0,
    })
  })

  it("body の壊れた型つきフェンスを数える", () => {
    expect(parseLegacyBody("```code\nx\n```").brokenFenceCount).toBe(1)
  })
})

describe("parseLegacySections", () => {
  const known = { kind: "text", text: "架空の一。", fold: "", aside: "" }

  it("配列でない値と、塊が残らない節は無いものとする", () => {
    expect(parseLegacySections(undefined)).toEqual({ sections: [], unknownBlockCount: 0 })
    expect(parseLegacySections([{ heading: "", blocks: [{ kind: "text" }] }])).toEqual({
      sections: [],
      unknownBlockCount: 0,
    })
  })

  it("見出しを省くと空文字になり、旧い shapeTag は読み捨てる", () => {
    expect(parseLegacySections([{ shapeTag: "cause", blocks: [known] }]).sections).toEqual([
      { heading: "", blocks: [known] },
    ])
  })

  it("知らない種類の塊は落とし、unknownBlockCount で数える", () => {
    const parsed = parseLegacySections([{ heading: "", blocks: [{ kind: "架空の種類" }, known] }])

    expect(parsed.unknownBlockCount).toBe(1)
    expect(parsed.sections).toEqual([{ heading: "", blocks: [known] }])
  })

  it("外した種類（progress・dimension）の旧い記録は知らない種類の塊として落とし、残りの塊は読み戻す", () => {
    const progress = {
      kind: "progress",
      steps: ["架空の一", "架空の二"],
      current: 1,
      fold: "",
      aside: "",
    }
    const dimension = {
      kind: "dimension",
      title: "",
      parts: [{ name: "架空の見出し" }, { gap: "26px", before: "28px" }],
      fold: "",
      aside: "",
    }

    const parsed = parseLegacySections([
      { heading: "", blocks: [progress, known, dimension] },
      { heading: "", blocks: [progress] },
    ])

    expect(parsed.unknownBlockCount).toBe(3)
    expect(parsed.sections).toEqual([{ heading: "", blocks: [known] }])
  })

  it("崩れた既知の種類の塊は落とすが、知らない種類には数えない", () => {
    const parsed = parseLegacySections([{ heading: "", blocks: [{ kind: "text" }, known] }])

    expect(parsed.unknownBlockCount).toBe(0)
    expect(parsed.sections).toEqual([{ heading: "", blocks: [known] }])
  })
})

describe("row・panel の受け付け", () => {
  const accepted = (block: unknown): boolean =>
    parseLegacySections([{ heading: "", blocks: [block] }]).sections.length === 1

  it.each([
    ["子が2個の row", row([text("甲"), text("乙")])],
    ["子が4個の row", row([text("甲"), text("乙"), text("丙"), text("丁")])],
    ["子が1個の panel", panel([text("甲")])],
  ])("%s は節の塊として通る", (_name, block) => {
    expect(accepted(block)).toBe(true)
  })

  it.each([
    ["子が1個の row", row([text("甲")])],
    ["子が5個の row", row([text("甲"), text("乙"), text("丙"), text("丁"), text("戊")])],
    ["子が無い panel", panel([])],
    ["子に row を入れた row", row([row([text("甲"), text("乙")]), text("丙")])],
    ["子に panel を入れた row", row([panel([text("甲")]), text("乙")])],
    ["子に row を入れた panel", panel([row([text("甲"), text("乙")])])],
    ["子に panel を入れた panel", panel([panel([text("甲")])])],
  ])("%s は受けない", (_name, block) => {
    expect(accepted(block)).toBe(false)
  })

  it("読み戻しは row を子ごと残し、知らない種類に数えない", () => {
    const parsed = parseLegacySections([{ heading: "", blocks: [row([text("甲"), text("乙")])] }])

    expect(parsed.unknownBlockCount).toBe(0)
    expect(parsed.sections[0]?.blocks.map((block) => block.kind)).toEqual(["row"])
  })

  it("子を落とすだけの実装なら、子の数を数える検査が落ちる", () => {
    const parsed = parseLegacySections([
      { heading: "", blocks: [row([text("甲"), text("乙")]), panel([text("丙")])] },
    ])
    const counts = parsed.sections[0]?.blocks.map((block) =>
      block.kind === "row" || block.kind === "panel" ? block.blocks.length : 0,
    )

    expect(counts).toEqual([2, 1])
  })
})

describe("row・panel の子への検査", () => {
  it("row の子の文も、地の文と同じ検査に掛かる", () => {
    const sections = sectionsOf([
      row([text("The quick brown fox jumps over the lazy dog today"), text("架空の一文。")]),
    ])

    expect(reportViolations(draft([], "架空の結論。", sections)).map((v) => v.kind)).toContain(
      "non-japanese",
    )
  })

  it("panel の子の graph も、図の検査に掛かる", () => {
    const sections = sectionsOf([
      panel([{ kind: "graph", direction: "LR", source: "甲 -> 乙\n[]" }]),
    ])

    expect(reportViolations(draft([], "架空の結論。", sections)).map((v) => v.kind)).toContain(
      "broken-graph",
    )
  })

  it("row の子の image も、画像の棚に載せるパスに入る", () => {
    const sections = sectionsOf([
      row([{ kind: "image", path: "架空/画面.png", caption: "架空の画面" }, text("架空の一文。")]),
    ])

    expect(
      reportImagePaths(drawnLeaves(reportOutline(reportOfSections(sections).components))),
    ).toEqual(["架空/画面.png"])
  })
})
