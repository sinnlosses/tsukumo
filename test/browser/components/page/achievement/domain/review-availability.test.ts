import { describe, expect, it } from "vitest"

import { reviewAvailabilityOf } from "../../../../../../src/browser/components/page/achievement/domain/review-availability.ts"
import type {
  AchievementCommits,
  AchievementDoneTasks,
} from "../../../../../../src/shared/achievement/achievement.ts"
import type { DiaryWriting } from "../../../../../../src/shared/diary/diary.ts"

const THREE_COMMITS: AchievementCommits = { kind: "known", count: 3 }
const NO_COMMITS: AchievementCommits = { kind: "known", count: 0 }
const NO_TASKS: AchievementDoneTasks = { kind: "known", items: [] }
const UNKNOWN_TASKS: AchievementDoneTasks = { kind: "unknown" }
const IDLE: DiaryWriting = { kind: "idle" }
const WRITING_OTHER_DAY: DiaryWriting = {
  kind: "writing",
  date: "2026-09-20",
  startedAt: 0,
  stage: "read",
}

describe("reviewAvailabilityOf", () => {
  it("成果があって日記を書いていなければ押せる", () => {
    expect(reviewAvailabilityOf(THREE_COMMITS, NO_TASKS, IDLE)).toEqual({ kind: "available" })
  })

  it("コミットも完了タスクも無い日は成果が無い理由で塞ぐ", () => {
    expect(reviewAvailabilityOf(NO_COMMITS, NO_TASKS, IDLE)).toEqual({
      kind: "blocked",
      reason: "振り返る成果が無い",
    })
  })

  it("完了タスクが読めていなければ空の日にしない", () => {
    expect(reviewAvailabilityOf(NO_COMMITS, UNKNOWN_TASKS, IDLE)).toEqual({ kind: "available" })
  })

  it("コミットの数が分からなくても、完了タスクが無い日は成果が無い理由で塞ぐ", () => {
    expect(reviewAvailabilityOf({ kind: "unknown" }, NO_TASKS, IDLE)).toEqual({
      kind: "blocked",
      reason: "振り返る成果が無い",
    })
  })

  it("ほかの日の日記を書いている最中は、その日付を添えて塞ぐ", () => {
    expect(reviewAvailabilityOf(THREE_COMMITS, NO_TASKS, WRITING_OTHER_DAY)).toEqual({
      kind: "blocked",
      reason: "いま9月20日の日記を書いているので送れない",
    })
  })

  it("空の日と書き込み中が両方成り立つときは空の日の理由を返す", () => {
    expect(reviewAvailabilityOf(NO_COMMITS, NO_TASKS, WRITING_OTHER_DAY)).toEqual({
      kind: "blocked",
      reason: "振り返る成果が無い",
    })
  })

  it.each([
    { kind: "written", date: "2026-09-20", writtenAt: 0 },
    { kind: "failed", date: "2026-09-20" },
  ] satisfies readonly DiaryWriting[])("日記が $kind なら押せる", (diaryWriting) => {
    expect(reviewAvailabilityOf(THREE_COMMITS, NO_TASKS, diaryWriting)).toEqual({
      kind: "available",
    })
  })
})
