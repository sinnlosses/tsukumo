import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { Collapsible } from "../../../../../src/browser/components/ui/collapsible/collapsible.tsx"

afterEach(cleanup)

describe("Collapsible", () => {
  it("開いた形では見出しと本文が出て、閉じた形では見出しの開閉の印が閉を示す", () => {
    const opened = render(
      <Collapsible trigger="見出し" defaultOpen chevronPosition="end">
        本文
      </Collapsible>,
    ).container
    expect(opened.textContent).toContain("本文")
    expect(opened.querySelector("[aria-expanded='true']")).not.toBeNull()
    cleanup()

    const closed = render(
      <Collapsible trigger="見出し" defaultOpen={false} chevronPosition="end">
        本文
      </Collapsible>,
    ).container
    expect(closed.querySelector("[aria-expanded='false']")).not.toBeNull()
  })

  it("呼ぶ側が開閉を持つ形では isOpen のとおりに開き、見出しを押すと onOpenChange が呼ばれる", () => {
    const calls: boolean[] = []
    const { container, rerender } = render(
      <Collapsible
        trigger="見出し"
        isOpen={false}
        onOpenChange={(open) => calls.push(open)}
        chevronPosition="end"
      >
        本文
      </Collapsible>,
    )
    const button = container.querySelector("[aria-expanded]")
    expect(button?.getAttribute("aria-expanded")).toBe("false")
    if (button === null) {
      throw new Error("見出しのボタンが描かれていない")
    }
    fireEvent.click(button)
    expect(calls).toEqual([true])
    expect(button?.getAttribute("aria-expanded")).toBe("false")

    rerender(
      <Collapsible trigger="見出し" isOpen onOpenChange={() => {}} chevronPosition="end">
        本文
      </Collapsible>,
    )
    expect(container.querySelector("[aria-expanded]")?.getAttribute("aria-expanded")).toBe("true")
  })

  it("印の位置が start なら山形の印が見出しの字より前に、end なら後ろに描かれる", () => {
    function chevronBeforeLabel(position: "start" | "end"): boolean {
      const { container } = render(
        <Collapsible trigger="見出し" defaultOpen={false} chevronPosition={position}>
          本文
        </Collapsible>,
      )
      const button = container.querySelector("[aria-expanded]")
      const svg = button?.querySelector("svg")
      const label = [...(button?.querySelectorAll("span") ?? [])].find(
        (el) => el.children.length === 0 && el.textContent === "見出し",
      )
      if (svg === null || svg === undefined || label === undefined) {
        throw new Error("印か見出しが描かれていない")
      }
      const before = (svg.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
      cleanup()
      return before
    }

    expect(chevronBeforeLabel("start")).toBe(true)
    expect(chevronBeforeLabel("end")).toBe(false)
  })
})
