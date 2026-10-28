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

type Verdict = "adopt" | "consider" | "reject"

function both(
  title: string,
  items: { name: string; verdict: Verdict; reason: string }[],
  fold = "",
) {
  const block = { kind: "options", title, items, fold, aside: "" } as const
  const part = { id: "o1", component: "Options", title, items, fold, aside: "" } as const
  return { fresh: newLeafHtml(block, part), old: oldLeafHtml(block) }
}

const ITEMS: { name: string; verdict: Verdict; reason: string }[] = [
  { name: "架空の案甲 `a.ts`", verdict: "adopt", reason: "架空の理由 `#ff8800`" },
  { name: "架空の案乙", verdict: "consider", reason: "" },
  { name: "架空の案丙", verdict: "reject", reason: "架空の理由 {{1 → 2}}" },
  { name: "架空の案丁", verdict: "adopt", reason: "二つ目の採る" },
]

describe("Options の部品", () => {
  it("題あり・3つの判定・理由の有無が旧い描画と一致する", () => {
    const { fresh, old } = both("架空の題 `x`", ITEMS)

    expect(fresh).toContain("架空の題")
    expect(fresh).toBe(old)
  })

  it("題が空なら題の段落を描かない", () => {
    const { fresh, old } = both("", ITEMS)

    expect(fresh).not.toContain("<strong>")
    expect(fresh).toBe(old)
  })

  it("筆を留める印は採るの行の数だけ付く", () => {
    const { fresh } = both("架空の題", ITEMS)

    expect(fresh.split("report-pause-point")).toHaveLength(3)
  })

  it("番号は1始まりで、判定の語が文字で出る", () => {
    const { fresh } = both("架空の題", ITEMS)

    expect(fresh).toContain(">1</span>")
    expect(fresh).toContain(">採る</span>")
    expect(fresh).toContain(">採らない</span>")
  })

  it("fold つきは details で包む", () => {
    const { fresh, old } = both("架空の題", ITEMS, "架空の根拠")

    expect(fresh).toContain("<details>")
    expect(fresh).toBe(old)
  })
})
