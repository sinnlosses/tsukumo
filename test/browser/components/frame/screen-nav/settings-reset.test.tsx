import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ScreenNav } from "../../../../../src/browser/components/frame/screen-nav/screen-nav.tsx"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../src/shared/session/session-state.ts"
import { typedElement } from "../../../../typed-element.ts"
import { EMPTY_NAV_DRAWER_SLOTS } from "../../../nav-drawer-slot.tsx"
import { stubPhoneWidth } from "../../../phone-width.ts"
import { queryClientWrapper } from "../../../query-client.tsx"
import { putSession, type CommandSpy } from "../../../session-store.ts"

// 設定のダイアログの下の帯の「このページを既定に戻す」。開いているページの項目だけを戻す。

const COLOR_STORAGE_KEY = "tsukumo-appearance-color:v1"
const COLOR_TOKENS = ["--ground", "--surface", "--ink"] as const

let themeStyleElement: HTMLStyleElement | undefined

beforeEach(() => {
  stubPhoneWidth(true)
  localStorage.removeItem(COLOR_STORAGE_KEY)
  themeStyleElement = document.createElement("style")
  themeStyleElement.textContent =
    ":root { --ground: #191720; --surface: #221f2b; --ink: #e8e3ea; --accent: #f2b0a0; }"
  document.head.appendChild(themeStyleElement)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  localStorage.removeItem(COLOR_STORAGE_KEY)
  for (const token of COLOR_TOKENS) {
    document.documentElement.style.removeProperty(token)
  }
  themeStyleElement?.remove()
  themeStyleElement = undefined
  window.location.hash = ""
})

function renderScreenNav(state: Partial<SessionState> = {}, spy: CommandSpy = () => {}): void {
  putSession({ ...INITIAL_SESSION_STATE, ...state }, spy)
  render(<ScreenNav drawer={EMPTY_NAV_DRAWER_SLOTS} />, { wrapper: queryClientWrapper() })
}

function openGear(): void {
  fireEvent.click(
    typedElement(
      document.querySelector(".screen-nav > .screen-nav-settings .screen-nav-settings-toggle"),
      HTMLElement,
      "帯の歯車",
    ),
  )
}

function dialog(): HTMLElement {
  return screen.getByRole("dialog", { name: "設定" })
}

function showFace(name: string): void {
  fireEvent.click(within(dialog()).getByRole("button", { name }))
}

function resetButton(): HTMLElement {
  return within(dialog()).getByRole("button", { name: /^このページを既定に戻す/u })
}

function groundInput(): HTMLInputElement {
  const label = typedElement(
    [...dialog().querySelectorAll("label")].find((node) => node.textContent === "地の色"),
    HTMLLabelElement,
    "ラベル「地の色」",
  )
  return typedElement(document.getElementById(label.htmlFor), HTMLInputElement, "地の色の入力欄")
}

function readToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

describe("設定の「既定に戻す」（ページごと）", () => {
  it("見た目のページは、変えていなければ件数0で押せない", () => {
    renderScreenNav()
    openGear()

    expect(resetButton().textContent).toBe("このページを既定に戻す（0件）")
    expect(resetButton().getAttribute("aria-disabled")).toBe("true")
  })

  it("見た目のページで押すと3色とも上書きが外れ、操作子も既定を指す", async () => {
    renderScreenNav()
    openGear()

    fireEvent.change(groundInput(), { target: { value: "#101010" } })
    expect(resetButton().textContent).toBe("このページを既定に戻す（1件）")

    fireEvent.click(resetButton())

    expect(readToken("--ground")).toBe("#191720")
    expect(groundInput().value).toBe("#191720")
    await vi.waitFor(() => {
      expect(JSON.parse(localStorage.getItem(COLOR_STORAGE_KEY) ?? "{}")).toEqual({
        ground: undefined,
        surface: undefined,
        ink: undefined,
      })
    })
  })

  it("セッションの既定のページで押すとモデルが戻り、見た目の色は戻らない", () => {
    const sent: unknown[] = []
    renderScreenNav(
      {
        sessionDefault: {
          model: "sonnet",
          effort: "medium",
          permissionMode: "auto",
          figurePreference: "chart",
        },
      },
      (command) => sent.push(command),
    )
    openGear()
    fireEvent.change(groundInput(), { target: { value: "#101010" } })
    showFace("セッションの既定")

    expect(resetButton().textContent).toBe("このページを既定に戻す（1件）")
    fireEvent.click(resetButton())

    expect(sent).toContainEqual({
      procedure: "session.setSessionDefault",
      model: "opus",
      effort: "medium",
      permissionMode: "auto",
      figurePreference: "chart",
    })
    expect(readToken("--ground")).toBe("#101010")
  })

  it("変えていないページは、ほかのページで色を変えていても件数0で押せない", () => {
    renderScreenNav()
    openGear()
    fireEvent.change(groundInput(), { target: { value: "#101010" } })
    showFace("タスクの実行")

    expect(resetButton().textContent).toBe("このページを既定に戻す（0件）")
    expect(resetButton().getAttribute("aria-disabled")).toBe("true")
  })
})
