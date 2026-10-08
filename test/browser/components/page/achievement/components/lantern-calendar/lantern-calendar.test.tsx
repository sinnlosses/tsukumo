import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { LanternCalendar } from "../../../../../../../src/browser/components/page/achievement/components/lantern-calendar/lantern-calendar.tsx"
import type {
  AchievementCalendarView,
  CalendarCell,
} from "../../../../../../../src/browser/components/page/achievement/hooks/use-achievement-calendar.ts"
import { achievementCalendarDateKeys } from "../../../../../../../src/shared/achievement/achievement-calendar.ts"

afterEach(() => {
  cleanup()
})

const TODAY = "2026-09-24"
const DATE_KEYS = achievementCalendarDateKeys(TODAY)

const DAY_CELLS: readonly CalendarCell[] = DATE_KEYS.map((date): CalendarCell => {
  const day = Number(date.slice(8))
  return {
    kind: "day",
    key: date,
    date,
    dateLabel: String(day),
    level: date === TODAY ? "bright" : "none",
    hasDiary: date === TODAY,
    isToday: date === TODAY,
    ariaLabel: `${String(Number(date.slice(5, 7)))}月${String(day)}日 灯り ${date === TODAY ? "明るい・日記あり" : "灯りなし"}`,
  }
})

const KNOWN: AchievementCalendarView = {
  kind: "known",
  today: TODAY,
  days: [],
  diaryDates: [TODAY],
  cells: [
    ...DAY_CELLS,
    { kind: "future", key: "2026-09-25", dateLabel: "25" },
    { kind: "future", key: "2026-09-26", dateLabel: "26" },
  ],
  rangeLabel: "8月24日〜9月26日",
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
