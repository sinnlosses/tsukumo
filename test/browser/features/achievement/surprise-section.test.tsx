import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, render, screen } from "@testing-library/react"

import { SurpriseSection } from "../../../../src/browser/features/achievement/surprise-section.tsx"
import {
  type AchievementGraduation,
  type AchievementMilestone,
} from "../../../../src/shared/achievement.ts"

afterEach(() => {
  cleanup()
})

const GRADUATION: AchievementGraduation = {
  id: "T-10",
  summary: "架空の卒業タスク",
  registeredOn: "2026-09-12",
  days: 12,
}

const TASK_MILESTONE: AchievementMilestone = { kind: "task", count: 500, taskId: "T-50" }
const COMMIT_MILESTONE: AchievementMilestone = { kind: "commit", count: 1000, time: "14:12" }

describe("SurpriseSection", () => {
  it("どちらも無ければ何も描かない", () => {
    const { container } = render(<SurpriseSection graduations={[]} milestones={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it("卒業の札は ID・summary・登録からの日数・登録日を出す", () => {
    render(<SurpriseSection graduations={[GRADUATION]} milestones={[]} />)

    expect(screen.getByText("先輩タスクの卒業")).toBeDefined()
    expect(screen.getByText("T-10")).toBeDefined()
    expect(screen.getByText(/架空の卒業タスク/)).toBeDefined()
    expect(screen.getByText("12")).toBeDefined()
    expect(screen.getByText("9月12日から、おつかれさまでした")).toBeDefined()
  })

  it("タスクの節目は3桁ごとに区切り、ID の文を出す", () => {
    render(<SurpriseSection graduations={[]} milestones={[TASK_MILESTONE]} />)

    expect(screen.getByText("件目のタスク")).toBeDefined()
    expect(screen.getByText("500")).toBeDefined()
    expect(screen.getByText("T-50 が 500 件目になりました。")).toBeDefined()
  })

  it("コミットの節目は3桁区切りとカンマ、時刻の文を出す", () => {
    render(<SurpriseSection graduations={[]} milestones={[COMMIT_MILESTONE]} />)

    expect(screen.getByText("1,000")).toBeDefined()
    expect(screen.getByText("[14:12] のコミットが 1,000 件目になりました。")).toBeDefined()
  })
})
