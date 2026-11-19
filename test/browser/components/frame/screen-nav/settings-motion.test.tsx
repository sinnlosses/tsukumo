import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ScreenNav } from "../../../../../src/browser/components/frame/screen-nav/screen-nav.tsx"
import { INITIAL_SESSION_STATE } from "../../../../../src/shared/session/session-state.ts"
import { typedElement } from "../../../../typed-element.ts"
import { EMPTY_NAV_DRAWER_SLOTS } from "../../../nav-drawer-slot.tsx"
import { queryClientWrapper } from "../../../query-client.tsx"
import { putSession } from "../../../session-store.ts"

// 設定の「演出」の面の「動き」。OS の設定とは別に、tsukumo だけ動きを減らせる。

const MOTION_STORAGE_KEY = "tsukumo-motion-preference:v1"

/** OS は動きを減らさない（`prefers-reduced-motion` だけ偽）。 */
function stubOsNotReducing(): void {
  vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
    matches: !query.includes("prefers-reduced-motion"),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }))
}

beforeEach(() => {
  stubOsNotReducing()
  localStorage.removeItem(MOTION_STORAGE_KEY)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  localStorage.removeItem(MOTION_STORAGE_KEY)
  delete document.documentElement.dataset["motion"]
})

function openMotionFace(): HTMLSelectElement {
  putSession(INITIAL_SESSION_STATE, () => undefined)
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
  return typedElement(
    dialog.querySelector("select[aria-label='動きを減らすか']"),
    HTMLSelectElement,
    "動きの select",
  )
}

describe("設定の「動き」", () => {
  it("「減らす」を選ぶと保存され、<html> に属性が付く", () => {
    const select = openMotionFace()

    fireEvent.change(select, { target: { value: "reduce" } })

    expect(localStorage.getItem(MOTION_STORAGE_KEY)).toBe("reduce")
    expect(document.documentElement.dataset["motion"]).toBe("reduce")
  })

  it("保存済みの選択が開いたときの値に出る", () => {
    localStorage.setItem(MOTION_STORAGE_KEY, "reduce")

    expect(openMotionFace().value).toBe("reduce")
  })

  it("「既定に戻す」で「OS の設定に従う」へ戻り、属性も外れる", () => {
    const select = openMotionFace()
    fireEvent.change(select, { target: { value: "reduce" } })

    fireEvent.click(
      within(screen.getByRole("dialog", { name: "設定" })).getByRole("button", {
        name: "既定に戻す",
      }),
    )

    expect(select.value).toBe("system")
    expect(localStorage.getItem(MOTION_STORAGE_KEY)).toBe("system")
    expect(document.documentElement.dataset["motion"]).toBeUndefined()
  })
})
