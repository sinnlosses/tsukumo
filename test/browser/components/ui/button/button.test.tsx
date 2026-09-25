import { afterEach, describe, expect, it, mock } from "bun:test"

import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import {
  Button,
  type ButtonProps,
} from "../../../../../src/browser/components/ui/button/button.tsx"

afterEach(() => {
  cleanup()
})

const BASE_PROPS = {
  type: "button",
  variant: "outline",
  size: "secondary",
  pressed: "none",
  disabled: false,
  ariaLabel: undefined,
  ariaHasPopup: undefined,
  title: undefined,
  className: "",
  onClick: () => {},
} satisfies Omit<ButtonProps, "children">

function renderButton(props: Omit<ButtonProps, "children">): HTMLElement {
  render(<Button {...props}>content</Button>)
  return screen.getByRole("button")
}

describe("Button", () => {
  it.each([
    ["outline", "button-variant-outline"],
    ["outline-accent", "button-variant-outline-accent"],
    ["outline-warn", "button-variant-outline-warn"],
    ["solid-accent", "button-variant-solid-accent"],
    ["solid-danger", "button-variant-solid-danger"],
    ["solid-warn", "button-variant-solid-warn"],
    ["ghost", "button-variant-ghost"],
    ["link", "button-variant-link"],
  ] as const)("variant: %s は class %s を付ける", (variant, expectedClass) => {
    const element = renderButton({ ...BASE_PROPS, variant })
    expect(element.className.split(" ")).toContain(expectedClass)
  })

  it.each([
    ["label", "text-size-label"],
    ["action", "text-size-action"],
    ["secondary", "text-size-secondary"],
    ["subheading", "text-size-subheading"],
    ["body", "text-size-body"],
  ] as const)("size: %s は class %s を付ける", (size, expectedClass) => {
    const element = renderButton({ ...BASE_PROPS, size })
    expect(element.className.split(" ")).toContain(expectedClass)
  })

  it.each([
    ["button", "button"],
    ["submit", "submit"],
  ] as const)("type: %s は type=%s を付ける", (type, expected) => {
    const element = renderButton({ ...BASE_PROPS, type })
    expect(element.getAttribute("type")).toBe(expected)
  })

  it("押すと onClick を呼ぶ", () => {
    const onClick = mock(() => {})
    const element = renderButton({ ...BASE_PROPS, onClick })
    fireEvent.click(element)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('disabled のときは押しても onClick を呼ばず、aria-disabled="true" が付く', () => {
    const onClick = mock(() => {})
    const element = renderButton({ ...BASE_PROPS, disabled: true, onClick })
    expect(element.getAttribute("aria-disabled")).toBe("true")
    fireEvent.click(element)
    expect(onClick).not.toHaveBeenCalled()
  })

  it("disabled=false は native の disabled 属性を持たず、フォーカスできる", () => {
    const element = renderButton({ ...BASE_PROPS, disabled: false })
    expect(element).not.toHaveProperty("disabled", true)
    expect(element.hasAttribute("disabled")).toBe(false)
  })

  it("disabled=true でも native の disabled 属性は付かない（フォーカスは残る）", () => {
    const element = renderButton({ ...BASE_PROPS, disabled: true })
    expect(element.hasAttribute("disabled")).toBe(false)
    element.focus()
    expect(document.activeElement).toBe(element)
  })

  it.each([
    ["none", null],
    ["on", "true"],
    ["off", "false"],
  ] as const)("pressed: %s は aria-pressed=%s", (pressed, expected) => {
    const element = renderButton({ ...BASE_PROPS, pressed })
    expect(element.getAttribute("aria-pressed")).toBe(expected)
  })

  it("ariaLabel が付く", () => {
    const element = renderButton({ ...BASE_PROPS, ariaLabel: "この画像を外す" })
    expect(element.getAttribute("aria-label")).toBe("この画像を外す")
  })

  it("ariaHasPopup が付く", () => {
    const element = renderButton({ ...BASE_PROPS, ariaHasPopup: "dialog" })
    expect(element.getAttribute("aria-haspopup")).toBe("dialog")
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
