// `report` の塊の使われ方の記録を `~/.tsukumo/report-usage/<YYYY-MM-DD>.jsonl` に書く。
// 読むのは tsukumo の外の集計スクリプトだけなので、読み口は持たない。

import {
  REPORT_USAGE_FORMAT_VERSION,
  type ReportRejectionRecord,
  reportRejectionRecordSchema,
  type ReportUsageDriver,
  type ReportUsageRecord,
  reportUsageRecordSchema,
} from "../../../shared/report/report-usage-record.ts"
import type { ReportSchemaVariant } from "../../../shared/report/schema-variant.ts"
import { createDatedRecordLog, type DatedRecordLog } from "../../adapter/lib/dated-record-log.ts"
import { isoWithOffset, localDateKey } from "../../adapter/local-time.ts"
import { tsukumoHomePath } from "../../adapter/tsukumo-home.ts"
import {
  nextCallOfAccepted,
  nextCallOfRejected,
  type ReportNextCall,
  type ReportRejectionEntry,
  type ReportUsageEntry,
  type ReportUsageLog,
} from "../core/report-usage.ts"

export function reportUsageDir(): string {
  return tsukumoHomePath("reportUsage")
}

/** 疑似セッションは記録を書かないので、書く行の駆動はいつも `sdk`。 */
const RECORDED_DRIVER = "sdk" satisfies ReportUsageDriver

/**
 * `reportSchema` はこのプロセスが `report` の塊の型をどう渡しているか（`Config.reportSchema`）で、全部の行に書く。
 * `root` はテストがホームを汚さないために差し替える。
 */
export function createReportUsageLog(
  reportSchema: ReportSchemaVariant,
  root: string = reportUsageDir(),
): ReportUsageLog &
  Pick<
    DatedRecordLog<ReportUsageRecord | ReportRejectionRecord>,
    "flush" | "close" | "pruneExpired"
  > {
  const log = createDatedRecordLog(
    {
      schema: reportUsageRecordSchema.or(reportRejectionRecordSchema),
      retentionDays: undefined,
    },
    root,
  )
  // 差し戻しの行は次の呼び出しが分かるまで書かず、セッションごとに1件だけ待たせる。閉じるときは次が無いまま書く。
  const pending = new Map<string, ReportRejectionEntry>()
  const writeRejection = (entry: ReportRejectionEntry, nextCall: ReportNextCall | undefined) => {
    log.append(localDateKey(entry.at), [toRejectionRecord(entry, reportSchema, nextCall)])
  }
  const settle = (sessionId: string, nextCall: ReportNextCall | undefined) => {
    const waiting = pending.get(sessionId)
    if (waiting !== undefined) {
      pending.delete(sessionId)
      writeRejection(waiting, nextCall)
    }
  }
  const settleAll = () => {
    for (const sessionId of pending.keys()) {
      settle(sessionId, undefined)
    }
  }
  return {
    append: (entry) => {
      settle(entry.sessionId, nextCallOfAccepted(entry))
      log.append(localDateKey(entry.at), [toRecord(entry, reportSchema)])
    },
    appendRejection: (entry) => {
      if (entry.mode === "count") {
        writeRejection(entry, undefined)
        return
      }
      settle(entry.sessionId, nextCallOfRejected(entry))
      pending.set(entry.sessionId, entry)
    },
    flush: () => {
      settleAll()
      return log.flush()
    },
    close: () => {
      settleAll()
      return log.close()
    },
    pruneExpired: log.pruneExpired,
  }
}

function toRejectionRecord(
  entry: ReportRejectionEntry,
  reportSchema: ReportSchemaVariant,
  nextCall: ReportNextCall | undefined,
): ReportRejectionRecord {
  return {
    v: REPORT_USAGE_FORMAT_VERSION,
    kind: entry.mode === "reject" ? "rejected" : "counted",
    at: isoWithOffset(entry.at),
    sessionId: entry.sessionId,
    driver: RECORDED_DRIVER,
    reasons: entry.reasons,
    argumentChars: entry.argumentChars,
    inheritedFields: entry.inheritedFields,
    reportSchema,
    ...(nextCall === undefined ? {} : { nextCall }),
    ...(entry.toolErrorFields.length === 0 ? {} : { toolErrorFields: entry.toolErrorFields }),
  }
}

function toRecord(entry: ReportUsageEntry, reportSchema: ReportSchemaVariant): ReportUsageRecord {
  return {
    v: REPORT_USAGE_FORMAT_VERSION,
    at: isoWithOffset(entry.at),
    sessionId: entry.sessionId,
    driver: RECORDED_DRIVER,
    ...entry.figure,
    ...entry.shapeTags,
    blockKinds: entry.blockKinds,
    blockFields: entry.blockFields,
    notations: entry.notations,
    containedNotations: entry.containedNotations,
    escapeNotations: entry.escapeNotations,
    unknownBlockCount: entry.unknownBlockCount,
    listStyles: entry.listStyles,
    mermaidKinds: entry.mermaidKinds,
    hasModifiedFiles: entry.hasModifiedFiles,
    hasBeforeAfterOrImage: entry.hasBeforeAfterOrImage,
    forTask: entry.forTask,
    hasFigure: entry.hasFigure,
    readImageWithoutImageBlock: entry.readImageWithoutImageBlock,
    emphasisCount: entry.emphasisCount,
    graphEdgeCount: entry.graphEdgeCount,
    graphUnlabeledEdgeCount: entry.graphUnlabeledEdgeCount,
    graphNodeCount: entry.graphNodeCount,
    hasUnverifiedCheck: entry.hasUnverifiedCheck,
    hasHowToVerify: entry.hasHowToVerify,
    taskGenre: entry.taskGenre,
    taskOutcome: entry.taskOutcome,
    hasFavor: entry.hasFavor,
    hasSourceReference: entry.hasSourceReference,
    shortTable: entry.shortTable,
    hasKeyFigures: entry.hasKeyFigures,
    conclusionNumbersWithoutKeyFigures: entry.conclusionNumbersWithoutKeyFigures,
    argumentChars: entry.argumentChars,
    inheritedFields: entry.inheritedFields,
    reportSchema,
  }
}
