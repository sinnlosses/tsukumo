import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { Badge, type BadgeProps } from "../../../../../src/browser/components/ui/badge/badge.tsx"

afterEach(() => {
  cleanup()
})

const BASE_PROPS = {
  tone: "neutral",
  shape: "pill",
  className: "",
} satisfies Omit<BadgeProps, "children">

function renderedBadge(props: Omit<BadgeProps, "children">): HTMLElement {
  render(<Badge {...props}>dummy-label</Badge>)
  return screen.getByText("dummy-label")
}

describe("Badge", () => {
  it.each(["neutral", "ok", "warn", "ng", "accent"] as const)(
    "tone: %s を data-tone に出す",
    (tone) => {
      expect(renderedBadge({ ...BASE_PROPS, tone }).dataset["tone"]).toBe(tone)
    },
  )

  it.each(["pill", "square"] as const)("shape: %s を data-shape に出す", (shape) => {
    expect(renderedBadge({ ...BASE_PROPS, shape }).dataset["shape"]).toBe(shape)
  })

  it("渡した className が残る", () => {
    const element = renderedBadge({ ...BASE_PROPS, className: "dummy-placement" })
    expect(element.classList.contains("dummy-placement")).toBe(true)
  })
})
