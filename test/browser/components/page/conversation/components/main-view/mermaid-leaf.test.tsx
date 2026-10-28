import { cleanup } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import { loadMarkdown } from "../../../../../../../src/browser/components/page/conversation/components/markdown/markdown.tsx"
import { newLeafHtml, oldLeafHtml } from "../../../../../../fixture/direct-leaf-compare.tsx"
import { stubIntersectionObserver } from "../../../../../../fixture/intersection.ts"

vi.mock(
  "../../../../../../../src/browser/components/page/conversation/components/markdown/renderer/vendor-script.ts",
  () => ({ loadVendorScript: () => new Promise(() => {}), preloadVendorScript: () => {} }),
)

beforeAll(async () => {
  stubIntersectionObserver(false)
  await loadMarkdown()
})

afterEach(() => {
  cleanup()
})

function both(source: string, title = "", fold = "", aside = "") {
  const block = { kind: "mermaid", title, source, fold, aside } as const
  const part = { id: "m1", component: "Mermaid", title, source, fold, aside } as const
  return { fresh: newLeafHtml(block, part), old: oldLeafHtml(block) }
}

describe("Mermaid の部品", () => {
  it.each([
    ["題あり", "sequenceDiagram\n  A->>B: 架空", "架空の題", "", ""],
    ["題なし", "sequenceDiagram\n  A->>B: 架空", "", "", ""],
    ["書き手が autonumber を書いた", "sequenceDiagram\n  autonumber\n  A->>B: 架空", "", "", ""],
    ["stateDiagram-v2", "stateDiagram-v2\n  [*] --> A", "架空の状態", "", ""],
    ["fold つき", "sequenceDiagram\n  A->>B: 架空", "架空の題", "架空の畳み", ""],
    ["aside つき", "sequenceDiagram\n  A->>B: 架空", "架空の題", "", "架空の傍注"],
    ["fold と aside の両方", "sequenceDiagram\n  A->>B: 架空", "", "架空の畳み", "架空の傍注"],
  ] as const)("%s が旧い描画と一致する", (_name, source, title, fold, aside) => {
    const { fresh, old } = both(source, title, fold, aside)

    expect(fresh).toBe(old)
    expect(fresh).not.toBe("")
  })

  it("fold は with-gutter の中で題つきの包みごと畳む", () => {
    const { fresh } = both("sequenceDiagram\n  A->>B: 架空", "架空の題", "架空の畳み", "架空の傍注")

    expect(fresh).toMatch(
      /<div class="report-with-gutter"><details><summary>架空の畳み<\/summary><div class="report-captioned">/,
    )
  })
})
