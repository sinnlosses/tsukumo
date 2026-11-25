import { QUESTION_NOTATION_PROMPT } from "../../src/server/question/core/question-notation.ts"
import { REPORT_NOTATION_PROMPT } from "../../src/server/report/core/prompt/report-notation.ts"
import { SPEECH_CADENCE_PROMPT } from "../../src/server/system-prompt/core/speech-cadence.ts"
import { WORK_PLAN_PROMPT } from "../../src/server/work-plan/core/work-plan-tool.ts"

// 値は字数（`[...text].length`）。

export const AGENTS_MD_LIMIT = 2500

export const RULES_TOTAL_LIMIT = 2300

export const SYSTEM_PROMPT_TOTAL_LIMIT = 5000

export const IMPLEMENTER_BRIEF_LIMIT = 5000

export const TASK_WRITING_LIMIT = 10_000

export const REPORT_INPUT_SCHEMA_MAX_CHARS = 22_000

export const SYSTEM_PROMPT_TEXTS = [
  SPEECH_CADENCE_PROMPT,
  WORK_PLAN_PROMPT,
  REPORT_NOTATION_PROMPT,
  QUESTION_NOTATION_PROMPT,
] as const satisfies readonly string[]
