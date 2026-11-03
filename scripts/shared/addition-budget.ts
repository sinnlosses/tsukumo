import { QUESTION_NOTATION_PROMPT } from "../../src/server/question/core/question-notation.ts"
import { REPORT_NOTATION_PROMPT } from "../../src/server/report/core/prompt/report-notation.ts"
import { SPEECH_CADENCE_PROMPT } from "../../src/server/system-prompt/core/speech-cadence.ts"
import { WORK_PLAN_PROMPT } from "../../src/server/work-plan/core/work-plan-tool.ts"

export const SYSTEM_PROMPT_TOTAL_LIMIT = 6304

export const REPORT_INPUT_SCHEMA_MAX_CHARS = 26_400

export const SYSTEM_PROMPT_TEXTS = [
  SPEECH_CADENCE_PROMPT,
  WORK_PLAN_PROMPT,
  REPORT_NOTATION_PROMPT,
  QUESTION_NOTATION_PROMPT,
] as const satisfies readonly string[]
