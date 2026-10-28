import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { InlineCodeText } from "../../../../../../../../src/browser/components/page/conversation/components/markdown/renderer/inline-code-text.tsx"
import { Markdown } from "../../../../../../../../src/browser/components/page/conversation/components/markdown/renderer/markdown-renderer.tsx"

afterEach(() => {
  cleanup()
})

describe("InlineCodeText", () => {
  it("inline code だけ code にし、太字やリンクの記法は効かせない", () => {
    const { container } = render(<InlineCodeText text="**架空** と `a.ts` と [x](https://e.com)" />)

    expect(container.querySelectorAll("code")).toHaveLength(1)
    expect(container.querySelector("strong")).toBeNull()
    expect(container.querySelector("a")).toBeNull()
    expect(container.textContent).toBe("**架空** と a.ts と [x](https://e.com)")
  })

  it("色見本と行内の印の畳みは Markdown の code と同じ", () => {
    const fresh = render(<InlineCodeText text="`#ff8800` と {{3 / 5}}" />).container.innerHTML
    cleanup()
    const old = render(<Markdown text="`#ff8800` と 3/5" />).container.innerHTML

    expect(old).toBe(`<p>${fresh}</p>`)
  })
})
