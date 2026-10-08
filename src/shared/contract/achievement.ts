// 成果の手続きの契約。
// 運ぶのはタスクの ID と要約・数・日記で、会話の文面は入らない。

import { oc } from "@orpc/contract"

import { achievementCalendarSchema } from "../achievement/achievement-calendar.ts"
import {
  achievementDaySelectionSchema,
  dailyAchievementSchema,
} from "../achievement/achievement.ts"

/**
 * `.beads` があるのに `bd` が落ちた・時間切れ（部分的な数を出さない）。
 * `.beads` が無いだけなら失敗にせず `{ kind: "unknown" }` を返す。
 */
const achievementErrors = oc.errors({ UNAVAILABLE: { status: 503 } })

export const achievementContract = {
  /** 1日ぶんの成果（成果の画面と日記帳の見開きが読む）。 */
  day: achievementErrors.input(achievementDaySelectionSchema).output(dailyAchievementSchema),
  /** 灯りの暦（今日を含む直近5週ぶん）。 */
  calendar: achievementErrors.output(achievementCalendarSchema),
}
