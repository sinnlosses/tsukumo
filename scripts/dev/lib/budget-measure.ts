// 字数とトークン数の上限を、作業ツリーのファイルと report の道具の定義から実測する。

import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

import { z } from "zod"

import { mcpRequest } from "../../../test/fixture/mcp-server.ts"
import { workServer } from "../../../test/fixture/sdk-tool.ts"
import {
  AGENTS_MD_LIMIT,
  IMPLEMENTER_BRIEF_LIMIT,
  REPORT_INPUT_SCHEMA_MAX_CHARS,
  RULES_TOTAL_LIMIT,
  SYSTEM_PROMPT_TEXTS,
  SYSTEM_PROMPT_TOTAL_LIMIT,
  TASK_WRITING_LIMIT,
} from "../../shared/addition-budget.ts"
import type { BudgetMeasurement } from "../../shared/budget-review.ts"
import { queryGit } from "../../shared/git-query.ts"
import { countTokens, splitStepsFor } from "../../shared/token-limit.ts"

const BUDGET_FILE = "`scripts/shared/addition-budget.ts` の"

const TOOLS_LIST_REPLY = z.object({
  id: z.literal(1),
  result: z.object({
    tools: z.array(z.object({ name: z.string(), inputSchema: z.record(z.string(), z.unknown()) })),
  }),
})

export async function measureBudgets(root: string): Promise<readonly BudgetMeasurement[]> {
  const text = (path: string): string => readFileSync(join(root, path), "utf8")
  const rulesDirectory = join(root, ".claude/rules")
  const rules = readdirSync(rulesDirectory)
    .filter((name) => name.endsWith(".md"))
    .map((name) => readFileSync(join(rulesDirectory, name), "utf8"))
  return [
    chars(
      "systemPrompt の規約4本",
      SYSTEM_PROMPT_TEXTS,
      SYSTEM_PROMPT_TOTAL_LIMIT,
      "SYSTEM_PROMPT_TOTAL_LIMIT",
    ),
    chars(
      "report の schema",
      [await reportSchemaText()],
      REPORT_INPUT_SCHEMA_MAX_CHARS,
      "REPORT_INPUT_SCHEMA_MAX_CHARS",
    ),
    chars("AGENTS.md", [text("AGENTS.md")], AGENTS_MD_LIMIT, "AGENTS_MD_LIMIT"),
    chars(".claude/rules の合計", rules, RULES_TOTAL_LIMIT, "RULES_TOTAL_LIMIT"),
    chars(
      "implementer-brief.md",
      [text("vendor/tsukumo-plugins/workflow-briefs/implementer-brief.md")],
      IMPLEMENTER_BRIEF_LIMIT,
      "IMPLEMENTER_BRIEF_LIMIT",
    ),
    chars(
      "task-writing.md",
      [text("docs/workflow/task-writing.md")],
      TASK_WRITING_LIMIT,
      "TASK_WRITING_LIMIT",
    ),
    oversizedFiles(root),
  ]
}

function chars(
  name: string,
  texts: readonly string[],
  limit: number,
  constant: string,
): BudgetMeasurement {
  return {
    name,
    unit: "字",
    current: texts.reduce((sum, text) => sum + [...text].length, 0),
    limit,
    constant: `${BUDGET_FILE} \`${constant}\``,
    details: [],
  }
}

async function reportSchemaText(): Promise<string> {
  const reply = await mcpRequest(workServer(), "tools/list", {}, TOOLS_LIST_REPLY)
  return JSON.stringify(reply.result.tools.find((tool) => tool.name === "report")?.inputSchema)
}

function oversizedFiles(root: string): BudgetMeasurement {
  const listed = queryGit(root, ["ls-files", "-z"]) ?? ""
  const over = listed
    .split("\0")
    .filter((path) => path !== "")
    .flatMap((path) => {
      const { tokens, limit, status } = countTokens(path, fileBytesOf(join(root, path)))
      return status === "over" && !isBinary(join(root, path)) ? [{ path, tokens, limit }] : []
    })
  return {
    name: "上限のトークン数を超えたファイル",
    unit: "件",
    current: over.length,
    limit: 0,
    constant: "`scripts/shared/token-limit.ts` の `TOKEN_LIMIT`・`DOCUMENT_TOKEN_LIMIT`",
    details: [
      ...over.map(({ path, tokens, limit }) => `\`${path}\`: ${tokens} トークン（上限 ${limit}）`),
      ...splitStepsFor(over.map(({ path }) => path)),
    ],
  }
}

/** 消えたファイルと submodule の入口は 0 バイトとして数える（上限を超えない）。 */
function fileBytesOf(path: string): number {
  try {
    const stat = statSync(path)
    return stat.isFile() ? stat.size : 0
  } catch {
    return 0
  }
}

function isBinary(path: string): boolean {
  return readFileSync(path).subarray(0, 8000).includes(0)
}
