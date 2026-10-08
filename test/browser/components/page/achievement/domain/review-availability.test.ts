import { describe, expect, it } from "vitest"

import { reviewAvailabilityOf } from "../../../../../../src/browser/components/page/achievement/domain/review-availability.ts"
import type { AchievementTask } from "../../../../../../src/shared/achievement/achievement.ts"
import type { DiaryWriting } from "../../../../../../src/shared/diary/diary.ts"

const ONE_TASK: readonly AchievementTask[] = [{ id: "T-1", summary: "架空のタスク" }]
const NO_TASKS: readonly AchievementTask[] = []
const IDLE: DiaryWriting = { kind: "idle" }
const WRITING_OTHER_DAY: DiaryWriting = {
  kind: "writing",
  date: "2026-09-20",
  startedAt: 0,
  stage: "read",
}

describe("reviewAvailabilityOf", () => {
  it("終えたタスクがあって日記を書いていなければ押せる", () => {
    expect(reviewAvailabilityOf(ONE_TASK, IDLE)).toEqual({ kind: "available" })
  })

  it("終えたタスクが無い日は成果が無い理由で塞ぐ", () => {
    expect(reviewAvailabilityOf(NO_TASKS, IDLE)).toEqual({
      kind: "blocked",
      reason: "振り返る成果が無い",
    })
  })

  it("ほかの日の日記を書いている最中は、その日付を添えて塞ぐ", () => {
    expect(reviewAvailabilityOf(ONE_TASK, WRITING_OTHER_DAY)).toEqual({
      kind: "blocked",
      reason: "いま9月20日の日記を書いているので送れない",
    })
  })

  it("空の日と書き込み中が両方成り立つときは空の日の理由を返す", () => {
    expect(reviewAvailabilityOf(NO_TASKS, WRITING_OTHER_DAY)).toEqual({
      kind: "blocked",
      reason: "振り返る成果が無い",
    })
  })

  it.each([
    { kind: "written", date: "2026-09-20", writtenAt: 0 },
    { kind: "failed", date: "2026-09-20" },
  ] satisfies readonly DiaryWriting[])("日記が $kind なら押せる", (diaryWriting) => {
    expect(reviewAvailabilityOf(ONE_TASK, diaryWriting)).toEqual({ kind: "available" })
  })
})
