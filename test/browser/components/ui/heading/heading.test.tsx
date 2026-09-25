import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, render, screen } from "@testing-library/react"

import {
  Heading,
  type HeadingProps,
} from "../../../../../src/browser/components/ui/heading/heading.tsx"

afterEach(() => {
  cleanup()
})

const BASE_PROPS = {
  level: 2,
  size: "body",
  tone: "ink",
  weight: "normal",
  className: "",
} satisfies Omit<HeadingProps, "children">

/** `Heading` が描く要素を、テキストの中身から辿って取り出す。 */
function renderedElement(props: Omit<HeadingProps, "children">): Element {
  render(<Heading {...props}>content</Heading>)
  const element = screen.getByText("content")
  return element
}

describe("Heading", () => {
  it.each([
    [1, "H1"],
    [2, "H2"],
    [3, "H3"],
    [4, "H4"],
  ] as const)("level: %s は %s を描く", (level, tagName) => {
    const element = renderedElement({ ...BASE_PROPS, level })
    expect(element.tagName).toBe(tagName)
  })

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

  it("tone: inherit は class を付けない", () => {
    const element = renderedElement({ ...BASE_PROPS, tone: "inherit" })
    expect(element.className.split(" ").some((name) => name.includes("text-tone"))).toBe(false)
  })

  it("className が足される", () => {
    const element = renderedElement({ ...BASE_PROPS, className: "dummy-extra" })
    expect(element.className.split(" ")).toContain("dummy-extra")
  })
})
