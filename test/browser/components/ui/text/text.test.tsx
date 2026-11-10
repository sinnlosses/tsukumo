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
  it("size・tone・weight は Astryx の type・color・weight へ写る", () => {
    const element = renderedElement({
      ...BASE_PROPS,
      size: "heading",
      tone: "state-ok",
      weight: "bold",
    })
    expect(element.getAttribute("data-type")).toBe("large")
    expect(element.getAttribute("data-color")).toBe("state-ok")
  })

  it("inherit は type・color を inherit にする", () => {
    const element = renderedElement({
      ...BASE_PROPS,
      size: "inherit",
      tone: "inherit",
      weight: "inherit",
    })
    expect(element.getAttribute("data-type")).toBe("inherit")
    expect(element.getAttribute("data-color")).toBe("inherit")
  })

  it("element で描く要素を選ぶ", () => {
    expect(renderedElement({ ...BASE_PROPS, element: "p" }).tagName).toBe("P")
    cleanup()
    expect(renderedElement({ ...BASE_PROPS, element: "span" }).tagName).toBe("SPAN")
    cleanup()
    const inSummary = renderedElement({ ...BASE_PROPS, element: "summary", size: "heading" })
    expect(inSummary.parentElement?.tagName).toBe("SUMMARY")
    expect(inSummary.getAttribute("data-type")).toBe("large")
  })
})
