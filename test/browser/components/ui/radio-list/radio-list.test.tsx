import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { RadioList } from "../../../../../src/browser/components/ui/radio-list/radio-list.tsx"

afterEach(() => {
  cleanup()
})

const ITEMS = [
  { value: "a", label: "ダミーA", description: "Aの説明" },
  { value: "b", label: "ダミーB", description: "Bの説明" },
] as const

function radio(name: RegExp): HTMLInputElement {
  const element = screen.getByRole("radio", { name })
  if (!(element instanceof HTMLInputElement)) throw new Error("radio が input ではない")
  return element
}

describe("RadioList", () => {
  it("選んでいる値の radio だけが checked になり、radiogroup が label を名前に持つ", () => {
    render(
      <RadioList
        label="ダミー"
        value="b"
        items={ITEMS}
        disabled={false}
        onChange={vi.fn<() => void>()}
      />,
    )

    expect(screen.getByRole("radiogroup", { name: "ダミー" })).toBeTruthy()
    expect(radio(/ダミーB/).checked).toBe(true)
    expect(radio(/ダミーA/).checked).toBe(false)
  })

  it("別の項目を押すとその value で onChange が呼ばれる", () => {
    const onChange = vi.fn<(value: "a" | "b") => void>()
    render(
      <RadioList label="ダミー" value="b" items={ITEMS} disabled={false} onChange={onChange} />,
    )

    fireEvent.click(radio(/ダミーA/))

    expect(onChange).toHaveBeenCalledWith("a")
  })

  it("description が項目の中に出て、disabled のときは押しても onChange が呼ばれない", () => {
    const onChange = vi.fn<(value: "a" | "b") => void>()
    render(<RadioList label="ダミー" value="b" items={ITEMS} disabled onChange={onChange} />)

    expect(screen.getByText("Aの説明")).toBeTruthy()
    expect(radio(/ダミーA/).disabled).toBe(true)
    fireEvent.click(radio(/ダミーA/))
    expect(onChange).not.toHaveBeenCalled()
  })
})
