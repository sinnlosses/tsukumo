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
  return [...(paragraph?.querySelectorAll(":scope > span > span") ?? [])].map(
    (line) => line.textContent,
  )
}

/** 1行目が省略されている（scrollWidth が clientWidth を超える）ことにする。 */
function pretendEllipsized(): () => void {
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollWidth")
  Object.defineProperty(HTMLElement.prototype, "scrollWidth", {
    configurable: true,
    get: () => 100,
  })
  return () => {
    if (original === undefined) {
      Reflect.deleteProperty(HTMLElement.prototype, "scrollWidth")
    } else {
      Object.defineProperty(HTMLElement.prototype, "scrollWidth", original)
    }
  }
}

describe("RequestBlock", () => {
  it("1行に収まる短い依頼は、1行目だけ出して開く口を出さない", () => {
    renderBlock(["架空の短い依頼"])

    expect(shownLines()).toEqual(["架空の短い依頼"])
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("2行以上の依頼は1行目だけ出し、「全文」で全行を開いて「畳む」で畳み直せる", () => {
    renderBlock(["架空の1行目", "架空の2行目", "架空の3行目"])

    expect(shownLines()).toEqual(["架空の1行目"])
    const open = screen.getByRole("button", { name: "全文" })
    expect(open.getAttribute("aria-expanded")).toBe("false")

    fireEvent.click(open)
    expect(shownLines()).toEqual(["架空の1行目", "架空の2行目", "架空の3行目"])
    const collapse = screen.getByRole("button", { name: "畳む" })
    expect(collapse.getAttribute("aria-expanded")).toBe("true")

    fireEvent.click(collapse)
    expect(shownLines()).toEqual(["架空の1行目"])
    expect(screen.getByRole("button", { name: "全文" })).toBeDefined()
  })

  it("1行でも省略されているときは開く口が出る", () => {
    const restore = pretendEllipsized()
    try {
      renderBlock(["架空の長い1行の依頼"])

      expect(screen.getByRole("button", { name: "全文" })).toBeDefined()
    } finally {
      restore()
    }
  })

  it("画像を添えた依頼は、開くと画像が出て、畳んでいる間は出ない", () => {
    render(
      <RequestBlock
        request={{
          text: "架空の依頼",
          images: [{ id: "架空の画像", thumbnail: "data:image/png;base64,AAAA" }],
        }}
      />,
    )

    expect(document.querySelector("img")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "全文" }))
    expect(document.querySelector("img")).not.toBeNull()
  })

  it("狭い画面専用の板を持たない", () => {
    renderBlock(["架空の1行目", "架空の2行目"])

    expect(document.querySelector("dialog")).toBeNull()
  })
})
