// 使用量の配線。口は3つ。
// - 日付ごとの記録（token-usage・diagnostic・context-usage・experience-metric・report-usage・throwaway-query）の作成・閉じる・古いファイルの掃除（`wireUsageLogs`）。
//   疑似セッションの走りは本物の使用量に混ぜないので、context-usage・experience-metric・report-usage・throwaway-query には何も書かない口を渡す。
//   token-usage と diagnostic は疑似でも本物を作る。
// - トークン消費の画面の読み口。記録の読み口に「今日」を決めて渡す（`wireTokenUsage`）。
// - 見直し。前回の結果の読み書きと、見直しの走りと、トークン消費の画面から届くコマンドの中身を選ぶ（`wireUsageReview`）。

import { todayLocalDateKey } from "../server/adapter/local-time.ts"
import { createThrowawayQueryLog } from "../server/adapter/throwaway-query-log.ts"
import type { CharacterPack } from "../server/character-pack/adapter/character-pack.ts"
import type { Config } from "../server/core/config.ts"
import { createDiagnosticLog } from "../server/diagnostic/adapter/diagnostic-log.ts"
import { createReportUsageLog } from "../server/report/adapter/report-usage-log.ts"
import { readBeadsWorkspace } from "../server/repository/adapter/beads.ts"
import type { SessionLaunchSeed } from "../server/session/core/session-launch.ts"
import type { SessionManagerOptions } from "../server/session/core/session-manager-port.ts"
import { createContextUsageLog } from "../server/usage/adapter/context-usage-log.ts"
import { createExperienceMetricLog } from "../server/usage/adapter/experience-metric-log.ts"
import {
  readPreviousUsageReview,
  writePreviousUsageReview,
} from "../server/usage/adapter/previous-usage-review.ts"
import { queryUsageProposal, queryUsageReview } from "../server/usage/adapter/sdk-usage-review.ts"
import { createTokenUsageLog } from "../server/usage/adapter/token-usage-log.ts"
import type { TokenUsageProcedurePorts } from "../server/usage/adapter/token-usage-procedure.ts"
import type { OpenTaskReader } from "../server/usage/adapter/tw-claim-list.ts"
import {
  readDismissedUsageProposalKeys,
  writeDismissedUsageProposalKey,
} from "../server/usage/adapter/usage-proposal-dismissal.ts"
import { summarizeRecentTokenUsage } from "../server/usage/core/token-usage-summary.ts"
import type { TokenUsageLog } from "../server/usage/core/token-usage.ts"
import type { UsageReviewCommandPorts } from "../server/usage/core/usage-review-command.ts"
import {
  createUsageReviewRunner,
  type UsageReviewPackContext,
  type UsageReviewSource,
} from "../server/usage/core/usage-review-runner.ts"
import { expressionChoices } from "../shared/character-pack/expression-choice.ts"
import type { UsageProposalKeyInput } from "../shared/contract/usage-review.ts"
import type { SessionEvent } from "../shared/session/session-event.ts"
import { usageProposalKey, withoutDismissedProposals } from "../shared/usage/usage-review.ts"
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

export function wireTokenUsage(
  context: WiringContext,
  tokenUsageLog: TokenUsageLog,
): { readonly rpc: TokenUsageProcedurePorts } {
  return {
    rpc: {
      // 「今日」はここで決めて渡す（OS のタイムゾーンに依るので、core は今日が何日かを知らない）。
      readTokenUsageSummary: (days) =>
        summarizeRecentTokenUsage(tokenUsageLog, todayLocalDateKey(context.now), days),
    },
  }
}

export function wireUsageReview(
  context: WiringContext,
  mountWorkflowPlugin: boolean,
): {
  readonly manager: Pick<SessionManagerOptions, "readPreviousUsageReview">
  readonly commands: UsageReviewCommandPorts
  /**
   * 代を起こすたびに呼ぶ（疑似セッションでも）。
   * キャラクターを切り替えたあとの見直しは、切り替えたあとのパックで走る。
   */
  readonly noteLaunched: (seed: SessionLaunchSeed<CharacterPack>) => void
  /** 走っている見直しか提案の実行を止める（プロセスを終えるとき）。 */
  readonly close: () => void
} {
  let latest: UsageReviewPackContext | undefined = undefined
  const runner = createUsageReviewRunner({
    source: usageReviewSource(context, mountWorkflowPlugin),
    readContext: () => latest,
    dismissedKeys: () => readDismissedUsageProposalKeys(),
    hasTaskOperation: async () => (await readBeadsWorkspace(context.cwd)).kind === "found",
    writePreviousUsageReview,
    now: context.now,
  })
  return {
    manager: {
      // 前回の見直しの結果は、読むときに見送った提案を除く（見送りは前回の結果のファイルを書き換えないため）。
      readPreviousUsageReview: () =>
        withoutDismissedProposals(readPreviousUsageReview(), readDismissedUsageProposalKeys()),
    },
    commands: { dismissUsageProposal, runner },
    noteLaunched: (seed) => {
      latest = {
        persona: seed.pack.persona ?? "",
        expressions: expressionChoices(seed.pack.definition),
        cwd: context.cwd,
        env: context.inheritedEnv,
      }
    },
    close: runner.close,
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

/** 走らせる口の出どころ。疑似セッションなら問い合わせを起こさず、疑似セッションに書いた手順を流す。 */
function usageReviewSource(
  context: WiringContext,
  mountWorkflowPlugin: boolean,
): UsageReviewSource {
  const { driver } = context
  switch (driver.kind) {
    case "fake":
      return { kind: "replay", ...driver.session.usageReview }
    case "sdk": {
      const watch = { record: context.throwawayQuery, now: context.now }
      return {
        kind: "query",
        review: (request, intake, onEvent, signal) =>
          queryUsageReview(request, intake, onEvent, signal, watch),
        proposal: (request, onEvent, signal) =>
          queryUsageProposal(request, onEvent, signal, mountWorkflowPlugin, watch),
      }
    }
    default:
      return driver satisfies never
  }
}

/**
 * 提案を1件見送る。識別子（種類と対象の組）で書き、同じ識別子を返す（画面はこの識別子で札を消す）。
 * 書き込みは失敗しても例外を投げないので、返すイベントは常に1つ。
 */
function dismissUsageProposal(dismiss: UsageProposalKeyInput): SessionEvent {
  const key = usageProposalKey(dismiss)
  writeDismissedUsageProposalKey(key)
  return { kind: "usage-proposal-dismissed", key }
}
