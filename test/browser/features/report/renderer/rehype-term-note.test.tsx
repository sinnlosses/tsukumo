import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import type { TermNotes } from "../../../../../src/browser/features/report/domain/term-note.ts"
import { InlineMarkdown } from "../../../../../src/browser/features/report/renderer/markdown-renderer.tsx"

afterEach(() => {
  cleanup()
})

const NOTES: TermNotes = new Map([["架空語", { note: "架空の注。", cardId: "report-term-1-1" }]])

const termButtons = (container: HTMLElement) => [
  ...container.querySelectorAll("button[aria-describedby]"),
]

describe("rehypeTermNote（InlineMarkdown を通した描画）", () => {
  it("最初の1か所だけを語のボタンと注の札に替え、2か所目は字のまま", () => {
    const { container } = render(
      <InlineMarkdown text="架空語は**架空語**と呼ぶ。" termNotes={NOTES} />,
    )
    const buttons = termButtons(container)
    const card = container.querySelector('[role="tooltip"]')

    expect(buttons.map((button) => button.textContent)).toEqual(["架空語"])
    expect(buttons[0]?.getAttribute("aria-describedby")).toBe("report-term-1-1")
    expect(card?.id).toBe("report-term-1-1")
    expect(card?.textContent).toBe("用語架空の注。")
    expect(container.querySelector("strong")?.textContent).toBe("架空語")
  })

  it("inline code・リンク・行内の印の中は飛ばし、外の最初の1か所に付ける", () => {
    const { container } = render(
      <InlineMarkdown
        text="`架空語` と [架空語](https://example.com/) と {{架空語 → 8}} と架空語。"
        termNotes={NOTES}
      />,
    )
    const buttons = termButtons(container)

    expect(buttons).toHaveLength(1)
    expect(buttons[0]?.closest("code, a")).toBeNull()
    expect(container.querySelector("code")?.textContent).toBe("架空語")
    expect(container.querySelector("a")?.textContent).toBe("架空語")
  })
})
