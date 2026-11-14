import { renderHook } from "@testing-library/react"
import { createRef } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { isOverlayOpen } from "../../../src/browser/hooks/open-overlay.ts"
import { useDismissSignal } from "../../../src/browser/hooks/use-dismiss-signal.ts"

afterEach(() => {
  vi.restoreAllMocks()
})

function mountRoot(): { readonly root: HTMLElement; readonly inside: HTMLElement } {
  const root = document.createElement("div")
  const inside = document.createElement("button")
  root.append(inside)
  document.body.append(root)
  return { root, inside }
}

describe("useDismissSignal", () => {
  it("開いているあいだだけ、外での pointerdown と Esc で閉じる合図を出し、面の登録も開いているあいだだけ", () => {
    const { root, inside } = mountRoot()
    const rootRef = createRef<HTMLElement>()
    rootRef.current = root
    const onDismiss = vi.fn<(cause: string) => void>()
    const view = renderHook(
      ({ open }) => {
        useDismissSignal({ open, rootRef, onDismiss })
      },
      { initialProps: { open: false } },
    )
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }))
    expect(onDismiss).not.toHaveBeenCalled()
    expect(isOverlayOpen()).toBe(false)

    view.rerender({ open: true })
    expect(isOverlayOpen()).toBe(true)
    inside.dispatchEvent(new Event("pointerdown", { bubbles: true }))
    expect(onDismiss).not.toHaveBeenCalled()
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }))
    expect(onDismiss).toHaveBeenLastCalledWith("outside")
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
    expect(onDismiss).toHaveBeenLastCalledWith("escape")
    expect(onDismiss).toHaveBeenCalledTimes(2)

    view.rerender({ open: false })
    expect(isOverlayOpen()).toBe(false)
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
    expect(onDismiss).toHaveBeenCalledTimes(2)
    root.remove()
  })

  it("onDismiss が変わっても張り直さず、最新の onDismiss が呼ばれる", () => {
    const rootRef = createRef<HTMLElement>()
    const add = vi.spyOn(document, "addEventListener")
    const remove = vi.spyOn(document, "removeEventListener")
    const first = vi.fn<(cause: string) => void>()
    const second = vi.fn<(cause: string) => void>()
    const view = renderHook(
      ({ onDismiss }) => {
        useDismissSignal({ open: true, rootRef, onDismiss })
      },
      { initialProps: { onDismiss: first } },
    )
    const added = add.mock.calls.length
    view.rerender({ onDismiss: second })
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledWith("escape")
    expect(add.mock.calls.length).toBe(added)
    expect(remove).not.toHaveBeenCalled()
    view.unmount()
    expect(isOverlayOpen()).toBe(false)
  })
})
