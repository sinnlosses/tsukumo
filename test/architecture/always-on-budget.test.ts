// 常設の文章（AGENTS.md と .claude/rules/*.md）の字数が上限以内であること
// （docs/coding-standards.md「常設の文章の字数」）。

import { readdirSync, readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { REPOSITORY_ROOT } from "../../scripts/shared/repository-root.ts"
import { QUESTION_NOTATION_PROMPT } from "../../src/server/question/core/question-notation.ts"
import { REPORT_NOTATION_PROMPT } from "../../src/server/report/core/report-notation.ts"
import { SPEECH_CADENCE_PROMPT } from "../../src/server/system-prompt/core/speech-cadence.ts"
import { WORK_PLAN_PROMPT } from "../../src/server/work-plan/core/work-plan-tool.ts"

const RULES_DIR = `${REPOSITORY_ROOT}/.claude/rules`

const AGENTS_MD_LIMIT = 9000
const RULES_TOTAL_LIMIT = 2400
const SYSTEM_PROMPT_TOTAL_LIMIT = 10481
const IMPLEMENTER_BRIEF_LIMIT = 9623
const TASK_WRITING_LIMIT = 9220

const IMPLEMENTER_BRIEF_PATH = `${REPOSITORY_ROOT}/vendor/tsukumo-plugins/skills/task-workflow/parts/implementer/implementer-brief.md`

const REMEDY =
  "足すなら何かを削る（上限は上げない。値を上げる変更は人の承認を要する）。出し先の梯子は hook・検査 → スクリプト → スキル → サブエージェント → 常設の文章。直しの確かめは検証全体でなく単体で打つ: pnpm run test test/architecture/always-on-budget.test.ts"

describe("常設の文章の字数", () => {
  it("AGENTS.md は上限以内", () => {
    const text = readFileSync(`${REPOSITORY_ROOT}/AGENTS.md`, "utf8")

    expect(overBudget("AGENTS.md", [text], AGENTS_MD_LIMIT)).toBe("")
  })

  it(".claude/rules/*.md の合計は上限以内", () => {
    const texts = readdirSync(RULES_DIR)
      .filter((name) => name.endsWith(".md"))
      .map((name) => readFileSync(`${RULES_DIR}/${name}`, "utf8"))

    expect(overBudget(".claude/rules の合計", texts, RULES_TOTAL_LIMIT)).toBe("")
  })

  it("systemPrompt の規約 4 本の合計は上限以内", () => {
    const texts = [
      SPEECH_CADENCE_PROMPT,
      WORK_PLAN_PROMPT,
      REPORT_NOTATION_PROMPT,
      QUESTION_NOTATION_PROMPT,
    ]

    expect(overBudget("systemPrompt の規約 4 本の合計", texts, SYSTEM_PROMPT_TOTAL_LIMIT)).toBe("")
  })

  it("implementer-brief.md は上限以内", () => {
    const text = readFileSync(IMPLEMENTER_BRIEF_PATH, "utf8")

    expect(
      overBudget(
        "implementer-brief.md",
        [text],
        IMPLEMENTER_BRIEF_LIMIT,
        "submodule の中なので直さない。tsukumo-plugins 側で削る",
      ),
    ).toBe("")
  })

  it("docs/workflow/task-writing.md は上限以内", () => {
    const text = readFileSync(`${REPOSITORY_ROOT}/docs/workflow/task-writing.md`, "utf8")

    expect(overBudget("task-writing.md", [text], TASK_WRITING_LIMIT)).toBe("")
  })

  it("上限ちょうどは通り、1字超えると「足すなら削る」と梯子つきで落ちる", () => {
    const agentsMd = readFileSync(`${REPOSITORY_ROOT}/AGENTS.md`, "utf8")
    const limit = [...agentsMd].length

    expect(overBudget("AGENTS.md", [agentsMd], limit)).toBe("")

    const message = overBudget("AGENTS.md", [`${agentsMd}あ`], limit)
    expect(message).toContain("足すなら何かを削る")
    expect(message).toContain("hook・検査 → スクリプト → スキル → サブエージェント → 常設の文章")
    expect(message).toContain("pnpm run test test/architecture/always-on-budget.test.ts")
    expect(message).toContain(`${limit + 1}字`)
  })

  it("字数は UTF-16 の長さでなく文字数で数える", () => {
    expect(overBudget("x", ["😀😀"], 2)).toBe("")
    expect(overBudget("x", ["😀😀😀"], 2)).not.toBe("")
  })
})

/** 合計が上限を超えたら失敗文を、収まっていれば空文字を返す。 */
function overBudget(label: string, texts: readonly string[], limit: number, where = ""): string {
  const total = texts.reduce((sum, text) => sum + [...text].length, 0)
  return total > limit
    ? `${label} が ${total}字で上限 ${limit}字を超えた。${where}${where ? "。" : ""}${REMEDY}`
    : ""
}
