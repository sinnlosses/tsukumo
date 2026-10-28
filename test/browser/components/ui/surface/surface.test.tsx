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
function renderedElement(props: Omit<SurfaceProps, "children">): Element {
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

function renderedClasses(props: Omit<SurfaceProps, "children">): string[] {
  return renderedElement(props).className.split(" ")
}

describe("Surface", () => {
  it("tone・space・radius・shadow は対応表の class を付ける", () => {
    const classes = renderedClasses({
      ...BASE_PROPS,
      tone: "raised",
      space: "2xl",
      radius: "xl",
      shadow: "overlay",
    })
    expect(classes).toEqual(
      expect.arrayContaining([
        "surface-tone-raised",
        "surface-space-2xl",
        "surface-radius-xl",
        "surface-shadow-overlay",
      ]),
    )
  })

  it("tone の 3 値と shadow の 3 値は、それぞれ別の class になる", () => {
    const tones = (["surface", "raised", "accent"] as const).map((tone) =>
      renderedClasses({ ...BASE_PROPS, tone }).join(" "),
    )
    const shadows = (["none", "raised", "overlay"] as const).map((shadow) =>
      renderedClasses({ ...BASE_PROPS, shadow }).join(" "),
    )
    expect(new Set(tones).size).toBe(3)
    expect(new Set(shadows).size).toBe(3)
  })

  it("className は末尾に足される", () => {
    expect(renderedClasses({ ...BASE_PROPS, className: "placed" }).at(-1)).toBe("placed")
  })

  it("element: section は section を描く", () => {
    expect(renderedElement({ ...BASE_PROPS, element: "section" }).tagName).toBe("SECTION")
  })
})
