import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  CommandList,
  type CommandItem,
} from "../../../../../src/browser/components/ui/command-row/command-row.tsx"

afterEach(() => {
  cleanup()
})

const ITEMS = [
  { key: "a", label: "架空の行A", hint: "" },
  { key: "b", label: "架空の行B", hint: "⌘B" },
  { key: "c", label: "架空の行C", hint: "" },
] as const satisfies readonly CommandItem[]

function selectedLabel(): string | null {
  return screen.getByRole("option", { selected: true }).firstElementChild?.textContent ?? null
}

describe("CommandList", () => {
  it("最初の行が選ばれ、↑ ↓ で動き、端で止まる", () => {
    render(<CommandList ariaLabel="架空の一覧" items={ITEMS} onSelect={() => {}} />)
    const list = screen.getByRole("listbox")
    expect(selectedLabel()).toBe("架空の行A")
    fireEvent.keyDown(list, { key: "ArrowUp" })
    expect(selectedLabel()).toBe("架空の行A")
    fireEvent.keyDown(list, { key: "ArrowDown" })
    fireEvent.keyDown(list, { key: "ArrowDown" })
    fireEvent.keyDown(list, { key: "ArrowDown" })
    expect(selectedLabel()).toBe("架空の行C")
  })

  it("Enter で選ばれた行の key を渡し、行のクリックでも渡す", () => {
    const onSelect = vi.fn<(key: string) => void>()
    render(<CommandList ariaLabel="架空の一覧" items={ITEMS} onSelect={onSelect} />)
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "ArrowDown" })
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Enter" })
    expect(onSelect).toHaveBeenLastCalledWith("b")
    fireEvent.click(screen.getByRole("option", { name: /架空の行C/ }))
    expect(onSelect).toHaveBeenLastCalledWith("c")
  })

  it("添える語は空でないときだけ出す", () => {
    render(<CommandList ariaLabel="架空の一覧" items={ITEMS} onSelect={() => {}} />)
    expect(document.querySelectorAll("small")).toHaveLength(1)
  })
})
