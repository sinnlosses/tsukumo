import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, render, screen } from "@testing-library/react"
import { createRef } from "react"

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
    ["header", "HEADER"],
    ["footer", "FOOTER"],
    ["label", "LABEL"],
    ["p", "P"],
  ] as const)("element: %s は %s を描く", (elementProp, tagName) => {
    const element = renderedElement({ ...BASE_PROPS, element: elementProp })
    expect(element.tagName).toBe(tagName)
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
