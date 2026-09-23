// 雑談中のサイドバーの3段目「覚えていること」（docs/design.md 7.1・docs/screen-design.md 13.7）。フィクスチャは
// 手で書いた架空の1行だけ（実物の persona.md・会話は使わない。
// docs/coding-standards.md「会話内容の扱い」）。

import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { PersonaMemorySection } from "../../../../src/browser/features/sidebar/persona-memory-section.tsx"
import { SessionStoreContext } from "../../../../src/browser/stores/session.tsx"
import { INITIAL_SESSION_STATE, type SessionState } from "../../../../src/shared/session-state.ts"
import { type CommandSpy, sessionStoreWith } from "../../session-store.ts"

afterEach(() => {
  cleanup()
})

const SHORT_LINE = "架空の1行"
const LONG_LINE = "あ".repeat(30)

function renderSection(
  stateOverrides: Partial<SessionState>,
  dispatch: CommandSpy = () => {},
): void {
  const store = sessionStoreWith({ ...INITIAL_SESSION_STATE, ...stateOverrides }, dispatch)
  render(
    <SessionStoreContext.Provider value={store}>
      <PersonaMemorySection />
    </SessionStoreContext.Provider>,
  )
}

/** 確認ダイアログが開いているか（happy-dom も showModal() で `open` 属性を付ける）。 */
function confirmDialogIsOpen(): boolean {
  return (
    document.querySelector("dialog.sidebar-persona-memory-confirm")?.hasAttribute("open") === true
  )
}

describe("PersonaMemorySection", () => {
  it("空のときは案内だけを出し、「編集」は置かない", () => {
    renderSection({ rememberedLines: [] })

    expect(screen.getByText("まだ覚えていることが無い")).toBeDefined()
    expect(screen.queryByText("編集")).toBeNull()
  })

  it("行があればチップに出す（短い行はそのまま）", () => {
    renderSection({ rememberedLines: [SHORT_LINE] })

    expect(screen.getByText(SHORT_LINE)).toBeDefined()
    expect(screen.getByText("編集")).toBeDefined()
  })

  it("長い行は先頭で切り、`…` を付ける", () => {
    renderSection({ rememberedLines: [LONG_LINE] })

    expect(screen.queryByText(LONG_LINE)).toBeNull()
    const chip = screen.getByRole("button", { name: new RegExp(`^${"あ".repeat(20)}…$`) })
    expect(chip.getAttribute("aria-expanded")).toBe("false")
  })

  it("チップを押すと全文が開き、もう一度押すと閉じる", () => {
    renderSection({ rememberedLines: [LONG_LINE] })
    const chip = screen.getByRole("button", { name: new RegExp(`^${"あ".repeat(20)}…$`) })

    fireEvent.click(chip)
    expect(screen.getByText(LONG_LINE)).toBeDefined()
    expect(chip.getAttribute("aria-expanded")).toBe("true")

    fireEvent.click(chip)
    expect(screen.queryByText(LONG_LINE)).toBeNull()
    expect(chip.getAttribute("aria-expanded")).toBe("false")
  })

  it("「編集」を押すと × が出て、もう一度押すと消える（見出しの字は「完了」に変わる）", () => {
    renderSection({ rememberedLines: [SHORT_LINE] })

    expect(screen.queryByLabelText(`「${SHORT_LINE}」を消す`)).toBeNull()

    fireEvent.click(screen.getByText("編集"))
    expect(screen.getByLabelText(`「${SHORT_LINE}」を消す`)).toBeDefined()
    expect(screen.getByText("完了")).toBeDefined()

    fireEvent.click(screen.getByText("完了"))
    expect(screen.queryByLabelText(`「${SHORT_LINE}」を消す`)).toBeNull()
  })

  it("× → キャンセルでは何も送らない", () => {
    const calls: unknown[] = []
    renderSection({ rememberedLines: [SHORT_LINE] }, (command) => calls.push(command))

    fireEvent.click(screen.getByText("編集"))
    fireEvent.click(screen.getByLabelText(`「${SHORT_LINE}」を消す`))
    expect(confirmDialogIsOpen()).toBe(true)

    fireEvent.click(screen.getByText("キャンセル"))
    expect(confirmDialogIsOpen()).toBe(false)
    expect(calls).toEqual([])
  })

  it("× → 確認の「消す」で forget-remembered-line をその行の文面で送る", () => {
    const calls: unknown[] = []
    renderSection({ rememberedLines: [SHORT_LINE] }, (command) => calls.push(command))

    fireEvent.click(screen.getByText("編集"))
    fireEvent.click(screen.getByLabelText(`「${SHORT_LINE}」を消す`))
    fireEvent.click(screen.getByText("消す"))

    expect(calls).toEqual([{ type: "forget-remembered-line", line: SHORT_LINE }])
    expect(confirmDialogIsOpen()).toBe(false)
  })
})
