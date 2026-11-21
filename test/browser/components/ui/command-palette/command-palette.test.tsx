import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  CommandPalette,
  type CommandPaletteProps,
  type CommandPaletteRow,
} from "../../../../../src/browser/components/ui/command-palette/command-palette.tsx"
import { isOverlayOpen } from "../../../../../src/browser/hooks/open-overlay.ts"

afterEach(() => {
  cleanup()
})

const ROWS = [
  { id: "alpha", label: "架空の操作アルファ", group: "架空の群A", hiddenUntilTyped: false },
  {
    id: "beta",
    label: "架空の操作ベータ",
    group: "架空の群A",
    keys: "mod+j",
    hiddenUntilTyped: false,
  },
  { id: "gamma", label: "架空の画面ガンマ", group: "架空の群B", hiddenUntilTyped: false },
  {
    id: "delta",
    label: "架空の項目デルタ",
    group: "架空の群C",
    hint: "架空の行き先",
    hiddenUntilTyped: true,
  },
] as const satisfies readonly CommandPaletteRow[]

const BASE_PROPS = {
  open: true,
  ariaLabel: "架空のパレット",
  placeholder: "架空の操作を探す",
  searchLabel: "探す",
  emptyText: "架空の当たり無し",
  rows: ROWS,
  onClose: () => {},
  onRun: () => {},
} satisfies CommandPaletteProps

function search(): HTMLElement {
  return screen.getByRole("combobox", { name: "探す" })
}

/** 選ばれている行の id。`aria-activedescendant` と `data-highlighted` が同じ行を指すことも確かめる。 */
function highlighted(): string | undefined {
  const rows = document.querySelectorAll('[role="option"][data-highlighted="highlighted"]')
  const active = search().getAttribute("aria-activedescendant") ?? undefined
  expect(rows.length <= 1).toBe(true)
  expect(rows[0]?.id).toBe(active)
  return rows[0]?.getAttribute("data-value") ?? undefined
}

async function renderPalette(props: Partial<CommandPaletteProps> = {}): Promise<void> {
  render(<CommandPalette {...BASE_PROPS} {...props} />)
  await waitFor(() => {
    expect(highlighted()).toBe("alpha")
  })
}

function type(text: string): void {
  fireEvent.change(search(), { target: { value: text } })
}

function optionLabels(): readonly string[] {
  return screen.queryAllByRole("option").map((option) => option.textContent)
}

describe("CommandPalette（ui）", () => {
  it("開いた直後は最初の行が選ばれている", async () => {
    await renderPalette()
    expect(highlighted()).toBe("alpha")
  })

  it("打つと、選びが絞った最初の行へ戻る", async () => {
    await renderPalette()
    fireEvent.keyDown(search(), { key: "ArrowDown" })
    expect(highlighted()).toBe("beta")

    type("ガンマ")
    await waitFor(() => {
      expect(highlighted()).toBe("gamma")
    })
  })

  it("↑↓ と Ctrl+N / Ctrl+P で選びが動き、端で止まる", async () => {
    await renderPalette()
    fireEvent.keyDown(search(), { key: "ArrowUp" })
    expect(highlighted()).toBe("alpha")
    fireEvent.keyDown(search(), { key: "n", ctrlKey: true })
    expect(highlighted()).toBe("beta")
    fireEvent.keyDown(search(), { key: "ArrowDown" })
    expect(highlighted()).toBe("gamma")
    fireEvent.keyDown(search(), { key: "n", ctrlKey: true })
    expect(highlighted()).toBe("gamma")
    fireEvent.keyDown(search(), { key: "p", ctrlKey: true })
    expect(highlighted()).toBe("beta")
  })

  it("Enter で選んだ行の id を onRun に渡し、onClose も呼ぶ", async () => {
    const onRun = vi.fn<(id: string) => void>()
    const onClose = vi.fn<() => void>()
    await renderPalette({ onRun, onClose })
    fireEvent.keyDown(search(), { key: "ArrowDown" })
    fireEvent.keyDown(search(), { key: "Enter" })
    expect(onRun).toHaveBeenCalledWith("beta")
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("行のクリックでもその行の id を onRun に渡し、onClose も呼ぶ", async () => {
    const onRun = vi.fn<(id: string) => void>()
    const onClose = vi.fn<() => void>()
    await renderPalette({ onRun, onClose })
    fireEvent.click(screen.getByRole("option", { name: /ガンマ/ }))
    expect(onRun).toHaveBeenCalledWith("gamma")
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("Esc で onClose を呼ぶ", async () => {
    const onRun = vi.fn<(id: string) => void>()
    const onClose = vi.fn<() => void>()
    await renderPalette({ onRun, onClose })
    fireEvent.keyDown(document, { key: "Escape" })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onRun).not.toHaveBeenCalled()
  })

  it("開いている間は重なる面として数え、閉じると外す", async () => {
    await renderPalette()
    expect(isOverlayOpen()).toBe(true)
    cleanup()
    render(<CommandPalette {...BASE_PROPS} open={false} />)
    expect(isOverlayOpen()).toBe(false)
  })

  it("hiddenUntilTyped の行は打つまで出ず、打つと当たる", async () => {
    await renderPalette()
    expect(optionLabels().some((label) => label.includes("デルタ"))).toBe(false)

    type("デルタ")
    await waitFor(() => {
      expect(optionLabels()).toEqual(["架空の項目デルタ架空の行き先"])
    })
  })

  it("当たる行が無いと emptyText を出す", async () => {
    await renderPalette()
    type("当たらない字")
    expect(await screen.findByText("架空の当たり無し")).toBeTruthy()
  })

  it("群の見出しを渡した行の順に出す", async () => {
    await renderPalette()
    const groups = screen.getAllByRole("group").map((group) => group.getAttribute("aria-label"))
    expect(groups).toEqual(["架空の群A", "架空の群B"])
  })

  it("下端のキー案内の帯を出さない", async () => {
    await renderPalette()
    const dialog = screen.getByRole("dialog", { name: "架空のパレット" })
    // Astryx の既定のキー案内の帯の文。
    expect(dialog.textContent).not.toContain("Navigate")
  })
})
