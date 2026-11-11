import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import {
  Surface,
  type SurfaceProps,
} from "../../../../../src/browser/components/ui/surface/surface.tsx"

afterEach(() => {
  cleanup()
})

const BASE_PROPS = {
  element: "div",
  tone: "surface",
  space: "md",
  radius: "lg",
  shadow: "none",
  className: "",
} satisfies Omit<SurfaceProps, "children">

/** `Surface` が描く要素を、中の子から辿って取り出す。 */
function renderedElement(props: Omit<SurfaceProps, "children">): HTMLElement {
  cleanup()
  render(
    <Surface {...props}>
      <span data-testid="surface-child">child</span>
    </Surface>,
  )
  const parent = screen.getByTestId("surface-child").parentElement
  if (parent === null) {
    throw new Error("Surface が親要素を描いていない")
  }
  return parent
}

describe("Surface", () => {
  it.each([
    ["surface", "default"],
    ["raised", "default"],
    ["accent", "accent"],
  ] as const)("tone: %s は Card の variant %s に写る", (tone, variant) => {
    expect(renderedElement({ ...BASE_PROPS, tone }).dataset["variant"]).toBe(variant)
  })

  it.each([
    ["none", "none"],
    ["raised", "med"],
    ["overlay", "high"],
  ] as const)("shadow: %s は Card の elevation %s に写る", (shadow, elevation) => {
    expect(renderedElement({ ...BASE_PROPS, shadow }).dataset["elevation"]).toBe(elevation)
  })

  it("className は Card の要素に残る", () => {
    const element = renderedElement({ ...BASE_PROPS, className: "dummy-placement" })
    expect(element.classList.contains("dummy-placement")).toBe(true)
  })

  it("element: section でも div を描く", () => {
    expect(renderedElement({ ...BASE_PROPS, element: "section" }).tagName).toBe("DIV")
  })
})
