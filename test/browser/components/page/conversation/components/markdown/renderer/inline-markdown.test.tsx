import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import {
  InlineMarkdown,
  Markdown,
} from "../../../../../../../../src/browser/components/page/conversation/components/markdown/renderer/markdown-renderer.tsx"

afterEach(() => {
  cleanup()
})

const TEXT =
  "**架空の太字**と `#ff8800` と {{12 → 8}} と {{3 / 5}} と [出典](https://example.com/a)。"

describe("InlineMarkdown", () => {
  it("段落の p を付けず、行内の記法だけを描く", () => {
    const { container } = render(<InlineMarkdown text={TEXT} />)

    expect(container.querySelector("p")).toBeNull()
    expect(container.querySelector("strong")?.textContent).toBe("架空の太字")
  })

  it("行内の印と色見本は、段落のときと同じ DOM になる", () => {
    const inline = render(<InlineMarkdown text={TEXT} />).container.innerHTML
    cleanup()
    const block = render(<Markdown text={TEXT} />).container.innerHTML

    expect(block).toBe(`<p>${inline}</p>`)
  })

  it("行頭が塊の記法に見える字は、字のまま描く", () => {
    const { container } = render(<InlineMarkdown text="1. 架空の番号のような文" />)

    expect(container.querySelector("ol")).toBeNull()
    expect(container.textContent).toBe("1. 架空の番号のような文")
  })
})
