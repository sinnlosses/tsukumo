import { cleanup } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import { loadMarkdown } from "../../../../../../../src/browser/components/page/conversation/components/markdown/markdown.tsx"
import { newLeafHtml, renderDirectLeaf } from "../../../../../../fixture/direct-leaf-compare.tsx"

beforeAll(async () => {
  await loadMarkdown()
})

afterEach(() => {
  cleanup()
})

type Verdict = "adopt" | "consider" | "reject"

function freshHtml(title: string, items: { name: string; verdict: Verdict; reason: string }[]) {
  const block = { kind: "options", title, items, fold: "", aside: "" } as const
  const part = { id: "o1", component: "Options", title, items, fold: "", aside: "" } as const
  return newLeafHtml(block, part)
}

const ITEMS: { name: string; verdict: Verdict; reason: string }[] = [
  { name: "架空の案甲 `a.ts`", verdict: "adopt", reason: "架空の理由 `#ff8800`" },
  { name: "架空の案乙", verdict: "consider", reason: "" },
  { name: "架空の案丙", verdict: "reject", reason: "架空の理由 {{1 → 2}}" },
  { name: "架空の案丁", verdict: "adopt", reason: "二つ目の採る" },
]

describe("Options の部品", () => {
  it("題があれば題の段落を描き、題が空なら描かない", () => {
    const options = (title: string) =>
      renderDirectLeaf({ id: "o1", component: "Options", title, items: ITEMS, fold: "", aside: "" })

    expect(options("架空の題").container.querySelector("strong")?.textContent).toBe("架空の題")
    cleanup()
    const { container } = options("")
    expect(container.querySelector("strong")).toBeNull()
    expect(container.textContent).toContain("架空の案")
  })

  it("番号は出さず、判定を記号つきの札で出す", () => {
    const fresh = freshHtml("架空の題", ITEMS)

    expect(fresh).not.toContain(">1</span>")
    expect(fresh).toContain('<span aria-hidden="true">✓</span>採る</span>')
    expect(fresh).toContain('<span aria-hidden="true">〜</span>検討</span>')
    expect(fresh).toContain('<span aria-hidden="true">–</span>採らない</span>')
  })
})
