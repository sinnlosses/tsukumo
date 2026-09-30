import { describe, expect, it } from "vitest"

import {
  dailyAchievementOf,
  type DailyAchievementInput,
} from "../../../../src/server/achievement/core/daily-achievement.ts"
import type { TaskSnapshotSource } from "../../../../src/server/achievement/core/done-task-source.ts"
import type { BeadsIssue } from "../../../../src/shared/repository/beads-issue.ts"

const EMPTY_SOURCE: TaskSnapshotSource = {
  newFormatFiles: [],
  oldTasksJson: undefined,
  archiveMarkdown: undefined,
}

const RANGE = { startEpochMilliseconds: 100_000, endEpochMilliseconds: 200_000 }

function taskFile(id: string, summary: string): { name: string; content: string } {
  return {
    name: `${id}.md`,
    content: [
      "---",
      `id: ${id}`,
      `summary: ${summary}`,
      "status: done",
      "difficulty: sonnet",
      "loopable: Y",
      "dependencies: []",
      "---",
      "",
    ].join("\n"),
  }
}

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
  commits: [],
  totalCommitsBeforeToday: 0,
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
        commits,
        totalCommitsBeforeToday: 999,
        tasks: { kind: "untracked" },
      }),
    ).toEqual({
      kind: "known",
      date: "2026-01-02",
      today: "2026-01-02",
      commitCount: 2,
      doneTasks: { kind: "unknown" },
      graduations: [],
      milestones: [{ kind: "commit", count: 1000, time: "t150000" }],
      diary: { kind: "none" },
    })
  })

  it("終わりと始まりの両方で、切り口・消えたファイル・Beads の閉じた課題を足し合わせて差を取る", () => {
    const result = dailyAchievementOf({
      ...BASE,
      tasks: {
        kind: "tracked",
        endSource: {
          ...EMPTY_SOURCE,
          newFormatFiles: [taskFile("T-001", "前から"), taskFile("T-002", "今日")],
        },
        startSource: { ...EMPTY_SOURCE, newFormatFiles: [taskFile("T-001", "前から")] },
        deletedFiles: [
          {
            id: "T-003",
            committedAtEpochSeconds: 120,
            content: taskFile("T-003", "今日消えた").content,
          },
          {
            id: "T-004",
            committedAtEpochSeconds: 50,
            content: taskFile("T-004", "前に消えた").content,
          },
        ],
        issues: [
          closedIssue("tsukumo-a", "Beads の今日", 150_000),
          closedIssue("tsukumo-b", "Beads の前", 50_000),
        ],
        historyCommits: [],
        beadsCreatedOn: new Map(),
      },
    })

    expect(result).toMatchObject({
      kind: "known",
      doneTasks: {
        kind: "known",
        items: [
          { id: "T-002", summary: "今日" },
          { id: "T-003", summary: "今日消えた" },
          { id: expect.any(String), summary: "Beads の今日" },
        ],
      },
    })
  })
})
