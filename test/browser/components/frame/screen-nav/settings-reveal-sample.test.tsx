import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ScreenNav } from "../../../../../src/browser/components/frame/screen-nav/screen-nav.tsx"
import { useNavDrawer } from "../../../../../src/browser/stores/nav-drawer.ts"
import { INITIAL_SESSION_STATE } from "../../../../../src/shared/session/session-state.ts"
import { typedElement } from "../../../../typed-element.ts"
import { EMPTY_NAV_DRAWER_SLOTS } from "../../../nav-drawer-slot.tsx"
import { stubPhoneWidth } from "../../../phone-width.ts"
import { queryClientWrapper } from "../../../query-client.tsx"
import { putSession } from "../../../session-store.ts"

// 設定の「演出」の面の頭の見本（吹き出しの文と、書き上げ）。
// 動きを減らす設定は OS の `prefers-reduced-motion`（`matchMedia` が真）で立てる。

const FAKE_LINE = "これは架空の一言です。もう少し続きます。"

beforeEach(() => {
  stubPhoneWidth(true)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  useNavDrawer.setState(useNavDrawer.getInitialState(), true)
  window.location.hash = ""
})

function openedReveal(speech?: string): HTMLElement {
  putSession(
    {
      ...INITIAL_SESSION_STATE,
      speeches:
        speech === undefined
          ? []
          : [{ text: speech, expression: "default", time: { kind: "stamped", at: 0 } }],
    },
    () => undefined,
  )
  render(<ScreenNav drawer={EMPTY_NAV_DRAWER_SLOTS} />, { wrapper: queryClientWrapper() })
  fireEvent.click(
    typedElement(
      document.querySelector(".screen-nav > .screen-nav-settings .screen-nav-settings-toggle"),
      HTMLElement,
      "帯の歯車",
    ),
  )
  const dialog = screen.getByRole("dialog", { name: "設定" })
  fireEvent.click(within(dialog).getByRole("button", { name: "演出" }))
  return dialog
}

function bubbleText(dialog: HTMLElement): string {
  return typedElement(dialog.querySelector("[class*='bubble']"), HTMLElement, "吹き出し")
    .textContent
}

describe("演出の見本", () => {
  it("キャラクターがまだ何も言っていないときは、口調を持たない中立の文を出す", () => {
    const dialog = openedReveal()

    expect(bubbleText(dialog)).toContain("書き上がっていく様子を見せます。")
    expect(bubbleText(dialog)).not.toContain(FAKE_LINE)
  })

  it("動きを減らす設定が効いていると、最後のセリフの全文がすぐ出る", () => {
    const dialog = openedReveal(FAKE_LINE)

    expect(bubbleText(dialog)).toBe(FAKE_LINE)
  })

  it("動きを減らさないときは、最初の塊の前は空で、間隔ごとに塊が増える", () => {
    vi.useFakeTimers()
    stubPhoneWidth(false)
    const dialog = openedReveal(FAKE_LINE)

    expect(bubbleText(dialog)).toBe("")
    act(() => {
      vi.advanceTimersByTime(240)
    })

    expect(bubbleText(dialog)).toBe("これは架空の一言です。")
  })
})
