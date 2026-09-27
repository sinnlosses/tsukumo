// 雑談中のサイドバーの3段目「覚えていること」（docs/chat-mode.md「雑談モード」・docs/screen-design.md「雑談モードの画面」）。
// チップの開閉・編集・消す操作は E2E が DOM の写しとメッセージの列で守るので、ここに残すのは
// 書式の固定（docs/coding-standards.md「消すかどうか」）だけ。

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { PersonaMemorySection } from "../../../../../src/browser/components/domain/sidebar/persona-memory-section.tsx"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../src/shared/session/session-state.ts"
import { putSession } from "../../../session-store.ts"

afterEach(() => {
  cleanup()
})

const LONG_LINE = "あ".repeat(30)

function renderSection(stateOverrides: Partial<SessionState>): void {
  putSession({ ...INITIAL_SESSION_STATE, ...stateOverrides }, () => {})
  render(<PersonaMemorySection />)
}

describe("PersonaMemorySection", () => {
  it("長い行は先頭で切り、`…` を付ける", () => {
    renderSection({ rememberedLines: [LONG_LINE] })

    expect(screen.queryByText(LONG_LINE)).toBeNull()
    const chip = screen.getByRole("button", { name: new RegExp(`^${"あ".repeat(20)}…$`) })
    expect(chip.getAttribute("aria-expanded")).toBe("false")
  })
})
