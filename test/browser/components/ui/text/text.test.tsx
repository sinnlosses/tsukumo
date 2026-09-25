import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, render, screen } from "@testing-library/react"

import { Text, type TextProps } from "../../../../../src/browser/components/ui/text/text.tsx"

afterEach(() => {
  cleanup()
})

const BASE_PROPS = {
  element: "p",
  size: "body",
  tone: "ink",
  weight: "normal",
  className: "",
} satisfies Omit<TextProps, "children">

/** `Text` が描く要素を、テキストの中身から辿って取り出す。 */
function renderedElement(props: Omit<TextProps, "children">): Element {
  render(<Text {...props}>content</Text>)
  const element = screen.getByText("content")
  return element
}

describe("Text", () => {
  it.each([
    ["label", "text-size-label"],
    ["action", "text-size-action"],
    ["secondary", "text-size-secondary"],
    ["subheading", "text-size-subheading"],
    ["body", "text-size-body"],
    ["heading", "text-size-heading"],
  ] as const)("size: %s は class %s を付ける", (size, expectedClass) => {
    const element = renderedElement({ ...BASE_PROPS, size })
    expect(element.className.split(" ")).toContain(expectedClass)
  })

  it.each([
    ["ink", "text-tone-ink"],
    ["ink-quiet", "text-tone-ink-quiet"],
    ["accent", "text-tone-accent"],
    ["state-ok", "text-tone-state-ok"],
    ["state-warn", "text-tone-state-warn"],
    ["state-ng", "text-tone-state-ng"],
    ["state-ask", "text-tone-state-ask"],
  ] as const)("tone: %s は class %s を付ける", (tone, expectedClass) => {
    const element = renderedElement({ ...BASE_PROPS, tone })
    expect(element.className.split(" ")).toContain(expectedClass)
  })

  it.each([
    ["normal", "text-weight-normal"],
    ["semibold", "text-weight-semibold"],
    ["bold", "text-weight-bold"],
  ] as const)("weight: %s は class %s を付ける", (weight, expectedClass) => {
    const element = renderedElement({ ...BASE_PROPS, weight })
    expect(element.className.split(" ")).toContain(expectedClass)
  })

  it("size: inherit は class を付けない", () => {
    const element = renderedElement({ ...BASE_PROPS, size: "inherit" })
    expect(element.className.split(" ").some((name) => name.includes("text-size"))).toBe(false)
  })

  it("tone: inherit は class を付けない", () => {
    const element = renderedElement({ ...BASE_PROPS, tone: "inherit" })
    expect(element.className.split(" ").some((name) => name.includes("text-tone"))).toBe(false)
  })

  it("weight: inherit は class を付けない", () => {
    const element = renderedElement({ ...BASE_PROPS, weight: "inherit" })
    expect(element.className.split(" ").some((name) => name.includes("text-weight"))).toBe(false)
  })

  it.each([
    ["p", "P"],
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
