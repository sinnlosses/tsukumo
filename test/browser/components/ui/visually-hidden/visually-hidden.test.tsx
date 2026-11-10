import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { VisuallyHidden } from "../../../../../src/browser/components/ui/visually-hidden/visually-hidden.tsx"

afterEach(() => {
  cleanup()
})

describe("VisuallyHidden", () => {
  it("element で描く要素を選ぶ", () => {
    render(<VisuallyHidden element="div">content</VisuallyHidden>)
    expect(screen.getByText("content").tagName).toBe("DIV")
  })

  it("読み上げの領域に要る aria-live・aria-atomic・data-live-announcer を要素へ渡す", () => {
    render(
      <VisuallyHidden
        element="div"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-live-announcer="dummy"
      >
        content
      </VisuallyHidden>,
    )
    const region = screen.getByRole("status")
    expect(region.getAttribute("aria-live")).toBe("polite")
    expect(region.getAttribute("aria-atomic")).toBe("true")
    expect(region.getAttribute("data-live-announcer")).toBe("dummy")
  })
})
