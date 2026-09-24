import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, render, screen } from "@testing-library/react"

import { LanternCalendar } from "../../../../src/browser/features/achievement/lantern-calendar.tsx"
import {
  achievementCalendarDateKeys,
  type AchievementCalendar,
} from "../../../../src/shared/achievement-calendar.ts"

afterEach(() => {
  cleanup()
})

const TODAY = "2026-09-24"
const DATE_KEYS = achievementCalendarDateKeys(TODAY)

const KNOWN: AchievementCalendar = {
  kind: "known",
  today: TODAY,
  days: [
    { date: DATE_KEYS[DATE_KEYS.length - 1] ?? TODAY, commitCount: 42 },
    { date: DATE_KEYS[0] ?? TODAY, commitCount: 0 },
  ],
  diaryDates: [TODAY],
}

describe("LanternCalendar", () => {
  it("読み込み中は「…」だけ", () => {
    render(
      <LanternCalendar
        calendar={{ kind: "loading" }}
        viewedDate={undefined}
        onSelectDate={() => {}}
      />,
    )
    expect(screen.getByText("…")).toBeDefined()
    expect(document.querySelectorAll(".achievement-calendar-day")).toHaveLength(0)
  })

  it("取れなかったときは1行だけ", () => {
    render(
      <LanternCalendar
        calendar={{ kind: "unknown" }}
        viewedDate={undefined}
        onSelectDate={() => {}}
      />,
    )
    expect(screen.getByText("灯りの暦を取れなかった。")).toBeDefined()
  })

  it("範囲ぶんのマスを並べ、今日のマスに「今日」を添える", () => {
    render(<LanternCalendar calendar={KNOWN} viewedDate={undefined} onSelectDate={() => {}} />)

    expect(document.querySelectorAll(".achievement-calendar-day")).toHaveLength(DATE_KEYS.length)
    const today = screen.getByRole("button", { name: /9月24日/ })
    expect(today.getAttribute("data-today")).toBe("yes")
  })

  it("見ている日のマスに枠が付く", () => {
    const viewed = DATE_KEYS[0] ?? TODAY
    render(<LanternCalendar calendar={KNOWN} viewedDate={viewed} onSelectDate={() => {}} />)

    const cells = [...document.querySelectorAll(".achievement-calendar-day")]
    const viewedCell = cells.find((cell) => cell.getAttribute("data-viewed") === "yes")
    expect(viewedCell).toBeDefined()
  })

  it("日記のある日には鈴が付く", () => {
    render(<LanternCalendar calendar={KNOWN} viewedDate={undefined} onSelectDate={() => {}} />)

    const today = screen.getByRole("button", { name: /日記あり/ })
    expect(today).toBeDefined()
  })

  it("マスを押すと onSelectDate にその日付が渡る", () => {
    const selected: string[] = []
    render(
      <LanternCalendar
        calendar={KNOWN}
        viewedDate={undefined}
        onSelectDate={(date) => {
          selected.push(date)
        }}
      />,
    )

    const today = screen.getByRole("button", { name: /9月24日/ })
    today.click()

    expect(selected).toEqual([TODAY])
  })

  it("今日より後のマスは押せる要素でなく、灰色の日付だけ", () => {
    render(<LanternCalendar calendar={KNOWN} viewedDate={undefined} onSelectDate={() => {}} />)

    expect(document.querySelectorAll(".achievement-calendar-future").length).toBeGreaterThan(0)
  })
})
