import { QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { Composer } from "../../../../../../../src/browser/components/page/conversation/components/dispatch/composer.tsx"
import { INITIAL_SESSION_STATE } from "../../../../../../../src/shared/session/session-state.ts"
import { createTestQueryClient } from "../../../../../query-client.tsx"
import { putSession } from "../../../../../session-store.ts"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function renderComposer(): void {
  putSession({ ...INITIAL_SESSION_STATE, effort: "high" })
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <Composer />
    </QueryClientProvider>,
  )
}

function stubPhoneWidth(): void {
  vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
    matches: true,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }))
}

describe("Composer（モデル・effort・許可モードの札）", () => {
  it("広い幅の下の行に、モデル・effort・許可モードの3つの札が並ぶ", () => {
    renderComposer()

    const labels = screen
      .getAllByRole("combobox")
      .map((select) => select.getAttribute("aria-label")?.split(" ")[0])
    expect(labels).toEqual(["モデル", "effort", "許可モード"])
  })

  it("狭い画面（760px 以下）の入力欄には札を出さない", () => {
    stubPhoneWidth()
    renderComposer()

    expect(screen.queryAllByRole("combobox")).toEqual([])
  })
})
