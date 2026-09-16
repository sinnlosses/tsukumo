import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, render, screen } from "@testing-library/react"

import { SidebarSection } from "../../../src/ui/sidebar/section.tsx"

afterEach(() => {
  cleanup()
})

describe("SidebarSection", () => {
  it("toggle が無い区画の見出しは押せない地の文のまま", () => {
    render(
      <SidebarSection title="架空の区画" extraClass="sidebar-block-fake" toggle={undefined}>
        <p>中身</p>
      </SidebarSection>,
    )

    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("架空の区画")
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("toggle がある区画は見出しが押せて、開閉の状態を aria-expanded と文字で出す", () => {
    const pressed: boolean[] = []
    const { rerender } = render(
      <SidebarSection
        title="架空の区画"
        extraClass="sidebar-block-fake"
        toggle={{
          expanded: false,
          onToggle: () => {
            pressed.push(true)
          },
        }}
      >
        <p>中身</p>
      </SidebarSection>,
    )

    const collapsed = screen.getByRole("button")
    expect(collapsed.getAttribute("aria-expanded")).toBe("false")
    expect(collapsed.textContent).toContain("開く")
    collapsed.click()
    expect(pressed).toHaveLength(1)

    rerender(
      <SidebarSection
        title="架空の区画"
        extraClass="sidebar-block-fake"
        toggle={{
          expanded: true,
          onToggle: () => {
            pressed.push(true)
          },
        }}
      >
        <p>中身</p>
      </SidebarSection>,
    )

    const expanded = screen.getByRole("button")
    expect(expanded.getAttribute("aria-expanded")).toBe("true")
    expect(expanded.textContent).toContain("畳む")
  })
})
