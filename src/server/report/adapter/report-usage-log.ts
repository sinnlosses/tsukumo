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
import { appendJsonLine, dateFilePath } from "../../adapter/lib/jsonl.ts"
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

/**
 * `reportSchema` はこのプロセスが `report` の塊の型をどう渡しているか（`Config.reportSchema`）、
 * `driver` はこのプロセスの駆動（`Config.driver`）で、どちらも全部の行に書く。
 * `root` はテストがホームを汚さないために差し替える。
 */
export function createReportUsageLog(
  reportSchema: ReportSchemaVariant,
  driver: ReportUsageDriver,
  root: string = reportUsageDir(),
): ReportUsageLog {
  return {
    append: (entry) => {
      appendJsonLine(
        dateFilePath(root, localDateKey(entry.at)),
        toRecord(entry, reportSchema, driver),
      )
    },
    appendRejection: (entry) => {
      appendJsonLine(
        dateFilePath(root, localDateKey(entry.at)),
        toRejectionRecord(entry, reportSchema, driver),
      )
    },
  }
}

function toRejectionRecord(
  entry: ReportRejectionEntry,
  reportSchema: ReportSchemaVariant,
  driver: ReportUsageDriver,
): ReportRejectionRecord {
  return {
    v: REPORT_USAGE_FORMAT_VERSION,
    kind: "rejected",
    at: isoWithOffset(entry.at),
    sessionId: entry.sessionId,
    driver,
    reasons: entry.reasons,
    argumentChars: entry.argumentChars,
    inheritedFields: entry.inheritedFields,
    reportSchema,
  }
}

function toRecord(
  entry: ReportUsageEntry,
  reportSchema: ReportSchemaVariant,
  driver: ReportUsageDriver,
): ReportUsageRecord {
  return {
    v: REPORT_USAGE_FORMAT_VERSION,
    at: isoWithOffset(entry.at),
    sessionId: entry.sessionId,
    driver,
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
    argumentChars: entry.argumentChars,
    inheritedFields: entry.inheritedFields,
    reportSchema,
  }
}
