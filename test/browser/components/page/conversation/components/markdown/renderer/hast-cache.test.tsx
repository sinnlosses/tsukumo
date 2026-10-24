import { cleanup, render } from "@testing-library/react"
import type { Root } from "hast"
import type remarkGfm from "remark-gfm"
import { afterEach, describe, expect, it, vi } from "vitest"

import { createHastCache } from "../../../../../../../../src/browser/components/page/conversation/components/markdown/renderer/hast-cache.ts"
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

describe("createHastCache", () => {
  it("上限を超えると、いちばん長く使われていないものから落ちる", () => {
    const cache = createHastCache(2)
    cache.set("a", rootOf("a"))
    cache.set("b", rootOf("b"))
    cache.get("a")
    cache.set("c", rootOf("c"))

    expect(cache.get("b")).toBeUndefined()
    expect(cache.get("a")).toBeDefined()
    expect(cache.get("c")).toBeDefined()
  })
})
