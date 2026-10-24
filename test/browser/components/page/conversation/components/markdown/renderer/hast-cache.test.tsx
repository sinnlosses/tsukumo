import { cleanup, render } from "@testing-library/react"
import type { Root } from "hast"
import type remarkGfm from "remark-gfm"
import { afterEach, describe, expect, it, vi } from "vitest"

import { REPORT_HAST_CACHE } from "../../../../../../../../src/browser/components/page/conversation/components/markdown/renderer/hast-cache.ts"
import { Markdown } from "../../../../../../../../src/browser/components/page/conversation/components/markdown/renderer/markdown-renderer.tsx"

const parsed = vi.hoisted(() => ({ count: 0 }))

// remark の段は parse のあとに、描くたびに取り付けられる。取り付けの回数が parse の回数になる。
vi.mock("remark-gfm", async (importOriginal) => {
  const original = await importOriginal<{ default: typeof remarkGfm }>()
  return {
    default(this: ThisParameterType<typeof remarkGfm>, ...args: never[]) {
      parsed.count += 1
      return Reflect.apply(original.default, this, args)
    },
  }
})

afterEach(() => {
  cleanup()
})

function rootOf(label: string): Root {
  return { type: "root", children: [{ type: "text", value: label }] }
}

describe("Markdown（描いた木の再利用）", () => {
  it("同じ文字列の2回目は parse が走らず、同じ見た目になる", () => {
    const text = "## 見出し\n\n本文 `code`\n\n```ts\nconst x = 1\n```"
    const before = parsed.count

    const first = render(<Markdown text={text} />)
    const firstHtml = first.container.innerHTML
    first.unmount()
    const afterFirst = parsed.count
    const second = render(<Markdown text={text} />)

    expect(afterFirst - before).toBe(1)
    expect(parsed.count).toBe(afterFirst)
    expect(second.container.innerHTML).toBe(firstHtml)
  })
})

// `REPORT_HAST_LIMIT` と同じ値。
const REPORT_HAST_LIMIT = 200

describe("REPORT_HAST_CACHE", () => {
  it("上限を超えると、いちばん長く使われていないものから落ちる", () => {
    // 前のテストが残したものを押し出してから、a・b と詰め物でちょうど上限まで埋める。
    for (let index = 0; index < REPORT_HAST_LIMIT; index += 1) {
      REPORT_HAST_CACHE.set(`前${String(index)}`, rootOf("前"))
    }
    const fillers = Array.from(
      { length: REPORT_HAST_LIMIT - 2 },
      (_, index) => `詰め${String(index)}`,
    )
    REPORT_HAST_CACHE.set("a", rootOf("a"))
    REPORT_HAST_CACHE.set("b", rootOf("b"))
    for (const filler of fillers) {
      REPORT_HAST_CACHE.set(filler, rootOf(filler))
    }
    REPORT_HAST_CACHE.get("a")
    REPORT_HAST_CACHE.set("c", rootOf("c"))

    expect(REPORT_HAST_CACHE.get("b")).toBeUndefined()
    expect(REPORT_HAST_CACHE.get("a")).toBeDefined()
    expect(REPORT_HAST_CACHE.get("c")).toBeDefined()
  })
})
