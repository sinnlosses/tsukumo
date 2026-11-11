import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  Menu,
  type MenuItem,
  type MenuProps,
} from "../../../../../src/browser/components/ui/menu/menu.tsx"

afterEach(() => {
  cleanup()
})

function item(key: string, overrides: Partial<MenuItem>): MenuItem {
  return {
    key,
    label: key,
    tone: "default",
    disabled: false,
    separatorBefore: false,
    onSelect: () => {},
    ...overrides,
  }
}

const BASE_PROPS = {
  triggerLabel: "架空の操作",
  disabled: false,
  items: [item("甲", {}), item("乙", { disabled: true }), item("丙", { separatorBefore: true })],
  className: "",
} satisfies MenuProps

/** happy-dom は `:popover-open` を持たないので、`showPopover` の補いが写す属性で開閉を見る。 */
function menuIsOpen(): boolean {
  return document.querySelector("[popover]")?.hasAttribute("data-popover-open") === true
}

function openMenu(props: MenuProps): HTMLElement {
  render(<Menu {...props} />)
  const trigger = screen.getByRole("button", { name: "架空の操作" })
  trigger.focus()
  fireEvent.click(trigger)
  return trigger
}

describe("Menu", () => {
  it("ボタンで開き、menu と menuitem の役で行を出す", () => {
    render(<Menu {...BASE_PROPS} />)
    const trigger = screen.getByRole("button", { name: "架空の操作" })
    expect(trigger.getAttribute("aria-expanded")).toBe("false")
    expect(menuIsOpen()).toBe(false)

    fireEvent.click(trigger)
    expect(trigger.getAttribute("aria-expanded")).toBe("true")
    expect(menuIsOpen()).toBe(true)
    expect(screen.getAllByRole("menuitem").map((row) => row.textContent)).toEqual([
      "甲",
      "乙",
      "丙",
    ])
  })

  it("行を選ぶと onSelect を呼んで閉じる", async () => {
    const onSelect = vi.fn<() => void>()
    openMenu({ ...BASE_PROPS, items: [item("甲", { onSelect })] })
    fireEvent.click(screen.getByRole("menuitem", { name: "甲" }))
    expect(onSelect).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(menuIsOpen()).toBe(false))
  })

  it("押せない行は押しても onSelect を呼ばない", () => {
    const onSelect = vi.fn<() => void>()
    openMenu({ ...BASE_PROPS, items: [item("甲", {}), item("乙", { disabled: true, onSelect })] })
    const disabled = screen.getByRole("menuitem", { name: "乙" })
    fireEvent.click(disabled)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it("Esc で閉じる", async () => {
    openMenu(BASE_PROPS)
    fireEvent.keyDown(screen.getByRole("menuitem", { name: "甲" }), { key: "Escape" })
    await waitFor(() => expect(menuIsOpen()).toBe(false))
  })

  it("separatorBefore の行の前に区切りを置き、danger の行を危うい行として出す", () => {
    openMenu({
      ...BASE_PROPS,
      items: [item("甲", {}), item("乙", { tone: "danger", separatorBefore: true })],
    })
    expect(screen.getByRole("separator")).toBeTruthy()
    expect(screen.getAllByRole("menuitem")).toHaveLength(2)
  })
})
