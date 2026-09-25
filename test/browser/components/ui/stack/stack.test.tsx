import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, render, screen } from "@testing-library/react"

import { Stack, type StackProps } from "../../../../../src/browser/components/ui/stack/stack.tsx"

afterEach(() => {
  cleanup()
})

const BASE_PROPS = {
  element: "div",
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
  it.each([
    ["row", "stack-direction-row"],
    ["column", "stack-direction-column"],
  ] as const)("direction: %s は class %s を付ける", (direction, expectedClass) => {
    const element = renderedElement({ ...BASE_PROPS, direction })
    expect(element.className.split(" ")).toContain(expectedClass)
  })

  it.each([
    ["none", "stack-gap-none"],
    ["xs", "stack-gap-xs"],
    ["sm", "stack-gap-sm"],
    ["md", "stack-gap-md"],
    ["lg", "stack-gap-lg"],
    ["xl", "stack-gap-xl"],
  ] as const)("gap: %s は class %s を付ける", (gap, expectedClass) => {
    const element = renderedElement({ ...BASE_PROPS, gap })
    expect(element.className.split(" ")).toContain(expectedClass)
  })

  it.each([
    ["start", "stack-align-start"],
    ["center", "stack-align-center"],
    ["end", "stack-align-end"],
    ["baseline", "stack-align-baseline"],
    ["stretch", "stack-align-stretch"],
  ] as const)("align: %s は class %s を付ける", (align, expectedClass) => {
    const element = renderedElement({ ...BASE_PROPS, align })
    expect(element.className.split(" ")).toContain(expectedClass)
  })

  it.each([
    ["start", "stack-justify-start"],
    ["center", "stack-justify-center"],
    ["end", "stack-justify-end"],
    ["between", "stack-justify-between"],
  ] as const)("justify: %s は class %s を付ける", (justify, expectedClass) => {
    const element = renderedElement({ ...BASE_PROPS, justify })
    expect(element.className.split(" ")).toContain(expectedClass)
  })

  it.each([
    ["nowrap", "stack-wrap-nowrap"],
    ["wrap", "stack-wrap-wrap"],
  ] as const)("wrap: %s は class %s を付ける", (wrap, expectedClass) => {
    const element = renderedElement({ ...BASE_PROPS, wrap })
    expect(element.className.split(" ")).toContain(expectedClass)
  })

  it.each([
    ["div", "DIV"],
    ["section", "SECTION"],
    ["span", "SPAN"],
  ] as const)("element: %s は %s を描く", (elementProp, tagName) => {
    const element = renderedElement({ ...BASE_PROPS, element: elementProp })
    expect(element.tagName).toBe(tagName)
  })

  it("className が足される", () => {
    const element = renderedElement({ ...BASE_PROPS, className: "dummy-extra" })
    expect(element.className.split(" ")).toContain("dummy-extra")
  })
})
