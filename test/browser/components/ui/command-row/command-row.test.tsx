import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { useState, type ReactElement } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  CommandList,
  type CommandItem,
} from "../../../../../src/browser/components/ui/command-row/command-row.tsx"

afterEach(() => {
  cleanup()
})

const ITEMS = [
  { key: "a", group: "架空の群1", label: "架空の行A", hint: "" },
  { key: "b", group: "架空の群1", label: "架空の行B", hint: "⌘B" },
  { key: "c", group: "架空の群2", label: "架空の行C", hint: "" },
] as const satisfies readonly CommandItem[]

const NO_SEARCH = { kind: "none" } as const

function selectedLabel(): string | null {
  return screen.getByRole("option", { selected: true }).firstElementChild?.textContent ?? null
}

function renderList(onSelect: (key: string) => void): void {
  render(
    <CommandList
      ariaLabel="架空の一覧"
      search={NO_SEARCH}
      items={ITEMS}
      empty="架空の空"
      onSelect={onSelect}
    />,
  )
}

/** 字で行を絞る呼び出し側の代役。 */
function SearchHost(props: { readonly onSelect: (key: string) => void }): ReactElement {
  const [query, setQuery] = useState("")
  return (
    <CommandList
      ariaLabel="架空の一覧"
      search={{
        kind: "field",
        ariaLabel: "架空の欄",
        placeholder: "",
        value: query,
        onChange: setQuery,
      }}
      items={ITEMS.filter((item) => item.label.includes(query))}
      empty="架空の空"
      onSelect={props.onSelect}
    />
  )
}

describe("CommandList", () => {
  it("最初の行が選ばれ、↑ ↓ で動き、端で止まる", () => {
    renderList(() => {})
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
    renderList(onSelect)
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "ArrowDown" })
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Enter" })
    expect(onSelect).toHaveBeenLastCalledWith("b")
    fireEvent.click(screen.getByRole("option", { name: /架空の行C/ }))
    expect(onSelect).toHaveBeenLastCalledWith("c")
  })

  it("添える語は空でないときだけ出し、群の見出しは群が変わる行の前にだけ置く", () => {
    renderList(() => {})
    expect(document.querySelectorAll("small")).toHaveLength(1)
    expect(screen.getByText("架空の群1")).toBeDefined()
    expect(screen.getAllByText(/^架空の群/)).toHaveLength(2)
  })

  it("絞り込みの欄に字を打っているあいだも ↑ ↓ と Enter が効き、字が変わると先頭に戻る", () => {
    const onSelect = vi.fn<(key: string) => void>()
    render(<SearchHost onSelect={onSelect} />)
    const field = screen.getByRole("combobox", { name: "架空の欄" })

    fireEvent.keyDown(field, { key: "ArrowDown" })
    expect(selectedLabel()).toBe("架空の行B")
    fireEvent.change(field, { target: { value: "架空の行" } })
    expect(selectedLabel()).toBe("架空の行A")
    fireEvent.change(field, { target: { value: "C" } })
    fireEvent.keyDown(field, { key: "Enter" })
    expect(onSelect).toHaveBeenLastCalledWith("c")

    fireEvent.change(field, { target: { value: "当たらない字" } })
    expect(screen.getByText("架空の空")).toBeDefined()
  })
})
