import { describe, expect, it } from "vitest"

import {
  dailyAchievementOf,
  type DailyAchievementInput,
} from "../../../../src/server/achievement/core/daily-achievement.ts"
import type { BeadsIssue } from "../../../../src/shared/repository/beads-issue.ts"

const RANGE = { startEpochMilliseconds: 100_000, endEpochMilliseconds: 200_000 }

function closedIssue(id: string, title: string, closedAtEpochMilliseconds: number): BeadsIssue {
  return {
    id,
    title,
    status: "closed",
    labels: [],
    blockedBy: [],
    assignee: undefined,
    createdAtEpochMilliseconds: 0,
    closedAtEpochMilliseconds,
    description: "",
    acceptanceCriteria: "",
    notes: "",
    externalRef: undefined,
  }
}

const BASE: Omit<DailyAchievementInput, "tasks"> = {
  date: "2026-01-02",
  today: "2026-01-02",
  range: RANGE,
  commits: { kind: "read", commits: [], totalCommitsBeforeToday: 0 },
  timeOf: (epochMilliseconds) => `t${epochMilliseconds}`,
}

describe("dailyAchievementOf", () => {
  it("終えたタスクを数えられないときは、コミットの節目だけを返す", () => {
    const commits = [
      { hash: "a", committedAtEpochSeconds: 150, changedFiles: ["src/a.ts"] },
      { hash: "b", committedAtEpochSeconds: 160, changedFiles: ["src/b.ts"] },
    ]

    expect(
      dailyAchievementOf({
        ...BASE,
        commits: { kind: "read", commits, totalCommitsBeforeToday: 999 },
        tasks: { kind: "untracked" },
      }),
    ).toEqual({
      kind: "known",
      date: "2026-01-02",
      today: "2026-01-02",
      commits: { kind: "known", count: 2 },
      doneTasks: { kind: "unknown" },
      graduations: [],
      milestones: [{ kind: "commit", count: 1000, time: "t150000" }],
      diary: { kind: "none" },
    })
  })

  it("その日のうちに閉じた課題だけを終えたタスクにし、取り下げた課題は数えない", () => {
    const dropped = { ...closedIssue("t-004", "取り下げ", 160_000), labels: ["cancelled"] }
    const result = dailyAchievementOf({
      ...BASE,
      tasks: {
        kind: "tracked",
        issues: [
          closedIssue("t-001", "前の日", 50_000),
          closedIssue("t-002", "今日", 150_000),
          closedIssue("t-003", "次の日", 250_000),
          dropped,
        ],
        registeredOn: new Map(),
      },
    })

    expect(result).toMatchObject({
      kind: "known",
      doneTasks: { kind: "known", items: [{ id: "T-002", summary: "今日" }] },
    })
  })

  it("コミットを読めていなければ、コミットの数は unknown で節目「commit」も出さない", () => {
    const result = dailyAchievementOf({
      ...BASE,
      commits: { kind: "unread" },
      tasks: {
        kind: "tracked",
        issues: [closedIssue("t-001", "今日", 150_000)],
        registeredOn: new Map(),
      },
    })

    expect(result).toMatchObject({
      commits: { kind: "unknown" },
      doneTasks: { kind: "known", items: [{ id: "T-001", summary: "今日" }] },
      milestones: [],
    })
  })

  it("登録日の表から卒業を決める", () => {
    const result = dailyAchievementOf({
      ...BASE,
      tasks: {
        kind: "tracked",
        issues: [closedIssue("t-001", "長く待った", 150_000)],
        registeredOn: new Map([["T-001", "2025-12-20"]]),
      },
    })

    expect(result).toMatchObject({
      graduations: [{ id: "T-001", registeredOn: "2025-12-20", days: 13 }],
    })
  })
})
