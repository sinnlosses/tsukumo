import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { PaperDesk } from "../../../../../../../src/browser/components/page/conversation/components/paper-desk/paper-desk.tsx"

afterEach(() => {
  cleanup()
})

function desk(posture: "greet" | "work" | "deliver", withInquiry: boolean) {
  return (
    <PaperDesk
      posture={posture}
      greeting={<p>迎えの一言</p>}
      paper={<p>紙の本文</p>}
      sidebar={<aside data-region="sidebar">サイドバーの中身</aside>}
      dock={<p>入力欄の中身</p>}
      inquiry={withInquiry ? <p>架空の選択肢</p> : undefined}
    />
  )
}

describe("PaperDesk", () => {
  it.each(["work", "deliver"] as const)(
    "%s の姿勢で尋ねるあいだは、入力欄の場所に選択肢を出す",
    (posture) => {
      render(desk(posture, true))

      const dock = document.querySelector('[data-region="dock"]')
      expect(dock?.getAttribute("data-posture")).toBe("ask")
      expect(dock?.textContent).toContain("架空の選択肢")
    },
  )

  it("迎える姿勢でも、尋ねるあいだは入力欄の場所に選択肢を出す", () => {
    render(desk("greet", true))

    expect(document.querySelector('[data-region="dock"]')?.textContent).toContain("架空の選択肢")
  })

  it("迎える姿勢でも、紙の先頭に迎えの一言を置いて始め方を続け、home の場所は無い", () => {
    render(desk("greet", false))

    const paper = document.querySelector('[data-region="paper"]')
    expect(paper?.textContent).toBe("迎えの一言紙の本文")
    expect(document.querySelector('[data-region="home"]')).toBeNull()
    expect(paper?.parentElement).toBe(document.querySelector('[data-region="dock"]')?.parentElement)
  })

  it.each(["greet", "work", "deliver"] as const)(
    "%s の姿勢では、紙と入力欄のあとにサイドバーを3列目に置き、欄外は置かない",
    (posture) => {
      render(desk(posture, false))

      const regions = [...document.querySelectorAll("[data-region]")].map((node) =>
        node.getAttribute("data-region"),
      )
      expect(regions).toEqual(["paper", "dock", "sidebar"])
    },
  )

  it("尋ねていなければ選択肢を出さない", () => {
    render(desk("work", false))

    expect(screen.queryByText("架空の選択肢")).toBeNull()
  })
})
