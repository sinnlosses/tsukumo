import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
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

function openMenu(props: MenuProps): HTMLElement {
  render(<Menu {...props} />)
  const trigger = screen.getByRole("button", { name: "架空の操作" })
  fireEvent.click(trigger)
  return trigger
}

describe("Menu", () => {
  it("押す口で開閉し、aria-expanded が追随する", () => {
    render(<Menu {...BASE_PROPS} />)
    const trigger = screen.getByRole("button", { name: "架空の操作" })
    expect(trigger.getAttribute("aria-expanded")).toBe("false")
    expect(screen.queryByRole("menu")).toBeNull()

    fireEvent.click(trigger)
    expect(trigger.getAttribute("aria-expanded")).toBe("true")
    expect(screen.getByRole("menu")).toBeTruthy()

    fireEvent.click(trigger)
    expect(trigger.getAttribute("aria-expanded")).toBe("false")
    expect(screen.queryByRole("menu")).toBeNull()
  })

  it("開くと最初の押せる行にフォーカスが移る", () => {
    openMenu({ ...BASE_PROPS, items: [item("甲", { disabled: true }), item("乙", {})] })
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "乙" }))
  })

  it("↓ で押せない行を飛ばし、末尾から先頭へ巡る", () => {
    openMenu(BASE_PROPS)
    const menu = screen.getByRole("menu")
    fireEvent.keyDown(menu, { key: "ArrowDown" })
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "丙" }))
    fireEvent.keyDown(menu, { key: "ArrowDown" })
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "甲" }))
  })

  it("Enter で onSelect を呼んで閉じ、押す口へフォーカスを戻す", () => {
    const onSelect = vi.fn(() => {})
    const trigger = openMenu({ ...BASE_PROPS, items: [item("甲", { onSelect })] })
    fireEvent.keyDown(screen.getByRole("menuitem", { name: "甲" }), { key: "Enter" })
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("menu")).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it("押せない行は押しても Enter でも onSelect を呼ばない", () => {
    const onSelect = vi.fn(() => {})
    openMenu({ ...BASE_PROPS, items: [item("甲", {}), item("乙", { disabled: true, onSelect })] })
    const disabled = screen.getByRole("menuitem", { name: "乙" })
    expect(disabled.getAttribute("aria-disabled")).toBe("true")
    fireEvent.click(disabled)
    fireEvent.keyDown(disabled, { key: "Enter" })
    expect(onSelect).not.toHaveBeenCalled()
    expect(screen.getByRole("menu")).toBeTruthy()
  })

  it("Esc で閉じて押す口へ戻り、keydown の既定の動作を止める", () => {
    const trigger = openMenu(BASE_PROPS)
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
    const first = screen.getByRole("menuitem", { name: "甲" })
    act(() => {
      first.dispatchEvent(event)
    })
    expect(event.defaultPrevented).toBe(true)
    expect(screen.queryByRole("menu")).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it("separatorBefore の行の前に区切りを置き、danger の行に危うい顔の class を付ける", () => {
    openMenu({
      ...BASE_PROPS,
      items: [item("甲", {}), item("乙", { tone: "danger", separatorBefore: true })],
    })
    const menu = screen.getByRole("menu")
    const separator = screen.getByRole("separator")
    expect(separator.nextElementSibling).toBe(screen.getByRole("menuitem", { name: "乙" }))
    expect(menu.children).toHaveLength(3)
    expect(screen.getByRole("menuitem", { name: "乙" }).className.split(" ")).toContain(
      "menu-item-tone-danger",
    )
  })
})
