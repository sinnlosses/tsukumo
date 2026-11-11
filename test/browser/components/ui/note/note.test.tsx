import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { Note, type NoteTone } from "../../../../../src/browser/components/ui/note/note.tsx"

afterEach(cleanup)

function drawn(tone: NoteTone): HTMLElement {
  return render(
    <Note tone={tone} title="題">
      <span>本文</span>
    </Note>,
  ).container
}

describe("Note", () => {
  it.each([
    ["info", "info"],
    ["warn", "warning"],
    ["ng", "error"],
    ["ask", "ask"],
  ] as const)("tone: %s は Banner の status %s に写る", (tone, status) => {
    expect(drawn(tone).querySelector("[data-status]")?.getAttribute("data-status")).toBe(status)
  })

  it("題と本文を、畳むボタンも閉じるボタンも出さずに開いたまま出す", () => {
    const container = drawn("info")

    expect(container.textContent).toContain("題")
    expect(container.textContent).toContain("本文")
    expect(container.querySelector("[aria-expanded]")).toBeNull()
    expect(container.querySelector("button")).toBeNull()
  })
})
