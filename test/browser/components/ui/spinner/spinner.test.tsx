import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { Spinner } from "../../../../../src/browser/components/ui/spinner/spinner.tsx"

afterEach(() => {
  cleanup()
})

describe("Spinner", () => {
  it("読み上げに出さない輪を描き、呼び手の className を足す", () => {
    const { container } = render(<Spinner className="caller" slow={false} />)
    const ring = container.firstElementChild
    expect(ring?.getAttribute("aria-hidden")).toBe("true")
    expect(ring?.classList.contains("caller")).toBe(true)
    expect(ring?.hasAttribute("data-slow")).toBe(false)
  })

  it("slow のときだけ遅い回り方の印を付ける", () => {
    const { container } = render(<Spinner className="" slow />)
    expect(container.firstElementChild?.hasAttribute("data-slow")).toBe(true)
  })
})
