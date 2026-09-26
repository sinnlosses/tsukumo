// 成果の手続きの契約（`docs/glossary.md`「契約」）。受け手は
// `src/server/achievement/adapter/achievement-procedure.ts`。形そのもの（応答の型と zod）は
// `src/shared/achievement.ts`（1日ぶん）と `src/shared/achievement-calendar.ts`（灯りの暦）。
//
// 運ぶのはコミットの数・タスクの ID と要約・日記で、コミットの件名も会話の文面も入らない
// （`docs/coding-standards.md`「会話内容の扱い」）。

import { oc } from "@orpc/contract"

import { achievementCalendarSchema } from "../achievement-calendar.ts"
import { achievementDaySelectionSchema, dailyAchievementSchema } from "../achievement.ts"

/**
 * `git` のタイムアウト・失敗（部分的な数を出さない）。`main` が読めないだけなら失敗にせず
 * `{ kind: "unknown" }` を返す（`src/server/achievement/adapter/main-history.ts` の
 * `ReadAchievementResult`）。
 */
const achievementErrors = oc.errors({ UNAVAILABLE: { status: 503 } })

export const achievementContract = {
  /** 1日ぶんの成果（成果の画面と日記帳の見開きが読む）。 */
  day: achievementErrors.input(achievementDaySelectionSchema).output(dailyAchievementSchema),
  /** 灯りの暦（今日を含む直近5週ぶん）。 */
  calendar: achievementErrors.output(achievementCalendarSchema),
}
