import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

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
  it("level で見出しの段の要素を描く", () => {
    const element = renderedElement({ ...BASE_PROPS, level: 3 })
    expect(element.tagName).toBe("H3")
  })

  it("size・tone・weight は Text と同じ表の class を付ける", () => {
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

  it("className が足される", () => {
    const element = renderedElement({ ...BASE_PROPS, className: "dummy-extra" })
    expect(element.className.split(" ")).toContain("dummy-extra")
  })
})
