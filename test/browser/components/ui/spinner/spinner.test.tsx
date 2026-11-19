import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { Spinner } from "../../../../../src/browser/components/ui/spinner/spinner.tsx"

afterEach(() => {
  cleanup()
})

describe("Spinner", () => {
  it("読み上げに出さない輪を描く", () => {
    const { container } = render(<Spinner className="" />)
    expect(container.firstElementChild?.getAttribute("aria-hidden")).toBe("true")
  })
})
