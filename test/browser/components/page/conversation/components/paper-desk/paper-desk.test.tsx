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
      margin={{ title: "欄外", body: <p>欄外の中身</p> }}
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

  it("迎える姿勢では、入力欄の場所を始め方より後ろに並べる", () => {
    render(desk("greet", false))

    const body = document.querySelector('[data-region="paper"]')
    const dock = document.querySelector('[data-region="dock"]')
    const regions = [...document.querySelectorAll("[data-region]")]
    expect(regions.indexOf(body ?? document.body)).toBeLessThan(
      regions.indexOf(dock ?? document.body),
    )
    expect(body).not.toBeNull()
    expect(dock).not.toBeNull()
  })

  it("尋ねていなければ選択肢を出さない", () => {
    render(desk("work", false))

    expect(screen.queryByText("架空の選択肢")).toBeNull()
  })
})
