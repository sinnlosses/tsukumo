import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { ScreenNav } from "../../../../../src/browser/components/frame/screen-nav/screen-nav.tsx"
import { useNavDrawer } from "../../../../../src/browser/stores/nav-drawer.ts"
import { INITIAL_SESSION_STATE } from "../../../../../src/shared/session/session-state.ts"
import { typedElement } from "../../../../typed-element.ts"
import { EMPTY_NAV_DRAWER_SLOTS } from "../../../nav-drawer-slot.tsx"
import { stubPhoneWidth } from "../../../phone-width.ts"
import { queryClientWrapper } from "../../../query-client.tsx"
import { putSession } from "../../../session-store.ts"

// 設定の「見た目」の面のテーマの札と、畳んだ「カスタムの色」。

const COLOR_TOKENS = ["--ground", "--surface", "--ink"] as const

let themeStyleElement: HTMLStyleElement | undefined

beforeEach(() => {
  stubPhoneWidth(true)
  // `:root` の既定（readCurrentColor が jsdom の :root のスタイルを読むので、読む先を疑似的に用意する）。
  themeStyleElement = document.createElement("style")
  themeStyleElement.textContent = ":root { --ground: #191720; --surface: #221f2b; --ink: #e8e3ea; }"
  document.head.appendChild(themeStyleElement)
})

afterEach(() => {
  themeStyleElement?.remove()
  themeStyleElement = undefined
  cleanup()
  useNavDrawer.setState(useNavDrawer.getInitialState(), true)
  window.location.hash = ""
  localStorage.clear()
  for (const name of COLOR_TOKENS) {
    document.documentElement.style.removeProperty(name)
  }
})

function openLookFace(): HTMLElement {
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
  fireEvent.click(within(dialog).getByRole("button", { name: "見た目" }))
  return dialog
}

function customColors(dialog: HTMLElement): HTMLDetailsElement {
  return typedElement(dialog.querySelector("details"), HTMLDetailsElement, "カスタムの色")
}

function readToken(name: string): string {
  return document.documentElement.style.getPropertyValue(name)
}

describe("設定の見た目のテーマ", () => {
  it("札を押すと3色がその組になり、押した札が選んだ状態になる", () => {
    const dialog = openLookFace()
    const night = within(dialog).getByRole("button", { name: /^領域\s*夜/u })
    expect(night.getAttribute("aria-pressed")).toBe("true")

    const dusk = within(dialog).getByRole("button", { name: /^領域\s*宵/u })
    fireEvent.click(dusk)

    expect(readToken("--ground")).toBe("#141a26")
    expect(readToken("--surface")).toBe("#1d2534")
    expect(readToken("--ink")).toBe("#e2e8f2")
    expect(dusk.getAttribute("aria-pressed")).toBe("true")
    expect(night.getAttribute("aria-pressed")).toBe("false")
    expect(customColors(dialog).open).toBe(false)
  })

  it("どの組とも違う色にするとカスタムの色が開き、札はどれも選ばれない", () => {
    const dialog = openLookFace()
    expect(customColors(dialog).open).toBe(false)

    fireEvent.change(within(dialog).getByLabelText("地の色"), { target: { value: "#101010" } })

    expect(customColors(dialog).open).toBe(true)
    for (const preset of within(dialog).getAllByRole("button", { name: /^領域/u })) {
      expect(preset.getAttribute("aria-pressed")).toBe("false")
    }
  })

  it("初回の説明のボタンはナビの下端にあり、見た目の面には無い", () => {
    const dialog = openLookFace()

    const nav = within(dialog).getByRole("navigation", { name: "設定の項目" })
    expect(within(nav).getByRole("button", { name: "初回の説明をもう一度出す" })).toBeDefined()
    const face = within(dialog).getByRole("region", { name: "見た目" })
    expect(within(face).queryByRole("button", { name: "初回の説明をもう一度出す" })).toBeNull()
  })
})
