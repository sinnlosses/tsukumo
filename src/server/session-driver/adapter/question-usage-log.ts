// 質問の使われ方の記録を `~/.tsukumo/question-usage/<YYYY-MM-DD>.jsonl` に書く。

import { join } from "node:path"

import {
  QUESTION_USAGE_FORMAT_VERSION,
  type QuestionUsageRecord,
} from "../../../shared/session-driver/question-usage-record.ts"
import { appendJsonLine } from "../../adapter/lib/jsonl.ts"
import { isoWithOffset, localDateKey } from "../../adapter/local-time.ts"
import { tsukumoHomeDir } from "../../adapter/tsukumo-home.ts"
import type { QuestionUsageEntry, QuestionUsageLog } from "../core/question-usage.ts"

const QUESTION_USAGE_DIR_NAME = "question-usage"

export function questionUsageDir(): string {
  return join(tsukumoHomeDir(), QUESTION_USAGE_DIR_NAME)
}

/** `root` はテストがホームを汚さないために差し替える。 */
export function createQuestionUsageLog(root: string = questionUsageDir()): QuestionUsageLog {
  return {
    append: (entry) => {
      appendJsonLine(join(root, `${localDateKey(entry.at)}.jsonl`), toRecord(entry))
    },
  }
}

function toRecord(entry: QuestionUsageEntry): QuestionUsageRecord {
  return {
    v: QUESTION_USAGE_FORMAT_VERSION,
    at: isoWithOffset(entry.at),
    sessionId: entry.sessionId,
    optionCount: entry.optionCount,
    previewCount: entry.previewCount,
    briefed: entry.briefed,
    sentBack: entry.sentBack,
  }
}
