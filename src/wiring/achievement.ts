// 成果の配線。成果の画面（1日ぶん・暦）の読み口と、成果の日記書きを受けたときにその日の成果を数え直す口を選ぶ。

import type { AchievementProcedurePorts } from "../server/achievement/adapter/achievement-procedure.ts"
import {
  type AchievementCache,
  readAchievement,
  readAchievementCalendar,
} from "../server/achievement/adapter/closed-issue.ts"
import { todayLocalDateKey } from "../server/adapter/local-time.ts"
import type { DiagnosticLog } from "../server/diagnostic/core/diagnostic.ts"
import { listDiaryDates, readDiaryDay } from "../server/diary/adapter/diary.ts"
import type { SessionCommandPorts } from "../server/session/core/session-command.ts"
import { resolveAchievementDateKey } from "../shared/achievement/achievement.ts"
import { parseDateKey } from "../shared/diary/date-key.ts"
import { failureDiagnostic } from "./failure-diagnostic.ts"
import { foldPortFailure } from "./fold-port-failure.ts"
import type { WiringContext } from "./wiring-context.ts"

export function wireAchievement(
  context: WiringContext,
  achievementCache: AchievementCache,
  diagnosticLog: DiagnosticLog,
): {
  readonly rpc: AchievementProcedurePorts
  readonly sessionCommands: Pick<SessionCommandPorts, "readAchievementDay">
  /** 成果の画面を初めて開く前に `bd list` を済ませておく。待たない。 */
  readonly warmUp: () => void
} {
  const reportFailure = failureDiagnostic(diagnosticLog, context.now)
  const readDay: AchievementProcedurePorts["readAchievementDay"] = async (selection) => {
    const today = parseDateKey(todayLocalDateKey(context.now))
    if (today === undefined) {
      return { kind: "unavailable" }
    }
    const dateKey = resolveAchievementDateKey(selection, today)
    const [result, diary] = await Promise.all([
      readAchievement(dateKey, today, achievementCache),
      readDiaryDay(context.cwd, dateKey),
    ])
    return result.kind === "ok" && result.achievement.kind === "known"
      ? { kind: "ok", achievement: { ...result.achievement, diary } }
      : result
  }
  const readCalendar: AchievementProcedurePorts["readAchievementCalendar"] = async () => {
    const today = parseDateKey(todayLocalDateKey(context.now))
    if (today === undefined) {
      return { kind: "unavailable" }
    }
    const [result, diaryDates] = await Promise.all([
      readAchievementCalendar(today, achievementCache),
      listDiaryDates(context.cwd),
    ])
    return result.kind === "ok" && result.calendar.kind === "known"
      ? { kind: "ok", calendar: { ...result.calendar, diaryDates } }
      : result
  }
  return {
    rpc: {
      // 見る日の検証・今日への丸め込みも呼ぶたびに済ませ、`readAchievement` には検証済みの日付キーだけを渡す。
      // 日記はここで合わせる（`readAchievement` は数だけを持ち、日記の置き場を知らない）。
      // 読みが投げた回は足跡を残して `unavailable` に畳む。
      readAchievementDay: foldPortFailure(
        reportFailure,
        { feature: "achievement", place: "read-day" },
        { kind: "unavailable" },
        readDay,
      ),
      // 灯りの暦（直近5週ぶん）。日記のある日の一覧もここで合わせる。
      readAchievementCalendar: foldPortFailure(
        reportFailure,
        { feature: "achievement", place: "read-calendar" },
        { kind: "unavailable" },
        readCalendar,
      ),
    },
    sessionCommands: {
      // 読めなかった・Beads が読めない日は `undefined` に畳み、断る理由はコマンドの受け手が決める。
      readAchievementDay: async (date) => {
        const today = parseDateKey(todayLocalDateKey(context.now))
        if (today === undefined) {
          return undefined
        }
        const result = await readAchievement(date, today, achievementCache)
        return result.kind === "ok" ? result.achievement : undefined
      },
    },
    warmUp: () => {
      void achievementCache.readBeads()
    },
  }
}
