import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, render, screen } from "@testing-library/react"

import { DaySwitch } from "../../../../src/browser/features/achievement/day-switch.tsx"
import { type AchievementDaySwitch } from "../../../../src/browser/features/achievement/hooks/use-achievement.ts"

afterEach(() => {
  cleanup()
})

const NOOP = (): void => {}

const KNOWN_TODAY: AchievementDaySwitch = { kind: "known", date: "2026-09-24", today: "2026-09-24" }
const KNOWN_YESTERDAY: AchievementDaySwitch = {
  kind: "known",
  date: "2026-09-23",
  today: "2026-09-24",
}
const KNOWN_OTHER_YEAR: AchievementDaySwitch = {
  kind: "known",
  date: "2025-01-05",
  today: "2026-09-24",
}

function renderSwitch(daySwitch: AchievementDaySwitch): ReturnType<typeof render> {
  return render(
    <DaySwitch daySwitch={daySwitch} onPreviousDay={NOOP} onNextDay={NOOP} onToday={NOOP} />,
  )
}

describe("DaySwitch", () => {
  it("今日を見ているときは次の日が aria-disabled で、今日へは出ない", () => {
    renderSwitch(KNOWN_TODAY)

    expect(screen.getByRole("button", { name: "前の日" }).getAttribute("aria-disabled")).toBe(
      "false",
    )
    expect(screen.getByRole("button", { name: "次の日" }).getAttribute("aria-disabled")).toBe(
      "true",
    )
    expect(screen.queryByRole("button", { name: "今日へ" })).toBeNull()
  })

  it("今日以外を見ているときは今日へが出て、次の日も押せる", () => {
    renderSwitch(KNOWN_YESTERDAY)

    expect(screen.getByRole("button", { name: "次の日" }).getAttribute("aria-disabled")).toBe(
      "false",
    )
    expect(screen.getByRole("button", { name: "今日へ" })).toBeDefined()
  })

  it("見出しは今日・昨日を上に添える", () => {
    renderSwitch(KNOWN_TODAY)
    expect(document.querySelector(".achievement-day-switch-relative")?.textContent).toBe("今日")
    expect(document.querySelector(".achievement-day-switch-date")?.textContent).toBe(
      "9月24日（木）",
    )

    cleanup()
    renderSwitch(KNOWN_YESTERDAY)
    expect(document.querySelector(".achievement-day-switch-relative")?.textContent).toBe("昨日")
  })

  it("今年でなければ年を添える", () => {
    renderSwitch(KNOWN_OTHER_YEAR)
    expect(document.querySelector(".achievement-day-switch-date")?.textContent).toBe(
      "2025年1月5日（日）",
    )
  })

  it("読み込み中（unknown）は3つとも押せない", () => {
    renderSwitch({ kind: "unknown" })

    expect(screen.getByRole("button", { name: "前の日" }).getAttribute("aria-disabled")).toBe(
      "true",
    )
    expect(screen.getByRole("button", { name: "次の日" }).getAttribute("aria-disabled")).toBe(
      "true",
    )
    expect(screen.queryByRole("button", { name: "今日へ" })).toBeNull()
  })
})
