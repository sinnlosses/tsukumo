import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, render, screen } from "@testing-library/react"

import {
  type AchievementDaySwitch,
  type AchievementReviewButton,
} from "../../../../../src/browser/components/page/achievement/hooks/use-achievement.ts"
import { type DiaryBookModel } from "../../../../../src/browser/components/page/achievement/hooks/use-diary-book.ts"
import {
  PresentationalAchievement,
  type PresentationalAchievementProps,
} from "../../../../../src/browser/components/page/achievement/presentational-achievement.tsx"

/**
 * 各区画（`day-switch.tsx` / `diary-section.tsx` / `bookmark-section.tsx` /
 * `surprise-section.tsx` / `lantern-calendar.tsx`）の中身は個別のテストが持つ。ここは
 * **並ぶ順と、main が読めないときに他をすべて隠すこと**だけを測る（フィクスチャは架空の値。
 * docs/coding-standards.md「会話内容の扱い」）。
 */

afterEach(() => {
  cleanup()
})

const NOOP = (): void => {}
const NOOP_DATE = (_date: string): void => {}

const KNOWN_TODAY: AchievementDaySwitch = { kind: "known", date: "2026-09-24", today: "2026-09-24" }

const AVAILABLE_REVIEW: AchievementReviewButton = {
  label: "架空の名前と振り返る",
  availability: { kind: "available" },
  onReview: NOOP,
}

const CLOSED_DIARY_BOOK: DiaryBookModel = {
  open: false,
  openNote: "",
  page: { kind: "loading" },
  previous: undefined,
  next: undefined,
  toc: { open: false, months: [] },
  onOpenFromCalendar: NOOP_DATE,
  onOpenFromDiarySection: NOOP,
  onPrevious: NOOP,
  onNext: NOOP,
  onToggleToc: NOOP,
  onSelectTocDate: NOOP_DATE,
  onClose: NOOP,
}

const DEFAULT_PROPS: PresentationalAchievementProps = {
  view: {
    kind: "ready",
    commitCount: 3,
    doneTasks: { kind: "known", items: [] },
    graduations: [],
    milestones: [],
    diary: { kind: "none" },
  },
  daySwitch: KNOWN_TODAY,
  isFetching: false,
  onPreviousDay: NOOP,
  onNextDay: NOOP,
  onToday: NOOP,
  onSelectDate: NOOP_DATE,
  review: AVAILABLE_REVIEW,
  writing: { kind: "none" },
  diaryPortrait: {
    name: "架空の名前",
    portrait: { portraitUrl: undefined, accent: undefined, altText: "" },
  },
  diaryReveal: false,
  calendar: { kind: "loading" },
  onOpenDiaryBook: NOOP,
  diaryBook: CLOSED_DIARY_BOOK,
}

function renderScreen(
  overrides: Partial<PresentationalAchievementProps> = {},
): ReturnType<typeof render> {
  return render(<PresentationalAchievement {...DEFAULT_PROPS} {...overrides} />)
}

describe("PresentationalAchievement", () => {
  it("main が読めなければ、日の切り替え・日記の区画・暦を出さず1行だけ", () => {
    renderScreen({ view: { kind: "unavailable" }, daySwitch: { kind: "unknown" } })

    expect(
      screen.getByText("このディレクトリでは成果を数えられない（main が読めない）"),
    ).toBeDefined()
    // `.achievement-day-switch` は並べるだけの規則だったので `HStack` に置き換わり、
    // 消えている（`docs/design.md` 2章）。日の切り替えの中身（`.achievement-day-switch-nav`。
    // 置き方だけを持つので残っている）が無いことで、区画そのものが出ていないと分かる。
    expect(document.querySelector(".achievement-day-switch-nav")).toBeNull()
    expect(document.querySelector(".achievement-diary")).toBeNull()
    expect(document.querySelector(".achievement-calendar")).toBeNull()
  })

  it("日の切り替え → 日記の区画 → 灯りの暦の順で並ぶ（しおり・小さな驚きは無ければ挟まらない）", () => {
    renderScreen()

    const root = document.querySelector(".achievement")
    const children = [...(root?.children ?? [])]
    // 灯りの暦は achievement-calendar のクラスを持つ区画として最後に来る。
    expect(children.at(-1)?.className).toBe("achievement-calendar")
    // 日の切り替えの外枠は `HStack` に置き換わって固有の class を持たないので、中身
    // （`.achievement-day-switch-nav`）で見分ける。
    expect(children[0]?.querySelector(".achievement-day-switch-nav")).not.toBeNull()
  })

  it("しおりがあれば日記の区画のあとに出る", () => {
    renderScreen({
      view: {
        kind: "ready",
        commitCount: 3,
        doneTasks: { kind: "known", items: [{ id: "T-1", summary: "架空のタスク" }] },
        graduations: [],
        milestones: [],
        diary: {
          kind: "written",
          diary: {
            version: 1,
            date: "2026-09-24",
            paragraphs: [
              {
                writtenAt: "2026-09-24T21:40:00+09:00",
                body: "架空の本文。",
                expression: "proud",
                writer: { pack: "fixture", name: "架空の名前" },
              },
            ],
            bookmark: {
              kind: "placed",
              taskId: "T-1",
              summary: "架空のタスク",
              reason: "架空の理由",
            },
          },
        },
      },
    })

    expect(screen.getByText("架空の名前が選んだ この日のいちばん")).toBeDefined()
  })

  it("灯りの暦は main が読める限り、1日ぶんが取れていなくても出る", () => {
    renderScreen({ view: { kind: "failed" }, calendar: { kind: "loading" } })

    expect(document.querySelector(".achievement-calendar")).not.toBeNull()
    expect(screen.getByText("成果を取れなかった。")).toBeDefined()
  })
})
