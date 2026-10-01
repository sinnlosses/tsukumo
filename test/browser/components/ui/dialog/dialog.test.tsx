import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  Dialog,
  type DialogProps,
} from "../../../../../src/browser/components/ui/dialog/dialog.tsx"

afterEach(() => {
  cleanup()
})

const BASE_PROPS = {
  open: true,
  name: { kind: "label", label: "架空のダイアログ" },
  backdrop: "dim",
  placement: { kind: "auto" },
  onClose: () => {},
  className: "",
} satisfies Omit<DialogProps, "children">

function renderDialog(props: Omit<DialogProps, "children">): HTMLDialogElement {
  render(
    <Dialog {...props}>
      <button type="button">中身</button>
    </Dialog>,
  )
  const dialog = document.querySelector("dialog")
  if (dialog === null) {
    throw new Error("<dialog> が無い")
  }
  return dialog
}

describe("Dialog", () => {
  it("open: true で開き、false で閉じる", () => {
    const { rerender } = render(
      <Dialog {...BASE_PROPS} open={false}>
        <button type="button">中身</button>
      </Dialog>,
    )
    const dialog = document.querySelector("dialog")
    if (dialog === null) {
      throw new Error("<dialog> が無い")
    }
    expect(dialog.hasAttribute("open")).toBe(false)

    rerender(
      <Dialog {...BASE_PROPS} open={true}>
        <button type="button">中身</button>
      </Dialog>,
    )
    expect(dialog.hasAttribute("open")).toBe(true)
  })

  it("Esc（<dialog> の close イベント）で onClose を呼ぶ", () => {
    const onClose = vi.fn(() => {})
    const dialog = renderDialog({ ...BASE_PROPS, onClose })
    fireEvent(dialog, new Event("close"))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("外側（backdrop）のクリックで onClose を呼ぶ", () => {
    const onClose = vi.fn(() => {})
    const dialog = renderDialog({ ...BASE_PROPS, onClose })
    fireEvent.click(dialog)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("中のクリックでは onClose を呼ばない", () => {
    const onClose = vi.fn(() => {})
    const dialog = renderDialog({ ...BASE_PROPS, onClose })
    const button = dialog.querySelector("button")
    if (button === null) {
      throw new Error("中身が無い")
    }
    fireEvent.click(button)
    expect(onClose).not.toHaveBeenCalled()
  })

  it("backdrop は対応表の class を付ける", () => {
    const dialog = renderDialog({ ...BASE_PROPS, backdrop: "deep" })
    expect(dialog.className.split(" ")).toContain("dialog-backdrop-deep")
  })

  it('placement: "at" は top/left を inline style に置く', () => {
    const dialog = renderDialog({
      ...BASE_PROPS,
      placement: { kind: "at", top: 120, left: 40 },
    })
    expect(dialog.style.top).toBe("120px")
    expect(dialog.style.left).toBe("40px")
  })

  it("className が足される", () => {
    const dialog = renderDialog({ ...BASE_PROPS, className: "dummy-extra" })
    expect(dialog.className.split(" ")).toContain("dummy-extra")
  })
})
