import { cleanup, render, screen } from "@testing-library/react"
import { createRef } from "react"
import { afterEach, describe, expect, it } from "vitest"

import { Stack, type StackProps } from "../../../../../src/browser/components/ui/stack/stack.tsx"

afterEach(() => {
  cleanup()
})

const BASE_PROPS = {
  element: "div",
  name: { kind: "none" },
  ref: undefined,
  direction: "row",
  gap: "none",
  align: "stretch",
  justify: "start",
  wrap: "nowrap",
  className: "",
} satisfies Omit<StackProps, "children">

/** `Stack` が描く要素を、中の子から辿って取り出す。 */
function renderedElement(props: Omit<StackProps, "children">): Element {
  render(
    <Stack {...props}>
      <span data-testid="stack-child">child</span>
    </Stack>,
  )
  const child = screen.getByTestId("stack-child")
  const parent = child.parentElement
  if (parent === null) {
    throw new Error("Stack が親要素を描いていない")
  }
  return parent
}

describe("Stack", () => {
  it("gap・align・justify・wrap は対応表の class を付ける", () => {
    const element = renderedElement({
      ...BASE_PROPS,
      gap: "md",
      align: "center",
      justify: "between",
      wrap: "wrap",
    })
    expect(element.className.split(" ")).toEqual(
      expect.arrayContaining([
        "stack-gap-md",
        "stack-align-center",
        "stack-justify-between",
        "stack-wrap-wrap",
      ]),
    )
  })

  it("element で描く要素を選ぶ", () => {
    const element = renderedElement({ ...BASE_PROPS, element: "section" })
    expect(element.tagName).toBe("SECTION")
  })

  it("name: none は aria-label も aria-labelledby も付けない", () => {
    const element = renderedElement(BASE_PROPS)
    expect(element.hasAttribute("aria-label")).toBe(false)
    expect(element.hasAttribute("aria-labelledby")).toBe(false)
  })

  it("name: label は aria-label に文字列を付ける", () => {
    const element = renderedElement({ ...BASE_PROPS, name: { kind: "label", label: "dummy-name" } })
    expect(element.getAttribute("aria-label")).toBe("dummy-name")
    expect(element.hasAttribute("aria-labelledby")).toBe(false)
  })

  it("name: labelledby は aria-labelledby に id を付ける", () => {
    const element = renderedElement({ ...BASE_PROPS, name: { kind: "labelledby", id: "dummy-id" } })
    expect(element.getAttribute("aria-labelledby")).toBe("dummy-id")
    expect(element.hasAttribute("aria-label")).toBe(false)
  })

  it("ref に描いた要素が入る", () => {
    const ref = createRef<HTMLElement>()
    const element = renderedElement({ ...BASE_PROPS, ref })
    expect(ref.current === element).toBe(true)
  })

  it("className が足される", () => {
    const element = renderedElement({ ...BASE_PROPS, className: "dummy-extra" })
    expect(element.className.split(" ")).toContain("dummy-extra")
  })
})
