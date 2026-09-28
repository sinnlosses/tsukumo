// 成果の手続き。形は `achievementContract`。照合は束ねる側のミドルウェアが済ませている。
//
// `git` のタイムアウト・失敗を契約のエラー（`UNAVAILABLE`、503）に訳すのはここだけで、部分的な数を出さない。
// `main` が読めないだけなら失敗にせず `{ kind: "unknown" }` をそのまま配る。

import { implement } from "@orpc/server"

import type { AchievementDaySelection } from "../../../shared/achievement/achievement.ts"
import { achievementContract } from "../../../shared/contract/achievement.ts"
import type { ReadAchievementResult, ReadCommitCalendarResult } from "./main-history.ts"

/** この機能の手続きが使う口（中身は配線が渡す）。 */
export type AchievementProcedurePorts = {
  /**
   * 1日ぶんの成果（`readAchievement` と日記を束ねたもの）。
   * 「今日」を決めて見る日を検証するのは配線で、ここは選び方をそのまま渡す。
   */
  readonly readAchievementDay: (
    selection: AchievementDaySelection,
  ) => Promise<ReadAchievementResult>
  /** 灯りの暦（`readCommitCalendar` と日記のある日を束ねたもの）。 */
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
