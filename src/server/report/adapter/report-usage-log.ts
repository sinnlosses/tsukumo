// `report` の塊の使われ方の記録を `~/.tsukumo/report-usage/<YYYY-MM-DD>.jsonl` に書く。
// 読むのは tsukumo の外の集計スクリプトだけなので、読み口は持たない。

import { join } from "node:path"

import {
  REPORT_USAGE_FORMAT_VERSION,
  type ReportUsageRecord,
} from "../../../shared/report/report-usage-record.ts"
import { appendJsonLine } from "../../adapter/lib/jsonl.ts"
import { isoWithOffset, localDateKey } from "../../adapter/local-time.ts"
import { tsukumoHomeDir } from "../../adapter/tsukumo-home.ts"
import type { ReportUsageEntry, ReportUsageLog } from "../core/report-usage.ts"

const REPORT_USAGE_DIR_NAME = "report-usage"

export function reportUsageDir(): string {
  return join(tsukumoHomeDir(), REPORT_USAGE_DIR_NAME)
}

/** `root` はテストがホームを汚さないために差し替える。 */
export function createReportUsageLog(root: string = reportUsageDir()): ReportUsageLog {
  return {
    append: (entry) => {
      appendJsonLine(join(root, `${localDateKey(entry.at)}.jsonl`), toRecord(entry))
    },
  }
}

function toRecord(entry: ReportUsageEntry): ReportUsageRecord {
  return {
    v: REPORT_USAGE_FORMAT_VERSION,
    at: isoWithOffset(entry.at),
    sessionId: entry.sessionId,
    blockKinds: entry.blockKinds,
    notations: entry.notations,
    containedNotations: entry.containedNotations,
    escapeNotations: entry.escapeNotations,
    unknownBlockCount: entry.unknownBlockCount,
  }
}
