// 雑談中のサイドバーの3段目「覚えていること」（docs/architecture/chat-mode.md「雑談モード」・docs/architecture/screen-design.md「雑談モードの画面」）。

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { PersonaMemorySection } from "../../../../../../src/browser/components/domain/sidebar/components/persona-memory-section.tsx"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../../src/shared/session/session-state.ts"
import { putSession } from "../../../../session-store.ts"

afterEach(() => {
  cleanup()
})

const LONG_LINE = "あ".repeat(30)

const LONG_CHIP_NAME = new RegExp(`^${"あ".repeat(20)}…$`)

function renderSection(stateOverrides: Partial<SessionState>): void {
  putSession({ ...INITIAL_SESSION_STATE, ...stateOverrides }, () => {})
  render(<PersonaMemorySection />)
}

describe("PersonaMemorySection", () => {
  it("長い行は先頭で切り、`…` を付ける", () => {
    renderSection({ rememberedLines: [LONG_LINE] })

    expect(screen.queryByText(LONG_LINE)).toBeNull()
    const chip = screen.getByRole("button", { name: LONG_CHIP_NAME })
    expect(chip.getAttribute("aria-expanded")).toBe("false")
  })

  it("チップを押すと全文が開き、もう一度押すと閉じる", () => {
    renderSection({ rememberedLines: [LONG_LINE] })

    fireEvent.click(screen.getByRole("button", { name: LONG_CHIP_NAME }))
    const opened = screen.getByRole("button", { name: LONG_LINE })
    expect(opened.getAttribute("aria-expanded")).toBe("true")

    fireEvent.click(opened)
    expect(screen.getByRole("button", { name: LONG_CHIP_NAME }).getAttribute("aria-expanded")).toBe(
      "false",
    )
  })
})
