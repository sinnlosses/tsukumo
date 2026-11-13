import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { TabsPart } from "../../../../../src/browser/features/report/leaf/tabs-part.tsx"

afterEach(cleanup)

const TABS = [
  { title: "甲", child: "a" },
  { title: "乙", child: "b" },
]

function renderTabs(): void {
  render(<TabsPart tabs={TABS} renderChild={(child) => <p>中身 {child}</p>} />)
}

describe("TabsPart", () => {
  it("選んでいない子も DOM に残し、選んだ区画だけに選択の印を付ける", () => {
    renderTabs()

    const panels = screen.getAllByRole("tabpanel", { hidden: true })
    expect(panels).toHaveLength(2)
    expect(panels[0]?.hasAttribute("data-selected")).toBe(true)
    expect(panels[1]?.hasAttribute("data-selected")).toBe(false)
    expect(screen.getByText("中身 b")).toBeDefined()
  })

  it("題を押すと選択が移り、aria-selected が付け替わる", () => {
    renderTabs()

    fireEvent.click(screen.getByRole("tab", { name: "乙" }))

    expect(screen.getByRole("tab", { name: "乙" }).getAttribute("aria-selected")).toBe("true")
    expect(screen.getByRole("tab", { name: "甲" }).getAttribute("aria-selected")).toBe("false")
    expect(
      screen.getAllByRole("tabpanel", { hidden: true })[1]?.hasAttribute("data-selected"),
    ).toBe(true)
  })
})
