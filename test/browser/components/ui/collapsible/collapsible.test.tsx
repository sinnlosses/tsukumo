import { cleanup, render } from "@testing-library/react"
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
