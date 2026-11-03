import { cleanup } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import { loadMarkdown } from "../../../../../../../src/browser/components/page/conversation/components/markdown/markdown.tsx"
import type { A2uiReportComponent } from "../../../../../../../src/shared/report/a2ui-report-catalog.ts"
import type { ReportBlock } from "../../../../../../../src/shared/report/report-block.ts"
import type { ReportImageSource } from "../../../../../../../src/shared/report/report-image-markdown.ts"
import { newLeafHtml } from "../../../../../../fixture/direct-leaf-compare.tsx"

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

type Block = Extract<ReportBlock, { readonly kind: "beforeAfter" }>
type ComparePart = Extract<A2uiReportComponent, { readonly component: "Compare" }>
type Side = Extract<A2uiReportComponent, { readonly component: "BeforeAfter" }>["before"]

const IMAGE_BEFORE: Side = { kind: "image", path: "/tmp/前.png" }
const IMAGE_AFTER: Side = {
  kind: "image",
  path: "/tmp/後.png",
  region: { left: 10, top: 20.5, width: 30, height: 40 },
}
const CODE: Side = { kind: "code", language: "ts", source: "const a = 1\n" }

function pair(before: Side, after: Side) {
  const fields = { title: "架空の前後", before, after }
  return {
    block: { kind: "beforeAfter", ...fields, fold: "", aside: "" } satisfies Block,
    part: { id: "b1", component: "BeforeAfter", ...fields, fold: "", aside: "" } as const,
  }
}

describe("BeforeAfter の部品", () => {
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

  it("Compare の before-after と同じ DOM に描く", () => {
    const { block, part } = pair(IMAGE_BEFORE, CODE)
    const compare: ComparePart = {
      id: "b1",
      component: "Compare",
      title: "架空の前後",
      relation: "before-after",
      sides: [
        { heading: "", ...IMAGE_BEFORE },
        { heading: "", ...CODE },
      ],
      fold: "",
      aside: "",
    }

    expect(newLeafHtml(block, compare, SHELVED)).toBe(newLeafHtml(block, part, SHELVED))
  })
})

describe("Compare の対等な2つ（versus）", () => {
  function versus(before: Side, after: Side) {
    const part: ComparePart = {
      id: "v1",
      component: "Compare",
      title: "架空の見比べ",
      relation: "versus",
      sides: [
        { heading: "架空の案A", ...before },
        { heading: "架空の案B", ...after },
      ],
      fold: "",
      aside: "",
    }
    const { id: _id, component: _component, ...fields } = part
    return { block: { kind: "compare", ...fields } satisfies ReportBlock, part }
  }

  it("側の見出しが札になり、矢印も「前」「後」の札も描かない", () => {
    const { block, part } = versus(CODE, CODE)
    const fresh = newLeafHtml(block, part, SHELVED)

    expect(fresh).toContain("架空の案A")
    expect(fresh).toContain("架空の案B")
    expect(fresh).not.toContain("→")
    expect(fresh).not.toMatch(/>前</)
    expect(fresh).not.toMatch(/>後</)
  })

  it("両側が画像なら見せ方の口を持ち、画像の代替テキストは側の見出しから作る", () => {
    const { block, part } = versus(IMAGE_BEFORE, IMAGE_AFTER)
    const fresh = newLeafHtml(block, part, SHELVED)

    expect(fresh).toContain("data-view")
    expect(fresh).toContain('alt="架空の案Aの画面: 架空の見比べ"')
    expect(fresh).toContain('alt="架空の案Bの画面: 架空の見比べ"')
  })
})
