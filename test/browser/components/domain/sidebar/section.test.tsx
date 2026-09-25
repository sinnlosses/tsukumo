import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, render, screen } from "@testing-library/react"

import { SidebarSection } from "../../../../../src/browser/components/domain/sidebar/section.tsx"

afterEach(() => {
  cleanup()
})

describe("SidebarSection", () => {
  it("action が無い区画は見出しの文字だけを出す", () => {
    render(
      <SidebarSection title="架空の区画" extraClass="sidebar-block-fake" action={undefined}>
        <p>中身</p>
      </SidebarSection>,
    )

    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("架空の区画")
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("action がある区画は見出しに押せる口が並び、押すと呼ばれる", () => {
    const pressed: string[] = []
    render(
      <SidebarSection
        title="架空の区画"
        extraClass="sidebar-block-fake"
        action={{
          label: "一覧を見る",
          onAction: () => {
            pressed.push("一覧を見る")
          },
        }}
      >
        <p>中身</p>
      </SidebarSection>,
    )

    const button = screen.getByRole("button", { name: "一覧を見る" })
    expect(button.getAttribute("aria-haspopup")).toBe("dialog")
    button.click()
    expect(pressed).toEqual(["一覧を見る"])
  })
})
