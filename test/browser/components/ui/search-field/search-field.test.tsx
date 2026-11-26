import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { SearchField } from "../../../../../src/browser/components/ui/search-field/search-field.tsx"
import { typedElement } from "../../../../typed-element.ts"

afterEach(() => {
  cleanup()
})

describe("SearchField", () => {
  it("combobox として名前・一覧・選んでいる行を指し、入力した値と押したキーを渡す", () => {
    const onChange = vi.fn<(value: string) => void>()
    const onKeyDown = vi.fn<() => void>()
    render(
      <SearchField
        label="ダミーを探す"
        value="a"
        onChange={onChange}
        listId="dummy-list"
        activeOptionId="dummy-option"
        onKeyDown={onKeyDown}
        placeholder="ダミー"
      />,
    )

    const field = typedElement(
      screen.getByRole("combobox", { name: "ダミーを探す" }),
      HTMLInputElement,
      "ダミーの <input>",
    )
    expect(field.type).toBe("search")
    expect(field.getAttribute("aria-controls")).toBe("dummy-list")
    expect(field.getAttribute("aria-activedescendant")).toBe("dummy-option")
    fireEvent.change(field, { target: { value: "ab" } })
    expect(onChange).toHaveBeenCalledWith("ab")
    fireEvent.keyDown(field, { key: "ArrowDown" })
    expect(onKeyDown).toHaveBeenCalledTimes(1)
  })
})
