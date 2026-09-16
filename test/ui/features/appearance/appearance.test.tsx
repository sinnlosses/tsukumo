import { afterEach, beforeEach, describe, expect, it } from "bun:test"

import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { INITIAL_SESSION_STATE } from "../../../../src/protocol/session-state.ts"
import { Appearance } from "../../../../src/ui/features/appearance/appearance.tsx"
import { SessionContext, type SessionContextValue } from "../../../../src/ui/stores/session.tsx"

const COLOR_STORAGE_KEY = "tsukumo-appearance-color"
const PORTRAIT_STORAGE_KEY = "tsukumo-portrait-fixed"

let themeStyleElement: HTMLStyleElement | undefined

beforeEach(() => {
  localStorage.removeItem(COLOR_STORAGE_KEY)
  localStorage.removeItem(PORTRAIT_STORAGE_KEY)
  document.documentElement.style.removeProperty("--ground")
  document.documentElement.style.removeProperty("--surface")
  document.documentElement.style.removeProperty("--ink")
  themeStyleElement = document.createElement("style")
  themeStyleElement.textContent =
    ":root { --ground: #191720; --surface: #221f2b; --ink: #e8e3ea; --accent: #f2b0a0; }"
  document.head.appendChild(themeStyleElement)
})

afterEach(() => {
  cleanup()
  localStorage.removeItem(COLOR_STORAGE_KEY)
  localStorage.removeItem(PORTRAIT_STORAGE_KEY)
  document.documentElement.style.removeProperty("--ground")
  document.documentElement.style.removeProperty("--surface")
  document.documentElement.style.removeProperty("--ink")
  themeStyleElement?.remove()
  themeStyleElement = undefined
})

/** 引き出しを開く。閉じている `<dialog>` の中身はアクセシビリティツリーから外れるため、
 * 中の部品を操作するテストは先にこれを呼ぶ。 */
function openDrawer(): void {
  fireEvent.click(screen.getByRole("button", { name: "見た目" }))
}

/**
 * 引き出しを描く。中の `<CharacterEdit>` が `SessionContext` を読むので、`<App>` を経由せず
 * 値を差し込む（`src/ui/stores/session.tsx` が Context 自体を公開している）。**キャラクターが届いて
 * いない状態**を既定にしてあるので、ここの各テストは色と立ち絵の固定だけを見る。
 */
function renderAppearance(onResetSplit: () => void = () => {}): void {
  const value: SessionContextValue = {
    state: INITIAL_SESSION_STATE,
    connection: "open",
    dispatch: () => {},
  }
  render(
    <SessionContext.Provider value={value}>
      <Appearance onResetSplit={onResetSplit} />
    </SessionContext.Provider>,
  )
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

  it("色を変えると documentElement に反映し、localStorage に残る", () => {
    renderAppearance()
    openDrawer()

    const groundInput = screen.getByLabelText("画面の地") as HTMLInputElement
    fireEvent.change(groundInput, { target: { value: "#101010" } })

    expect(getComputedStyle(document.documentElement).getPropertyValue("--ground").trim()).toBe(
      "#101010",
    )
    expect(JSON.parse(localStorage.getItem(COLOR_STORAGE_KEY) ?? "{}")).toEqual({
      ground: "#101010",
      surface: undefined,
      ink: undefined,
    })
  })

  it("ground を ink と同じ色にしようとすると受け取らず、既定へ落ちる", () => {
    renderAppearance()
    openDrawer()

    const groundInput = screen.getByLabelText("画面の地") as HTMLInputElement
    // 疑似 :root の --ink は #e8e3ea。同じ値にしようとする。
    fireEvent.change(groundInput, { target: { value: "#e8e3ea" } })

    expect(getComputedStyle(document.documentElement).getPropertyValue("--ground").trim()).toBe(
      "#191720",
    )
    expect(JSON.parse(localStorage.getItem(COLOR_STORAGE_KEY) ?? "{}")).toEqual({
      ground: undefined,
      surface: undefined,
      ink: undefined,
    })
  })

  it("立ち絵の固定を切り替えると localStorage に残る", () => {
    renderAppearance()
    openDrawer()

    const checkbox = screen.getByLabelText("立ち絵の位置を固定する") as HTMLInputElement
    expect(checkbox.checked).toBe(false)

    fireEvent.click(checkbox)

    expect(checkbox.checked).toBe(true)
    expect(localStorage.getItem(PORTRAIT_STORAGE_KEY)).toBe("true")
  })

  it("比率を既定に戻すボタンは props の onResetSplit を呼ぶ", () => {
    let calls = 0
    renderAppearance(() => (calls += 1))
    openDrawer()

    fireEvent.click(screen.getByRole("button", { name: "領域の比率を既定に戻す" }))

    expect(calls).toBe(1)
  })
})
