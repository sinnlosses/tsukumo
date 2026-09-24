import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, render, screen } from "@testing-library/react"

import {
  type AchievementDaySwitch,
  type AchievementReviewButton,
} from "../../../../src/browser/features/achievement/hooks/use-achievement.ts"
import {
  PresentationalAchievementScreen,
  type PresentationalAchievementScreenProps,
} from "../../../../src/browser/features/achievement/presentational-achievement-screen.tsx"

/**
 * 見た目だけを測る（`hooks/use-achievement.ts` は素通しなので、フィクスチャは手で書いた架空の
 * 成果をそのまま渡す。`docs/coding-standards.md`「会話内容の扱い」）。空の日・数えられないときの
 * 見せ方は `docs/screen-design.md` 13.10「空の日・数えられないとき」の表がそのまま正典。
 */

afterEach(() => {
  cleanup()
})

const KNOWN_TODAY: AchievementDaySwitch = { kind: "known", date: "2026-09-24", today: "2026-09-24" }
const KNOWN_YESTERDAY: AchievementDaySwitch = {
  kind: "known",
  date: "2026-09-23",
  today: "2026-09-24",
}

const NOOP = (): void => {}

const AVAILABLE_REVIEW: AchievementReviewButton = {
  label: "つくもと振り返る",
  availability: { kind: "available" },
  onReview: NOOP,
}

const DEFAULT_PROPS: PresentationalAchievementScreenProps = {
  view: { kind: "ready", commitCount: 3, doneTasks: { kind: "known", items: [] } },
  daySwitch: KNOWN_TODAY,
  isFetching: false,
  onPreviousDay: NOOP,
  onNextDay: NOOP,
  onToday: NOOP,
  review: AVAILABLE_REVIEW,
}

function renderScreen(
  overrides: Partial<PresentationalAchievementScreenProps> = {},
): ReturnType<typeof render> {
  return render(<PresentationalAchievementScreen {...DEFAULT_PROPS} {...overrides} />)
}

