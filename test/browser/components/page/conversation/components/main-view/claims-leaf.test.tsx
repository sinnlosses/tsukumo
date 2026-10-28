import { cleanup } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import { loadMarkdown } from "../../../../../../../src/browser/components/page/conversation/components/markdown/markdown.tsx"
import { newLeafHtml, oldLeafHtml } from "../../../../../../fixture/direct-leaf-compare.tsx"

beforeAll(async () => {
  await loadMarkdown()
})

afterEach(() => {
  cleanup()
})

function both(
  items: {
    claim: string
    certainty: "confirmed" | "inferred" | "unverified"
    basis: string
    howToVerify: string
  }[],
  fold = "",
) {
  const block = { kind: "claims", items, fold, aside: "" } as const
  const part = { id: "c1", component: "Claims", items, fold, aside: "" } as const
  return { fresh: newLeafHtml(block, part), old: oldLeafHtml(block) }
}

describe("Claims の部品", () => {
  it("3つの確度と、根拠・確かめ方の有無が旧い描画と一致する", () => {
    const { fresh, old } = both([
      { claim: "架空の主張 `a.ts`", certainty: "confirmed", basis: "架空の根拠", howToVerify: "" },
      { claim: "架空の推測", certainty: "inferred", basis: "", howToVerify: "架空の手順 **太字**" },
      {
        claim: "架空の未確認",
        certainty: "unverified",
        basis: "架空の根拠 [出典](https://example.com/a)",
        howToVerify: "架空の手順",
      },
    ])

    expect(fresh).toContain("確定")
    expect(fresh).toContain("未確認")
    expect(fresh).toBe(old)
  })

  it("fold つきは details で包む", () => {
    const { fresh, old } = both(
      [{ claim: "架空の主張", certainty: "confirmed", basis: "", howToVerify: "" }],
      "架空の根拠",
    )

    expect(fresh).toContain("<details>")
    expect(fresh).toBe(old)
  })
})
