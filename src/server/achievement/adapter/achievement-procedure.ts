// 成果の手続き（`docs/glossary.md`「手続き」）。形は `src/shared/contract/achievement.ts`、束ねるのは
// 配線の `src/router.ts`。照合は束ねる側のミドルウェアが済ませている。
//
// **`git` のタイムアウト・失敗を契約のエラー（`UNAVAILABLE`、503）に訳すのはここだけ**（部分的な
// 数を出さない）。`main` が読めないだけなら失敗にせず `{ kind: "unknown" }` をそのまま配る
// （`main-history.ts` の `ReadAchievementResult`）。

import { implement } from "@orpc/server"

import { type AchievementDaySelection } from "../../../shared/achievement.ts"
import { achievementContract } from "../../../shared/contract/achievement.ts"
import { type ReadAchievementResult, type ReadCommitCalendarResult } from "./main-history.ts"

/** この機能の手続きが使う口（中身は配線が渡す）。 */
export type AchievementProcedurePorts = {
  /**
   * 1日ぶんの成果（`main-history.ts` の `readAchievement` と日記を束ねたもの）。**「今日」を決めて
   * 見る日を検証するのは配線**（`src/view-delivery.ts`）で、ここは選び方をそのまま渡す。
   */
  readonly readAchievementDay: (
    selection: AchievementDaySelection,
  ) => Promise<ReadAchievementResult>
  /** 灯りの暦（`main-history.ts` の `readCommitCalendar` と日記のある日を束ねたもの）。 */
  readonly readAchievementCalendar: () => Promise<ReadCommitCalendarResult>
}

export function achievementProcedure(ports: AchievementProcedurePorts) {
  const procedure = implement(achievementContract)
  return procedure.router({
    day: procedure.day.handler(async ({ input, errors }) => {
      const result = await ports.readAchievementDay(input).catch(() => UNAVAILABLE)
      if (result.kind === "unavailable") {
        throw errors.UNAVAILABLE()
      }
      return result.achievement
    }),
    calendar: procedure.calendar.handler(async ({ errors }) => {
      const result = await ports.readAchievementCalendar().catch(() => UNAVAILABLE)
      if (result.kind === "unavailable") {
        throw errors.UNAVAILABLE()
      }
      return result.calendar
    }),
  })
}

const UNAVAILABLE = { kind: "unavailable" } as const
