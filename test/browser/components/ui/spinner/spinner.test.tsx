import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { Spinner } from "../../../../../src/browser/components/ui/spinner/spinner.tsx"

afterEach(() => {
  cleanup()
})

describe("Spinner", () => {
  it("読み上げに出さない輪を描き、呼び手の className を足す", () => {
    const { container } = render(<Spinner className="caller" />)
    const ring = container.firstElementChild
    expect(ring?.getAttribute("aria-hidden")).toBe("true")
    expect(ring?.classList.contains("caller")).toBe(true)
  })
})
