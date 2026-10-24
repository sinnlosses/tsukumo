// 使用量の記録（context-usage・experience-metric・report-usage）の書き込み口の配線。
// 疑似セッションの走りは本物の使用量に混ぜないので、何も書かない口を渡す。

import { createContextUsageLog } from "../server/context-usage/adapter/context-usage-log.ts"
import type { Config } from "../server/core/config.ts"
import { createExperienceMetricLog } from "../server/experience-metric/adapter/experience-metric-log.ts"
import { createReportUsageLog } from "../server/report/adapter/report-usage-log.ts"
import type { WiringContext } from "./wiring-context.ts"

type Closable = { readonly close: () => Promise<void> }

export type UsageLogs = {
  readonly context: ReturnType<typeof createContextUsageLog>
  readonly experienceMetric: ReturnType<typeof createExperienceMetricLog>
  readonly report: ReturnType<typeof createReportUsageLog>
}

export function wireUsageLogs(
  context: Pick<WiringContext, "fakeSession">,
  reportSchema: Config["reportSchema"],
): UsageLogs & { readonly closeAll: () => Promise<void> } {
  const logs: UsageLogs = context.fakeSession === undefined ? realLogs(reportSchema) : silentLogs()
  const closables: readonly Closable[] = [logs.context, logs.experienceMetric, logs.report]
  return {
    ...logs,
    closeAll: async () => {
      await Promise.all(closables.map((log) => log.close()))
    },
  }
}

function done(): Promise<void> {
  return Promise.resolve()
}

function realLogs(reportSchema: Config["reportSchema"]): UsageLogs {
  return {
    context: createContextUsageLog(),
    experienceMetric: createExperienceMetricLog(),
    report: createReportUsageLog(reportSchema),
  }
}

/** 追記は捨て、閉じる・待つは空。口は作らないので置き場のディレクトリも作られない。 */
function silentLogs(): UsageLogs {
  return {
    context: { append: () => undefined, flush: done, close: done },
    experienceMetric: {
      append: () => undefined,
      flush: done,
      close: done,
      readRange: () => [],
    },
    report: { append: () => undefined, appendRejection: () => undefined, flush: done, close: done },
  }
}
