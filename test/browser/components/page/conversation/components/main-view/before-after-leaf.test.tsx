import { cleanup } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import { loadMarkdown } from "../../../../../../../src/browser/components/page/conversation/components/markdown/markdown.tsx"
import type { A2uiReportComponent } from "../../../../../../../src/shared/report/a2ui-report-catalog.ts"
import type { SectionBlock } from "../../../../../../../src/shared/report/report-block.ts"
import type { ReportImageSource } from "../../../../../../../src/shared/report/report-image-markdown.ts"
import { newLeafHtml, oldLeafHtml } from "../../../../../../fixture/direct-leaf-compare.tsx"

beforeAll(async () => {
  await loadMarkdown()
})

afterEach(() => {
  cleanup()
})

const SHELVED: ReportImageSource = {
  kind: "shelved",
  toolUseId: "toolu_1",
  sizes: [{ path: "/tmp/前.png", width: 640, height: 480 }],
  unshelved: ["/tmp/置けない.png"],
}

type Block = Extract<SectionBlock, { readonly kind: "beforeAfter" }>
type Side = Extract<A2uiReportComponent, { readonly component: "BeforeAfter" }>["before"]

const IMAGE_BEFORE: Side = { kind: "image", path: "/tmp/前.png" }
const IMAGE_AFTER: Side = {
  kind: "image",
  path: "/tmp/後.png",
  region: { left: 10, top: 20.5, width: 30, height: 40 },
}
const CODE: Side = { kind: "code", language: "ts", source: "const a = 1\n" }
const POINTS: Side = { kind: "points", points: ["架空の `a.ts` の点", "架空の点"] }
const MERMAID: Side = { kind: "mermaid", source: "sequenceDiagram\n  A->>B: 呼ぶ" }
const SVG: Side = {
  kind: "svg",
  width: 100,
  height: 50,
  legend: [{ tone: "a", label: "架空の色" }],
  shapes: [
    {
      kind: "rect",
      x: 1,
      y: 2,
      width: 30,
      height: 20,
      label: "架空",
      sub: "",
      labelAt: "center",
      tone: "a",
      emphasis: false,
    },
  ],
}

function pair(before: Side, after: Side, fold = "") {
  const fields = { title: "架空の前後", before, after }
  return {
    block: { kind: "beforeAfter", ...fields, fold, aside: "" } satisfies Block,
    part: { id: "b1", component: "BeforeAfter", ...fields, fold, aside: "" } as const,
  }
}

describe("BeforeAfter の部品", () => {
  it.each([
    ["画像と画像（枠あり）", IMAGE_BEFORE, IMAGE_AFTER],
    ["画像とコード", IMAGE_BEFORE, CODE],
    ["箇条と mermaid", POINTS, MERMAID],
    ["svg と箇条", SVG, POINTS],
    ["コードとコード", CODE, CODE],
  ] as const)("%s が旧い描画と一致する", (_, before, after) => {
    const { block, part } = pair(before, after)

    expect(newLeafHtml(block, part, SHELVED)).toBe(oldLeafHtml(block, SHELVED))
  })

  it("棚に置けない・置いていない画像は札になり、旧い描画と一致する", () => {
    const { block, part } = pair(IMAGE_BEFORE, IMAGE_AFTER)

    expect(newLeafHtml(block, part, { kind: "none" })).toBe(oldLeafHtml(block, { kind: "none" }))
  })

  it("畳みは題の包みごと", () => {
    const { block, part } = pair(POINTS, POINTS, "架空の畳み")

    expect(newLeafHtml(block, part, SHELVED)).toBe(oldLeafHtml(block, SHELVED))
  })

  it("両側が画像のときだけ、見せ方を選ぶ口を持つ", () => {
    const both = pair(IMAGE_BEFORE, IMAGE_AFTER)
    const mixed = pair(IMAGE_BEFORE, CODE)

    expect(newLeafHtml(both.block, both.part, SHELVED)).toContain("data-view")
    expect(newLeafHtml(mixed.block, mixed.part, SHELVED)).not.toContain("data-view")
  })

  it("画像の代替テキストは前後の見分けと題を持つ", () => {
    const { block, part } = pair(IMAGE_BEFORE, IMAGE_AFTER)
    const fresh = newLeafHtml(block, part, SHELVED)

    expect(fresh).toContain('alt="前の画面: 架空の前後"')
    expect(fresh).toContain('alt="後の画面: 架空の前後"')
  })
})
