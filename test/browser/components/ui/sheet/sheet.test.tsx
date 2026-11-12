import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { useState, type ReactElement } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { Sheet, type SheetProps } from "../../../../../src/browser/components/ui/sheet/sheet.tsx"

afterEach(() => {
  cleanup()
})

const BASE_PROPS = {
  open: true,
  title: "架空の紙",
  sub: { kind: "none" },
  flush: false,
  onClose: () => {},
} satisfies Omit<SheetProps, "children">

function renderSheet(props: Omit<SheetProps, "children">): void {
  render(
    <Sheet {...props}>
      <p>架空の本文</p>
    </Sheet>,
  )
}

describe("Sheet", () => {
  it("開いているあいだだけ見出しと本文を描く", () => {
    const { rerender } = render(
      <Sheet {...BASE_PROPS} open={false}>
        <p>架空の本文</p>
      </Sheet>,
    )
    expect(document.body.textContent).not.toContain("架空の本文")

    rerender(
      <Sheet {...BASE_PROPS}>
        <p>架空の本文</p>
      </Sheet>,
    )
    expect(document.body.textContent).toContain("架空の紙")
    expect(document.body.textContent).toContain("架空の本文")
  })

  it("Esc で onClose を呼ぶ", () => {
    const onClose = vi.fn<() => void>()
    renderSheet({ ...BASE_PROPS, onClose })
    fireEvent.keyDown(document, { key: "Escape" })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("閉じるを押すと onClose を呼ぶ", () => {
    const onClose = vi.fn<() => void>()
    renderSheet({ ...BASE_PROPS, onClose })
    fireEvent.click(screen.getByRole("button", { name: /閉じる/, hidden: true }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("閉じたら、開く前にフォーカスのあった入口へフォーカスを戻す", () => {
    function Host(): ReactElement {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            入口
          </button>
          <Sheet {...BASE_PROPS} open={open} onClose={() => setOpen(false)}>
            <p>架空の本文</p>
          </Sheet>
        </>
      )
    }
    render(<Host />)
    const entrance = screen.getByRole("button", { name: "入口" })
    entrance.focus()
    fireEvent.click(entrance)
    expect(document.body.textContent).toContain("架空の本文")
    fireEvent.keyDown(document, { key: "Escape" })
    return vi.waitFor(() => {
      expect(document.activeElement).toBe(entrance)
    })
  })
})
