import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { Markdown } from "../../../../../../../../src/browser/components/page/conversation/components/markdown/renderer/markdown-renderer.tsx"

afterEach(() => {
  cleanup()
})

function tableText(rowCount: number): string {
  const rows = Array.from({ length: rowCount }, (_, index) => `| 行${index + 1} | v${index + 1} |`)
  return ["| 名前 | 値 |", "| --- | --- |", ...rows].join("\n")
}

function listText(itemCount: number, marker: string): string {
  return Array.from({ length: itemCount }, (_, index) => `${marker} 項目${index + 1}`).join("\n")
}

describe("長い表・一覧の畳み", () => {
  it("表は 10 行ちょうどなら切らない", () => {
    const { container } = render(<Markdown text={tableText(10)} />)

    expect(container.querySelectorAll("tbody tr")).toHaveLength(10)
    expect(screen.queryByRole("button", { name: /ほか/ })).toBeNull()
  })

  it("表は 11 行以上なら 10 行で切って「ほか n 件」を出し、押すと全部出る", () => {
    const { container } = render(<Markdown text={tableText(13)} />)

    // 10 行＋「ほか n 件」の行
    expect(container.querySelectorAll("tbody tr")).toHaveLength(11)
    expect(container.querySelector("tbody")?.textContent).not.toContain("行11")
    fireEvent.click(screen.getByRole("button", { name: "ほか 3 件" }))

    expect(container.querySelectorAll("tbody tr")).toHaveLength(13)
    expect(container.querySelector("tbody")?.textContent).toContain("行13")
    expect(screen.queryByRole("button", { name: /ほか/ })).toBeNull()
  })

  it.each([
    ["ul", "-"],
    ["ol", "1."],
  ])("%s は 10 項目ちょうどなら切らない", (tag, marker) => {
    const { container } = render(<Markdown text={listText(10, marker)} />)

    expect(container.querySelectorAll(`${tag} > li`)).toHaveLength(10)
    expect(screen.queryByRole("button", { name: /ほか/ })).toBeNull()
  })

  it.each([
    ["ul", "-"],
    ["ol", "1."],
  ])("%s は 11 項目以上なら 10 項目で切って「ほか n 件」を出し、押すと全部出る", (tag, marker) => {
    const { container } = render(<Markdown text={listText(12, marker)} />)

    expect(container.querySelectorAll(`${tag} > li`)).toHaveLength(11)
    expect(container.textContent).not.toContain("項目11")
    fireEvent.click(screen.getByRole("button", { name: "ほか 2 件" }))

    expect(container.querySelectorAll(`${tag} > li`)).toHaveLength(12)
    expect(container.textContent).toContain("項目12")
  })

  it("脚注の節の ol は切らない", () => {
    const refs = Array.from({ length: 12 }, (_, index) => `[^${index + 1}]`).join("")
    const defs = Array.from({ length: 12 }, (_, index) => `[^${index + 1}]: 注${index + 1}`).join(
      "\n\n",
    )
    const { container } = render(<Markdown text={`本文${refs}\n\n${defs}`} />)

    expect(container.querySelectorAll("section ol > li")).toHaveLength(12)
    expect(screen.queryByRole("button", { name: /ほか/ })).toBeNull()
  })
})
