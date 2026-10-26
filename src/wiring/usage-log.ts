// 日付ごとの記録（token-usage・diagnostic・context-usage・experience-metric・report-usage・throwaway-query）の作成・閉じる・古いファイルの掃除。
// 疑似セッションの走りは本物の使用量に混ぜないので、context-usage・experience-metric・report-usage・throwaway-query には何も書かない口を渡す。
// token-usage と diagnostic は疑似でも本物を作る。

import { createThrowawayQueryLog } from "../server/adapter/throwaway-query-log.ts"
import { createContextUsageLog } from "../server/context-usage/adapter/context-usage-log.ts"
import type { Config } from "../server/core/config.ts"
import { createDiagnosticLog } from "../server/diagnostic/adapter/diagnostic-log.ts"
import { createExperienceMetricLog } from "../server/experience-metric/adapter/experience-metric-log.ts"
import { createReportUsageLog } from "../server/report/adapter/report-usage-log.ts"
import { createTokenUsageLog } from "../server/token-usage/adapter/token-usage-log.ts"
import type { OpenTaskReader } from "../server/token-usage/adapter/tw-claim-list.ts"
import type { WiringContext } from "./wiring-context.ts"

type ManagedLog = {
  readonly close: () => Promise<void>
  readonly pruneExpired: (today: string) => void
}

type DriverSwitchedLogs = {
  readonly context: ReturnType<typeof createContextUsageLog>
  readonly experienceMetric: ReturnType<typeof createExperienceMetricLog>
  readonly report: ReturnType<typeof createReportUsageLog>
  readonly throwawayQuery: ReturnType<typeof createThrowawayQueryLog>
}

export type UsageLogs = DriverSwitchedLogs & {
  readonly tokenUsage: ReturnType<typeof createTokenUsageLog>
  readonly diagnostic: ReturnType<typeof createDiagnosticLog>
}

export type WiredUsageLogs = UsageLogs & {
  /** 開いている追記の口を全部閉じ、書き残しがファイルに渡るのを待つ。 */
  readonly closeAll: () => Promise<void>
  /** 保持の日数を過ぎた日付のファイルを、全部の記録から消す。 */
  readonly pruneExpired: (today: string) => void
}

export type UsageLogOptions = {
  readonly reportSchema: Config["reportSchema"]
  /** token-usage の行に結ぶ、着手中のタスクを読む口。 */
  readonly openTask: OpenTaskReader
}

export function wireUsageLogs(
  context: Pick<WiringContext, "driver">,
  options: UsageLogOptions,
): WiredUsageLogs {
  const logs: UsageLogs = {
    ...switchedLogs(context.driver, options.reportSchema),
    tokenUsage: createTokenUsageLog(options.openTask),
    diagnostic: createDiagnosticLog(),
  }
  const managed: readonly ManagedLog[] = [
    logs.tokenUsage,
    logs.diagnostic,
    logs.context,
    logs.experienceMetric,
    logs.report,
    logs.throwawayQuery,
  ]
  return {
    ...logs,
    closeAll: async () => {
      await Promise.all(managed.map((log) => log.close()))
    },
    pruneExpired: (today) => {
      for (const log of managed) {
        log.pruneExpired(today)
      }
    },
  }
}

function switchedLogs(
  driver: WiringContext["driver"],
  reportSchema: Config["reportSchema"],
): DriverSwitchedLogs {
  switch (driver.kind) {
    case "sdk":
      return realLogs(reportSchema)
    case "fake":
      return silentLogs()
    default:
      return driver satisfies never
  }
}

function done(): Promise<void> {
  return Promise.resolve()
}

function realLogs(reportSchema: Config["reportSchema"]): DriverSwitchedLogs {
  return {
    context: createContextUsageLog(),
    experienceMetric: createExperienceMetricLog(),
    report: createReportUsageLog(reportSchema),
    throwawayQuery: createThrowawayQueryLog(),
  }
}

/** 追記は捨て、閉じる・待つ・掃除は空。口は作らないので置き場のディレクトリも作られない。 */
function silentLogs(): DriverSwitchedLogs {
  return {
    context: { append: () => undefined, flush: done, close: done, pruneExpired: () => undefined },
    experienceMetric: {
      append: () => undefined,
      flush: done,
      close: done,
      pruneExpired: () => undefined,
      readRange: () => [],
    },
    report: {
      append: () => undefined,
      appendRejection: () => undefined,
      appendFollowUp: () => undefined,
      flush: done,
      close: done,
      pruneExpired: () => undefined,
    },
    throwawayQuery: {
      record: () => undefined,
      flush: done,
      close: done,
      pruneExpired: () => undefined,
    },
  }
}
