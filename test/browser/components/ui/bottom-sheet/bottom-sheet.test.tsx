import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  BottomSheet,
  type BottomSheetProps,
} from "../../../../../src/browser/components/ui/bottom-sheet/bottom-sheet.tsx"

afterEach(() => {
  cleanup()
})

const BASE_PROPS = {
  open: true,
  contentKey: "a",
  ariaLabel: "架空の板",
  onClose: () => {},
  header: <span>架空の頭</span>,
  footer: { kind: "none" },
} satisfies Omit<BottomSheetProps, "children">

function renderSheet(props: Omit<BottomSheetProps, "children">): HTMLDialogElement {
  render(
    <BottomSheet {...props}>
      <p>架空の中身</p>
    </BottomSheet>,
  )
  const dialog = document.querySelector("dialog")
  if (dialog === null) {
    throw new Error("<dialog> が無い")
  }
  return dialog
}

function grip(): HTMLElement {
  const element = document.querySelector<HTMLElement>("[data-bottom-sheet-grip]")
  if (element === null) {
    throw new Error("つまみが無い")
  }
  return element
}

describe("BottomSheet", () => {
  it("開いているあいだだけ頭・中身を描き、閉じると描かない", () => {
    const { rerender } = render(
      <BottomSheet {...BASE_PROPS} open={false}>
        <p>架空の中身</p>
      </BottomSheet>,
    )
    expect(document.body.textContent).not.toContain("架空の中身")

    rerender(
      <BottomSheet {...BASE_PROPS} open={true}>
        <p>架空の中身</p>
      </BottomSheet>,
    )
    expect(document.body.textContent).toContain("架空の頭")
    expect(document.body.textContent).toContain("架空の中身")
  })

  it("Esc（<dialog> の close イベント）で onClose を呼ぶ", () => {
    const onClose = vi.fn(() => {})
    const dialog = renderSheet({ ...BASE_PROPS, onClose })
    fireEvent(dialog, new Event("close"))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("覆い（<dialog> 自身へのクリック）で onClose を呼び、中身へのクリックでは呼ばない", () => {
    const onClose = vi.fn(() => {})
    const dialog = renderSheet({ ...BASE_PROPS, onClose })
    fireEvent.click(document.querySelector("p") ?? dialog)
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(dialog)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("つまみを一定以上下へ払うと onClose を呼び、わずかな動きでは呼ばない", () => {
    const onClose = vi.fn(() => {})
    renderSheet({ ...BASE_PROPS, onClose })
    const element = grip()
    element.setPointerCapture = () => {}

    fireEvent.pointerDown(element, { clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(element, { clientY: 110, pointerId: 1 })
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.pointerMove(element, { clientY: 160, pointerId: 1 })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("下端の口は shown のときだけ描く", () => {
    renderSheet({ ...BASE_PROPS, footer: { kind: "shown", node: <button>架空の下端</button> } })
    expect(document.body.textContent).toContain("架空の下端")
    cleanup()
    renderSheet(BASE_PROPS)
    expect(document.body.textContent).not.toContain("架空の下端")
  })
})
