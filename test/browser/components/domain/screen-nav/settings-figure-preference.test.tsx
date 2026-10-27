import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { ScreenNav } from "../../../../../src/browser/components/domain/screen-nav/screen-nav.tsx"
import { useNavDrawer } from "../../../../../src/browser/stores/nav-drawer.ts"
import type { FigurePreference } from "../../../../../src/shared/session/session-default.ts"
import { INITIAL_SESSION_STATE } from "../../../../../src/shared/session/session-state.ts"
import { typedElement } from "../../../../typed-element.ts"
import { EMPTY_NAV_DRAWER_SLOTS } from "../../../nav-drawer-slot.tsx"
import { stubPhoneWidth } from "../../../phone-width.ts"
import { queryClientWrapper } from "../../../query-client.tsx"
import { putSession } from "../../../session-store.ts"

// 設定の「セッションの既定」の面の、図の既定（`figurePreference`）の行。

beforeEach(() => {
  stubPhoneWidth(true)
})

afterEach(() => {
  cleanup()
  useNavDrawer.setState(useNavDrawer.getInitialState(), true)
  window.location.hash = ""
})

function renderWith(figurePreference: FigurePreference, sent: unknown[]): void {
  putSession(
    {
      ...INITIAL_SESSION_STATE,
      sessionDefault: { model: "opus", effort: "high", permissionMode: "plan", figurePreference },
    },
    (command) => sent.push(command),
  )
  render(<ScreenNav drawer={EMPTY_NAV_DRAWER_SLOTS} />, { wrapper: queryClientWrapper() })
}

function figureSelect(): HTMLSelectElement {
  fireEvent.click(
    typedElement(
      document.querySelector(".screen-nav > .screen-nav-settings .screen-nav-settings-toggle"),
      HTMLElement,
      "帯の歯車",
    ),
  )
  const dialog = screen.getByRole("dialog", { name: "設定" })
  fireEvent.click(within(dialog).getByRole("button", { name: "セッションの既定" }))
  return typedElement(
    dialog.querySelector("select[aria-label='新しいセッションの図の既定']"),
    HTMLSelectElement,
    "図の既定の select",
  )
}

describe("設定の歯車（新しいセッションの図の既定）", () => {
  it("選ぶと、いまのモデル・effort・許可モードと一緒に session.setSessionDefault を送る", () => {
    const sent: unknown[] = []
    renderWith("chart", sent)
    const select = figureSelect()
    expect(select.value).toBe("chart")

    fireEvent.change(select, { target: { value: "text" } })

    expect(sent).toEqual([
      {
        procedure: "session.setSessionDefault",
        model: "opus",
        effort: "high",
        permissionMode: "plan",
        figurePreference: "text",
      },
    ])
  })

  it("届いた図の既定をそのまま出し、知らない値は送らない", () => {
    const sent: unknown[] = []
    renderWith("text", sent)
    const select = figureSelect()

    expect(select.value).toBe("text")
    fireEvent.change(select, { target: { value: "no-such" } })

    expect(sent).toEqual([])
  })

  it("引き出しの設定の面にも図の既定の行が出る", () => {
    renderWith("chart", [])
    fireEvent.click(screen.getByRole("button", { name: "やり取りとタスクを開く" }))
    const drawer = screen.getByRole("dialog", { name: "引き出し" })
    fireEvent.click(within(drawer).getByRole("button", { name: "設定" }))

    expect(within(drawer).getByLabelText("新しいセッションの図の既定")).toBeDefined()
  })
})
