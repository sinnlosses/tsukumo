import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  Popover,
  type PopoverProps,
} from "../../../../../src/browser/components/ui/popover/popover.tsx"
import { isOverlayOpen } from "../../../../../src/browser/hooks/open-overlay.ts"

afterEach(() => {
  cleanup()
  document.body.replaceChildren()
})

function anchorButton(): HTMLButtonElement {
  const button = document.createElement("button")
  button.type = "button"
  button.textContent = "口"
  document.body.append(button)
  return button
}

function popoverProps(element: HTMLElement, overrides: Partial<PopoverProps>): PopoverProps {
  return {
    open: true,
    anchorRef: { current: element },
    ariaLabel: "架空の面",
    width: 200,
    placement: { kind: "below", alignment: "start" },
    onClose: () => {},
    className: "",
    children: <p>中身</p>,
    ...overrides,
  }
}

describe("Popover", () => {
  it("開いているあいだだけ重なりを登録し、閉じると解く", () => {
    const anchor = anchorButton()
    const { rerender } = render(<Popover {...popoverProps(anchor, { open: false })} />)
    expect(isOverlayOpen()).toBe(false)

    rerender(<Popover {...popoverProps(anchor, { open: true })} />)
    expect(isOverlayOpen()).toBe(true)

    rerender(<Popover {...popoverProps(anchor, { open: false })} />)
    expect(isOverlayOpen()).toBe(false)
  })

  it("口と面の外で押すと onClose を呼び、口と面の中では呼ばない", () => {
    const anchor = anchorButton()
    const onClose = vi.fn<() => void>()
    const { getByText } = render(<Popover {...popoverProps(anchor, { onClose })} />)

    fireEvent.pointerDown(anchor)
    fireEvent.pointerDown(getByText("中身"))
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.pointerDown(document.body)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
