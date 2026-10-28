import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import {
  Divider,
  type DividerProps,
} from "../../../../../src/browser/components/ui/divider/divider.tsx"

afterEach(() => {
  cleanup()
})

const BASE_PROPS = {
  tone: "strong",
  orientation: "horizontal",
  className: "",
} satisfies DividerProps

function renderedDivider(props: DividerProps): HTMLElement {
  render(<Divider {...props} />)
  return screen.getByRole("separator")
}

describe("Divider", () => {
  it("hr を描く", () => {
    expect(renderedDivider(BASE_PROPS).tagName).toBe("HR")
  })

  it.each(["strong", "soft", "quiet"] as const)("tone: %s を data-tone に出す", (tone) => {
    expect(renderedDivider({ ...BASE_PROPS, tone }).dataset["tone"]).toBe(tone)
  })

  it("vertical は aria-orientation を付ける", () => {
    const element = renderedDivider({ ...BASE_PROPS, orientation: "vertical" })
    expect(element.getAttribute("aria-orientation")).toBe("vertical")
  })

  it("horizontal は aria-orientation を付けない", () => {
    expect(renderedDivider(BASE_PROPS).hasAttribute("aria-orientation")).toBe(false)
  })
})
