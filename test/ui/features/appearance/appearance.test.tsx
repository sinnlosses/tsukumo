import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { Appearance } from "../../../../src/ui/features/appearance/appearance.tsx"

afterEach(() => {
  cleanup()
})

/**
 * 引き出しを描く。**中身は「領域の比率を既定に戻す」だけ**になったので、`SessionContext` は
 * 要らない（画面の色・立ち絵・差し色・作る口はキャラクター画面へ移した。docs/design.md 13.6）。
 */
function renderAppearance(onResetSplit: () => void = () => {}): void {
  render(<Appearance onResetSplit={onResetSplit} />)
}

describe("Appearance", () => {
  it("開く口だけが最初から見え、押すと引き出しが開く", () => {
    renderAppearance()

    const trigger = screen.getByRole("button", { name: "見た目" })
    const dialog = document.querySelector("dialog.appearance-drawer") as HTMLDialogElement
    expect(dialog.open).toBe(false)

    fireEvent.click(trigger)

    expect(dialog.open).toBe(true)
  })

  it("比率を既定に戻すボタンは props の onResetSplit を呼ぶ", () => {
    let calls = 0
    renderAppearance(() => (calls += 1))
    fireEvent.click(screen.getByRole("button", { name: "見た目" }))

    fireEvent.click(screen.getByRole("button", { name: "領域の比率を既定に戻す" }))

    expect(calls).toBe(1)
  })
})
