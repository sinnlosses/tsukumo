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
import { putSession, type CommandSpy, type SentCommand } from "../../../session-store.ts"

// 設定の既定と違う行の印（左の線と ↺）と、ナビのページ名の件数。

beforeEach(() => {
  stubPhoneWidth(true)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.location.hash = ""
})

function renderScreenNav(state: Partial<SessionState>, spy: CommandSpy = () => {}): void {
  putSession({ ...INITIAL_SESSION_STATE, ...state }, spy)
  render(<ScreenNav drawer={EMPTY_NAV_DRAWER_SLOTS} />, { wrapper: queryClientWrapper() })
}

function openGear(): HTMLElement {
  fireEvent.click(
    typedElement(
      document.querySelector(".screen-nav > .screen-nav-settings .screen-nav-settings-toggle"),
      HTMLElement,
      "帯の歯車",
    ),
  )
  return screen.getByRole("dialog", { name: "設定" })
}

describe("設定の既定と違う項目の印", () => {
  it("既定と違う行にだけ ↺ が出て、押すとその項目だけ既定へ戻す", () => {
    const sent: SentCommand[] = []
    renderScreenNav(
      {
        sessionDefault: {
          model: "sonnet",
          effort: "high",
          permissionMode: "auto",
          figurePreference: "chart",
        },
      },
      (command) => {
        sent.push(command)
      },
    )
    const dialog = openGear()
    fireEvent.click(within(dialog).getByRole("button", { name: "新しいセッション" }))

    // モデルと effort は既定と違い、許可モードと図の既定は既定のまま。
    expect(within(dialog).getAllByRole("button", { name: /に戻す$/u })).toHaveLength(2)
    fireEvent.click(within(dialog).getByRole("button", { name: "既定（Opus）に戻す" }))

    expect(sent).toEqual([
      {
        procedure: "session.setSessionDefault",
        model: "opus",
        effort: "high",
        permissionMode: "auto",
        figurePreference: "chart",
      },
    ])
  })

  it("ナビのページ名に既定と違う件数が出て、0 件のページには出ない", () => {
    renderScreenNav({
      sessionDefault: {
        model: "sonnet",
        effort: "high",
        permissionMode: "plan",
        figurePreference: "chart",
      },
    })
    const nav = within(openGear()).getByRole("navigation", { name: "設定の項目" })

    expect(within(nav).getByRole("button", { name: "新しいセッション" }).textContent).toBe(
      "新しいセッション3",
    )
    expect(within(nav).getByRole("button", { name: "見た目" }).textContent).toBe("見た目")
  })
})
