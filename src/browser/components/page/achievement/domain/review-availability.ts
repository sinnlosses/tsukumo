// 振り返りのボタンを押せるかの判定。会話のターン中は塞がない。

import {
  isEmptyAchievementDay,
  type AchievementCommits,
  type AchievementDoneTasks,
} from "../../../../../shared/achievement/achievement.ts"
import type { DiaryWriting } from "../../../../../shared/diary/diary.ts"
import { monthDayLabel } from "../../../../utils/month-day-label.ts"
import { EMPTY_DAY_REASON } from "./review-note.ts"

/** 振り返りのボタンを押せるか。 */
export type AchievementReviewAvailability =
  | { readonly kind: "available" }
  | { readonly kind: "blocked"; readonly reason: string }

/** 両方成り立つときは空の日の理由だけを返す。 */
export function reviewAvailabilityOf(
  commits: AchievementCommits,
  doneTasks: AchievementDoneTasks,
  diaryWriting: DiaryWriting,
): AchievementReviewAvailability {
  if (isEmptyAchievementDay(commits, doneTasks)) {
    return { kind: "blocked", reason: EMPTY_DAY_REASON }
  }
  if (diaryWriting.kind === "writing") {
    return { kind: "blocked", reason: busyOnAnotherDayReason(diaryWriting.date) }
  }
  return { kind: "available" }
}

function busyOnAnotherDayReason(date: string): string {
  return `いま${monthDayLabel(Temporal.PlainDate.from(date))}の日記を書いているので送れない`
}
