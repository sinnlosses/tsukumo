// 成果の配線。成果の振り返りを受けたときに、その日の成果を数え直す口を選ぶ。

import { readAchievement } from "../server/achievement/adapter/closed-issue.ts"
import { todayLocalDateKey } from "../server/adapter/local-time.ts"
import type { SessionCommandPorts } from "../server/session/core/session-command.ts"
import type { WiringContext } from "./wiring-context.ts"

export function wireAchievement(context: WiringContext): {
  readonly sessionCommands: Pick<SessionCommandPorts, "readAchievementDay">
} {
  return {
    sessionCommands: {
      // 読めなかった・Beads が読めない日は `undefined` に畳み、断る理由はコマンドの受け手が決める。
      readAchievementDay: async (date) => {
        const result = await readAchievement(date, todayLocalDateKey(), context.achievementCache)
        return result.kind === "ok" ? result.achievement : undefined
      },
    },
  }
}
