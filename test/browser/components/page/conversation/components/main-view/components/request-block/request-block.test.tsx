import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { RequestBlock } from "../../../../../../../../../src/browser/components/page/conversation/components/main-view/components/request-block/request-block.tsx"

// 依頼の行はすべて手で書いた架空のもの（実物の会話は使わない）。

afterEach(() => {
  cleanup()
})

function renderBlock(lines: readonly string[]): void {
  render(<RequestBlock request={{ text: lines.join("\n"), images: [] }} />)
}

function shownLines(): readonly string[] {
  const paragraph = screen.getByRole("heading", { level: 2, name: "依頼" }).nextElementSibling
  return [...(paragraph?.querySelectorAll("span") ?? [])].map((line) => line.textContent)
}

const FIVE_LINES = ["架空の1行目", "架空の2行目", "架空の3行目", "架空の4行目", "架空の5行目"]

describe("RequestBlock", () => {
  it("4行までは全部出し、開く口を出さない", () => {
    renderBlock(FIVE_LINES.slice(0, 4))

    expect(shownLines()).toEqual(FIVE_LINES.slice(0, 4))
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("4行を超えると4行だけ出し、「続き n 行」で開いて「畳む」で畳み直せる", () => {
    renderBlock(FIVE_LINES)

    expect(shownLines()).toEqual(FIVE_LINES.slice(0, 4))
    const more = screen.getByRole("button", { name: "続き 1 行" })
    expect(more.getAttribute("aria-expanded")).toBe("false")

    fireEvent.click(more)
    expect(shownLines()).toEqual(FIVE_LINES)
    const collapse = screen.getByRole("button", { name: "畳む" })
    expect(collapse.getAttribute("aria-expanded")).toBe("true")

    fireEvent.click(collapse)
    expect(shownLines()).toEqual(FIVE_LINES.slice(0, 4))
    expect(screen.getByRole("button", { name: "続き 1 行" })).toBeDefined()
  })
})
