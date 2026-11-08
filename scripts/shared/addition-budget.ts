import { QUESTION_NOTATION_PROMPT } from "../../src/server/question/core/question-notation.ts"
import { REPORT_NOTATION_PROMPT } from "../../src/server/report/core/prompt/report-notation.ts"
import { SPEECH_CADENCE_PROMPT } from "../../src/server/system-prompt/core/speech-cadence.ts"
import { WORK_PLAN_PROMPT } from "../../src/server/work-plan/core/work-plan-tool.ts"

export const AGENTS_MD_LIMIT = 4000

export const RULES_TOTAL_LIMIT = 2400

export const SYSTEM_PROMPT_TOTAL_LIMIT = 4871

export const IMPLEMENTER_BRIEF_LIMIT = 9623

export const TASK_WRITING_LIMIT = 9220

export const REPORT_INPUT_SCHEMA_MAX_CHARS = 23_100

export const SYSTEM_PROMPT_TEXTS = [
  SPEECH_CADENCE_PROMPT,
  WORK_PLAN_PROMPT,
  REPORT_NOTATION_PROMPT,
  QUESTION_NOTATION_PROMPT,
] as const satisfies readonly string[]
