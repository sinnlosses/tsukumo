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
  type: "button",
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
  it.each([
    ["outline", "button-variant-outline"],
    ["outline-dashed", "button-variant-outline-dashed"],
    ["outline-hover-warn", "button-variant-outline-hover-warn"],
    ["outline-hover-danger", "button-variant-outline-hover-danger"],
    ["outline-accent", "button-variant-outline-accent"],
    ["outline-accent-tinted", "button-variant-outline-accent-tinted"],
    ["tinted-accent", "button-variant-tinted-accent"],
    ["outline-warn", "button-variant-outline-warn"],
    ["outline-ground", "button-variant-outline-ground"],
    ["outline-surface", "button-variant-outline-surface"],
    ["outline-faint-ground", "button-variant-outline-faint-ground"],
    ["outline-ok-surface", "button-variant-outline-ok-surface"],
    ["outline-danger-surface", "button-variant-outline-danger-surface"],
    ["solid-accent", "button-variant-solid-accent"],
    ["solid-danger", "button-variant-solid-danger"],
    ["solid-warn", "button-variant-solid-warn"],
    ["ghost", "button-variant-ghost"],
    ["ghost-hover-accent", "button-variant-ghost-hover-accent"],
    ["ghost-hover-outline", "button-variant-ghost-hover-outline"],
    ["link", "button-variant-link"],
    ["text-accent", "button-variant-text-accent"],
    ["text-ink-hover-underline", "button-variant-text-ink-hover-underline"],
  ] as const)("variant: %s は class %s を付ける", (variant, expectedClass) => {
    const element = renderButton({ ...BASE_PROPS, variant })
    expect(element.className.split(" ")).toContain(expectedClass)
  })

  it("size は Text と同じ表の class を付ける", () => {
    const element = renderButton({ ...BASE_PROPS, size: "action" })
    expect(element.className.split(" ")).toContain("text-size-action")
  })

  it.each([
    ["button", "button"],
    ["submit", "submit"],
  ] as const)("type: %s は type=%s を付ける", (type, expected) => {
    const element = renderButton({ ...BASE_PROPS, type })
    expect(element.getAttribute("type")).toBe(expected)
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

  it("disclosure: none は aria-expanded と aria-controls を付けない", () => {
    const element = renderButton({ ...BASE_PROPS, disclosure: { kind: "none" } })
    expect(element.hasAttribute("aria-expanded")).toBe(false)
    expect(element.hasAttribute("aria-controls")).toBe(false)
  })

  it.each([
    [true, "true"],
    [false, "false"],
  ] as const)(
    "disclosure: expander（expanded=%s）は aria-expanded=%s だけを付ける",
    (expanded, expected) => {
      const element = renderButton({ ...BASE_PROPS, disclosure: { kind: "expander", expanded } })
      expect(element.getAttribute("aria-expanded")).toBe(expected)
      expect(element.hasAttribute("aria-controls")).toBe(false)
    },
  )

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