describe("PresentationalAchievementScreen", () => {
  it("main が読めなければ、日の切り替えも札も出さず1行だけ", () => {
    renderScreen({ view: { kind: "unavailable" }, daySwitch: { kind: "unknown" } })

    expect(
      screen.getByText("このディレクトリでは成果を数えられない（main が読めない）"),
    ).toBeDefined()
    expect(document.querySelector(".achievement-day-switch")).toBeNull()
    expect(document.querySelector(".achievement-card")).toBeNull()
  })

  it("読み込み中は日の切り替えが押せず、札は「…」", () => {
    renderScreen({ view: { kind: "loading" }, daySwitch: { kind: "unknown" } })

    expect(screen.getByRole("button", { name: "‹ 前の日" }).getAttribute("aria-disabled")).toBe(
      "true",
    )
    expect(screen.getByRole("button", { name: "次の日 ›" }).getAttribute("aria-disabled")).toBe(
      "true",
    )
    const values = [...document.querySelectorAll(".achievement-card-value")].map(
      (node) => node.textContent,
    )
    expect(values).toEqual(["…", "…"])
  })

  it("取れなかったときは、日の切り替えは使えるまま札と一覧の代わりに1行", () => {
    renderScreen({ view: { kind: "failed" }, daySwitch: KNOWN_YESTERDAY })

    expect(screen.getByText("成果を取れなかった。")).toBeDefined()
    expect(document.querySelector(".achievement-card")).toBeNull()
    // 前の日に居るので、次の日はまだ押せる（今日ではない）。
    expect(screen.getByRole("button", { name: "次の日 ›" }).getAttribute("aria-disabled")).toBe(
      "false",
    )
  })

  it("今日を見ているときは次の日と今日へが aria-disabled、前の日は押せる", () => {
    renderScreen({ daySwitch: KNOWN_TODAY })

    expect(screen.getByRole("button", { name: "‹ 前の日" }).getAttribute("aria-disabled")).toBe(
      "false",
    )
    expect(screen.getByRole("button", { name: "次の日 ›" }).getAttribute("aria-disabled")).toBe(
      "true",
    )
    expect(screen.getByRole("button", { name: "今日へ" }).getAttribute("aria-disabled")).toBe(
      "true",
    )
  })

  it("前の日を見ているときは次の日と今日へが押せる", () => {
    renderScreen({ daySwitch: KNOWN_YESTERDAY })

    expect(screen.getByRole("button", { name: "次の日 ›" }).getAttribute("aria-disabled")).toBe(
      "false",
    )
    expect(screen.getByRole("button", { name: "今日へ" }).getAttribute("aria-disabled")).toBe(
      "false",
    )
  })

  it("見ている日の見出しは今日・昨日を頭に添える", () => {
    renderScreen({ daySwitch: KNOWN_TODAY })
    expect(document.querySelector(".achievement-day-switch-label")?.textContent).toBe(
      "今日 9月24日（木）",
    )

    cleanup()
    renderScreen({ daySwitch: KNOWN_YESTERDAY })
    expect(document.querySelector(".achievement-day-switch-label")?.textContent).toBe(
      "昨日 9月23日（水）",
    )
  })

  it("空の日（コミットも終えたタスクも0）は、札を0のまま出し一覧の場所に1行", () => {
    renderScreen({
      view: { kind: "ready", commitCount: 0, doneTasks: { kind: "known", items: [] } },
    })

    const values = [...document.querySelectorAll(".achievement-card-value")].map(
      (node) => node.textContent,
    )
    expect(values).toEqual(["0", "0"])
    expect(screen.getByText("この日に main へ入った成果は無い。")).toBeDefined()
  })

  it("コミットはあり終えたタスクが0なら、その旨の1行になる", () => {
    renderScreen({
      view: { kind: "ready", commitCount: 5, doneTasks: { kind: "known", items: [] } },
    })

    expect(screen.getByText("この日に終えたタスクは無い。")).toBeDefined()
  })

  it("タスクの記録が無いリポジトリでは、終えたタスクの札が「—」で一覧は出さない", () => {
    renderScreen({
      view: { kind: "ready", commitCount: 2, doneTasks: { kind: "unknown" } },
    })

    const values = [...document.querySelectorAll(".achievement-card-value")].map(
      (node) => node.textContent,
    )
    expect(values).toEqual(["2", "—"])
    expect(screen.getByText("タスクの記録が無い")).toBeDefined()
    expect(document.querySelector(".achievement-task")).toBeNull()
  })

  it("終えたタスクがあれば、ID と summary を並べる", () => {
    renderScreen({
      view: {
        kind: "ready",
        commitCount: 4,
        doneTasks: {
          kind: "known",
          items: [
            { id: "T-1", summary: "架空のタスク1" },
            { id: "T-2", summary: "架空のタスク2" },
          ],
        },
      },
    })

    const rows = [...document.querySelectorAll(".achievement-task")].map((node) => node.textContent)
    expect(rows).toEqual(["T-1架空のタスク1", "T-2架空のタスク2"])
  })

  it("日を切り替えている間は薄く残す", () => {
    renderScreen({ isFetching: true })

    expect(document.querySelector(".achievement-content")?.className).toContain("is-fetching")
  })

  it("押せるときはボタンが出て、押すと onReview が1回呼ばれる", () => {
    let calls = 0
    renderScreen({ review: { ...AVAILABLE_REVIEW, onReview: () => (calls += 1) } })

    const button = screen.getByRole("button", { name: "つくもと振り返る" })
    expect(button.getAttribute("aria-disabled")).toBe("false")

    button.click()

    expect(calls).toBe(1)
  })

  it("押せないときは aria-disabled になり、理由が下に出る", () => {
    renderScreen({
      review: {
        label: "つくもと振り返る",
        availability: { kind: "blocked", reason: "いまターンが動いているので送れない" },
        onReview: NOOP,
      },
    })

    expect(
      screen.getByRole("button", { name: "つくもと振り返る" }).getAttribute("aria-disabled"),
    ).toBe("true")
    expect(screen.getByText("いまターンが動いているので送れない")).toBeDefined()
  })

  it("読み込み中・取れなかったときはボタンを出さない", () => {
    renderScreen({ view: { kind: "loading" }, daySwitch: { kind: "unknown" } })
    expect(screen.queryByRole("button", { name: /振り返る/ })).toBeNull()

    cleanup()
    renderScreen({ view: { kind: "failed" }, daySwitch: KNOWN_YESTERDAY })
    expect(screen.queryByRole("button", { name: /振り返る/ })).toBeNull()
  })
})
