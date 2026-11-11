import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { Quote } from "../../../../../src/browser/components/ui/quote/quote.tsx"

afterEach(cleanup)

describe("Quote", () => {
  it("本文を blockquote に、出典を cite に出す", () => {
    const { container } = render(
      <Quote source="— 出典">
        <span>本文</span>
      </Quote>,
    )

    expect(container.querySelector("blockquote > span")?.textContent).toBe("本文")
    expect(container.querySelector("blockquote > cite")?.textContent).toBe("— 出典")
  })

  it("出典が空なら cite を出さない", () => {
    const { container } = render(
      <Quote source="">
        <span>本文</span>
      </Quote>,
    )

    expect(container.querySelector("cite")).toBeNull()
  })
})
