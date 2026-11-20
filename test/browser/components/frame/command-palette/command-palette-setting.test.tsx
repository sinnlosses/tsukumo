import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { CommandPalette } from "../../../../../src/browser/components/frame/command-palette/command-palette.tsx"
import { ScreenNav } from "../../../../../src/browser/components/frame/screen-nav/screen-nav.tsx"
import { useSettingsRequest } from "../../../../../src/browser/stores/settings-request.ts"
import { INITIAL_SESSION_STATE } from "../../../../../src/shared/session/session-state.ts"
import { EMPTY_NAV_DRAWER_SLOTS } from "../../../nav-drawer-slot.tsx"
import { stubPhoneWidth } from "../../../phone-width.ts"
import { queryClientWrapper } from "../../../query-client.tsx"
import { putSession } from "../../../session-store.ts"

// ⌘K のパレットが設定の項目名で当たり、選ぶと設定のダイアログがそのページで開いて、その行へ送る。

const scrolled = vi.fn<(options: ScrollIntoViewOptions) => void>()

beforeEach(() => {
  stubPhoneWidth(true)
  HTMLElement.prototype.scrollIntoView = scrolled
  putSession({ ...INITIAL_SESSION_STATE })
  render(
    <>
      <ScreenNav drawer={EMPTY_NAV_DRAWER_SLOTS} />
      <CommandPalette />
    </>,
    { wrapper: queryClientWrapper() },
  )
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  scrolled.mockReset()
  delete document.documentElement.dataset["motion"]
  useSettingsRequest.setState(useSettingsRequest.getInitialState(), true)
  window.location.hash = ""
})

function openPaletteAndType(text: string): void {
  fireEvent.keyDown(document, { key: "k", metaKey: true })
  fireEvent.change(screen.getByRole("combobox", { name: "操作を探す" }), {
    target: { value: text },
  })
}

describe("コマンドパレットの設定の項目", () => {
  it("「動き」と打つと、設定の「動き」の行が「設定 › 演出」を添えて当たる", () => {
    openPaletteAndType("動き")

    const option = screen.getByRole("option", { name: /動き/ })
    expect(option.textContent).toContain("設定 › 演出")
  })

  it("何も打たないあいだは、設定の項目を並べない", () => {
    fireEvent.keyDown(document, { key: "k", metaKey: true })

    expect(screen.queryByRole("option", { name: /動き/ })).toBeNull()
  })

  it("行を選ぶと、演出のページで設定が開き、「動き」の行を見える位置へ送って光らせる", () => {
    openPaletteAndType("動き")

    act(() => {
      fireEvent.click(screen.getByRole("option", { name: /動き/ }))
    })

    const dialog = screen.getByRole("dialog", { name: "設定" })
    expect(within(dialog).getByRole("button", { name: "演出" }).getAttribute("aria-current")).toBe(
      "page",
    )
    const label = [...dialog.querySelectorAll("label")].find((node) => node.textContent === "動き")
    expect(label?.parentElement?.parentElement?.dataset["found"]).toBe("true")
    expect(scrolled).toHaveBeenCalledWith({ block: "center" })
  })

  it("動きを減らす設定のときは、行へ送るだけで光らせない", () => {
    document.documentElement.dataset["motion"] = "reduce"
    openPaletteAndType("動き")

    act(() => {
      fireEvent.click(screen.getByRole("option", { name: /動き/ }))
    })

    const dialog = screen.getByRole("dialog", { name: "設定" })
    const label = [...dialog.querySelectorAll("label")].find((node) => node.textContent === "動き")
    expect(label?.parentElement?.parentElement?.dataset["found"]).toBeUndefined()
    expect(scrolled).toHaveBeenCalledWith({ block: "center" })
  })
})
