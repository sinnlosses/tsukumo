// `report` の塊の使われ方の記録を `~/.tsukumo/report-usage/<YYYY-MM-DD>.jsonl` に書く。
// 読むのは tsukumo の外の集計スクリプトだけなので、読み口は持たない。

import { join } from "node:path"

import {
  REPORT_USAGE_FORMAT_VERSION,
  type ReportRejectionRecord,
  type ReportUsageDriver,
  type ReportUsageRecord,
} from "../../../shared/report/report-usage-record.ts"
import type { ReportSchemaVariant } from "../../../shared/report/schema-variant.ts"
import { createJsonLinesAppender, type JsonLinesAppender } from "../../adapter/lib/jsonl.ts"
import { isoWithOffset, localDateKey } from "../../adapter/local-time.ts"
import { tsukumoHomeDir } from "../../adapter/tsukumo-home.ts"
import type {
  ReportRejectionEntry,
  ReportUsageEntry,
  ReportUsageLog,
} from "../core/report-usage.ts"

const REPORT_USAGE_DIR_NAME = "report-usage"

export function reportUsageDir(): string {
  return join(tsukumoHomeDir(), REPORT_USAGE_DIR_NAME)
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
): ReportUsageLog & Pick<JsonLinesAppender, "flush" | "close"> {
  const appender = createJsonLinesAppender(root)
  return {
    append: (entry) => {
      appender.append(localDateKey(entry.at), [toRecord(entry, reportSchema)])
    },
    appendRejection: (entry) => {
      appender.append(localDateKey(entry.at), [toRejectionRecord(entry, reportSchema)])
    },
    flush: appender.flush,
    close: appender.close,
  }
}

function toRejectionRecord(
  entry: ReportRejectionEntry,
  reportSchema: ReportSchemaVariant,
): ReportRejectionRecord {
  return {
    v: REPORT_USAGE_FORMAT_VERSION,
    kind: "rejected",
    at: isoWithOffset(entry.at),
    sessionId: entry.sessionId,
    driver: RECORDED_DRIVER,
    reasons: entry.reasons,
    argumentChars: entry.argumentChars,
    inheritedFields: entry.inheritedFields,
    reportSchema,
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
