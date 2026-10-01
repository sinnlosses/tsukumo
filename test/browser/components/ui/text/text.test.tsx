import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

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
  it("size・tone・weight は対応表の class を付ける", () => {
    const element = renderedElement({
      ...BASE_PROPS,
      size: "heading",
      tone: "accent",
      weight: "bold",
    })
    expect(element.className.split(" ")).toEqual(
      expect.arrayContaining(["text-size-heading", "text-tone-accent", "text-weight-bold"]),
    )
  })

  it("inherit は size・tone・weight の class を付けない", () => {
    const element = renderedElement({
      ...BASE_PROPS,
      size: "inherit",
      tone: "inherit",
      weight: "inherit",
    })
    const classNames = element.className.split(" ")
    expect(classNames.some((name) => /^text-(size|tone|weight)-/.test(name))).toBe(false)
  })

  it("element で描く要素を選ぶ", () => {
    const element = renderedElement({ ...BASE_PROPS, element: "summary" })
    expect(element.tagName).toBe("SUMMARY")
  })

  it("className が足される", () => {
    const element = renderedElement({ ...BASE_PROPS, className: "dummy-extra" })
    expect(element.className.split(" ")).toContain("dummy-extra")
  })
})
