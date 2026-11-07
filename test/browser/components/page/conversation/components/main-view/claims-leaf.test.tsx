import { cleanup, screen } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import { loadMarkdown } from "../../../../../../../src/browser/features/report/markdown.tsx"
import { renderDirectLeaf } from "../../../../../../fixture/direct-leaf-compare.tsx"

beforeAll(async () => {
  await loadMarkdown()
})

afterEach(() => {
  cleanup()
})

const ITEMS: {
  claim: string
  certainty: "confirmed" | "inferred" | "unverified"
  basis: string
  howToVerify: string
}[] = [
  { claim: "架空の確かな主張", certainty: "confirmed", basis: "架空の根拠", howToVerify: "" },
  { claim: "架空の推測の主張", certainty: "inferred", basis: "", howToVerify: "架空の手順" },
  {
    claim: "架空の未確認の主張",
    certainty: "unverified",
    basis: "架空の別の根拠",
    howToVerify: "架空の別の手順",
  },
]

function rowTextOf(claim: string): string {
  return screen.getByText(claim).parentElement?.textContent ?? ""
}

describe("Claims の部品", () => {
  it("確度ごとに、確定・推測・未確認の語を主張の行に添える", () => {
    renderDirectLeaf({ id: "c1", component: "Claims", items: ITEMS, fold: "", aside: "" })

    expect(rowTextOf("架空の確かな主張")).toContain("確定")
    expect(rowTextOf("架空の推測の主張")).toContain("推測")
    expect(rowTextOf("架空の未確認の主張")).toContain("未確認")
  })

  it("根拠と確かめ方は、字のある欄だけを見出しつきで描く", () => {
    renderDirectLeaf({ id: "c1", component: "Claims", items: ITEMS, fold: "", aside: "" })

    const confirmed = rowTextOf("架空の確かな主張")
    expect(confirmed).toContain("根拠架空の根拠")
    expect(confirmed).not.toContain("確かめ方")
    const inferred = rowTextOf("架空の推測の主張")
    expect(inferred).not.toContain("根拠")
    expect(inferred).toContain("確かめ方架空の手順")
    const unverified = rowTextOf("架空の未確認の主張")
    expect(unverified).toContain("根拠架空の別の根拠")
    expect(unverified).toContain("確かめ方架空の別の手順")
  })
})
