import { describe, expect, it } from "vitest"

import {
  dailyAchievementOf,
  type DailyAchievementInput,
} from "../../../../src/server/achievement/core/daily-achievement.ts"
import type { DoneTask } from "../../../../src/shared/repository/task-summary.ts"

const RANGE = { startEpochMilliseconds: 100_000, endEpochMilliseconds: 200_000 }

function doneTask(id: string, summary: string, closedAtEpochMilliseconds: number): DoneTask {
  return { id, summary, createdAtEpochMilliseconds: 0, closedAtEpochMilliseconds }
}

const BASE: Omit<DailyAchievementInput, "done" | "registeredOn"> = {
  date: "2026-01-02",
  today: "2026-01-02",
  range: RANGE,
}

describe("dailyAchievementOf", () => {
  it("その日のうちに終えたタスクだけを拾う", () => {
    const result = dailyAchievementOf({
      ...BASE,
      done: [
        doneTask("T-001", "前の日", 50_000),
        doneTask("T-002", "今日", 150_000),
        doneTask("T-003", "次の日", 250_000),
      ],
      registeredOn: new Map(),
    })

    expect(result).toEqual({
      kind: "known",
      date: "2026-01-02",
      today: "2026-01-02",
      doneTasks: [{ id: "T-002", summary: "今日" }],
      graduations: [],
      milestones: [],
      diary: { kind: "none" },
    })
  })

  it("登録日の表から卒業を決める", () => {
    const result = dailyAchievementOf({
      ...BASE,
      done: [doneTask("T-001", "長く待った", 150_000)],
      registeredOn: new Map([["T-001", "2025-12-20"]]),
    })

    expect(result).toMatchObject({
      graduations: [{ id: "T-001", registeredOn: "2025-12-20", days: 13 }],
    })
  })
})
