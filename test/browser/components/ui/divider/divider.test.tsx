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
  it("separator の役の div を描く", () => {
    expect(renderedDivider(BASE_PROPS).tagName).toBe("DIV")
  })

  it.each([
    ["strong", "strong"],
    ["soft", "subtle"],
    ["quiet", "subtle"],
  ] as const)("tone: %s は Astryx の variant: %s へ写る", (tone, variant) => {
    expect(renderedDivider({ ...BASE_PROPS, tone }).dataset["variant"]).toBe(variant)
  })

  it.each(["strong", "soft", "quiet"] as const)("tone: %s を data-tone に出す", (tone) => {
    expect(renderedDivider({ ...BASE_PROPS, tone }).dataset["tone"]).toBe(tone)
  })

  it.each(["horizontal", "vertical"] as const)(
    "%s は向きを aria-orientation に出す",
    (orientation) => {
      const element = renderedDivider({ ...BASE_PROPS, orientation })
      expect(element.getAttribute("aria-orientation")).toBe(orientation)
    },
  )
})
