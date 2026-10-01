import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { createRef } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  Button,
  type ButtonProps,
} from "../../../../../src/browser/components/ui/button/button.tsx"

afterEach(() => {
  cleanup()
})

const BASE_PROPS = {
  variant: "outline",
  size: "secondary",
  pressed: "none",
  disabled: false,
  ariaLabel: undefined,
  ariaHasPopup: undefined,
  disclosure: { kind: "none" },
  title: undefined,
  className: "",
  onClick: () => {},
} satisfies Omit<ButtonProps, "children">

function renderButton(props: Omit<ButtonProps, "children">): HTMLElement {
  render(<Button {...props}>content</Button>)
  return screen.getByRole("button")
}

describe("Button", () => {
  it("variant は対応表の class を付ける", () => {
    const element = renderButton({ ...BASE_PROPS, variant: "solid-accent" })
    expect(element.className.split(" ")).toContain("button-variant-solid-accent")
  })

  it("size は Text と同じ表の class を付ける", () => {
    const element = renderButton({ ...BASE_PROPS, size: "action" })
    expect(element.className.split(" ")).toContain("text-size-action")
  })

  it("押すと onClick を呼ぶ", () => {
    const onClick = vi.fn(() => {})
    const element = renderButton({ ...BASE_PROPS, onClick })
    fireEvent.click(element)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('disabled のときは押しても onClick を呼ばず、aria-disabled="true" が付く', () => {
    const onClick = vi.fn(() => {})
    const element = renderButton({ ...BASE_PROPS, disabled: true, onClick })
    expect(element.getAttribute("aria-disabled")).toBe("true")
    fireEvent.click(element)
    expect(onClick).not.toHaveBeenCalled()
  })

  it("disabled=true でも native の disabled 属性は付かない（フォーカスは残る）", () => {
    const element = renderButton({ ...BASE_PROPS, disabled: true })
    expect(element.hasAttribute("disabled")).toBe(false)
    element.focus()
    expect(document.activeElement).toBe(element)
  })

  it("disclosure: expander は aria-expanded だけを付ける", () => {
    const element = renderButton({
      ...BASE_PROPS,
      disclosure: { kind: "expander", expanded: true },
    })
    expect(element.getAttribute("aria-expanded")).toBe("true")
    expect(element.hasAttribute("aria-controls")).toBe(false)
  })

  it("disclosure: popover は aria-expanded と aria-controls を付け、ref に button 要素を渡す", () => {
    const ref = createRef<HTMLButtonElement>()
    const element = renderButton({
      ...BASE_PROPS,
      disclosure: { kind: "popover", ref, expanded: true, controls: "dummy-panel" },
    })
    expect(element.getAttribute("aria-expanded")).toBe("true")
    expect(element.getAttribute("aria-controls")).toBe("dummy-panel")
    expect(ref.current).toBe(element)
  })

  it("title が付く", () => {
    const element = renderButton({ ...BASE_PROPS, title: "いま押せない理由" })
    expect(element.getAttribute("title")).toBe("いま押せない理由")
  })

  it("className が足される", () => {
    const element = renderButton({ ...BASE_PROPS, className: "dummy-extra" })
    expect(element.className.split(" ")).toContain("dummy-extra")
  })
})
