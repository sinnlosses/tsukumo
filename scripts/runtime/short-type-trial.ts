// `report` の塊の型の渡し方（`json-schema` / `short-type`）ごとに、試しの比べに使う数を出す。
// `report-usage` の版17以降の行から、受理・差し戻し・差し戻し ÷ 受理・形の検査で落ちた率・引数の字数の中央値を、
// 同じセッションIDの `context-usage` の行から report の定義のトークンの中央値を出す。読むのは数と名前の欄だけ。
//
// 使い方:
//   node scripts/runtime/short-type-trial.ts             # 直近28日
//   node scripts/runtime/short-type-trial.ts --days 14   # 直近14日

import process from "node:process"

import { z } from "zod"

import { dateFileNamesBetween, readValidLines } from "../../src/server/adapter/lib/jsonl.ts"
import { contextUsageDir } from "../../src/server/context-usage/adapter/context-usage-log.ts"
import { REPORT_SCHEMA_VARIANTS } from "../../src/server/core/schema-variant.ts"
import { REPORT_TOOL_NAME, tsukumoToolFullName } from "../../src/server/core/tsukumo-tool-name.ts"
import { reportUsageDir } from "../../src/server/report/adapter/report-usage-log.ts"
import { REPORT_TOOL_ERROR_REASON } from "../../src/server/report/core/report-review.ts"
import { parseDaysOption } from "../shared/days-option.ts"

const USAGE = `使い方:
  node scripts/runtime/short-type-trial.ts             # 直近28日
  node scripts/runtime/short-type-trial.ts --days <日数>`

/** `reportSchema` を記録し始めた版。 */
const REPORT_SCHEMA_FORMAT_VERSION = 17

/** `report-usage` の行のうち、ここで読む欄（受け付けの行に `kind` は無い）。 */
const usageLineSchema = z.object({
  v: z.number().int().min(REPORT_SCHEMA_FORMAT_VERSION),
  sessionId: z.string(),
  kind: z.literal("rejected").optional(),
  reasons: z.array(z.string()).optional(),
  argumentChars: z.object({ total: z.number() }),
  reportSchema: z.enum(REPORT_SCHEMA_VARIANTS),
})
type UsageLine = z.infer<typeof usageLineSchema>

/** `context-usage` の行のうち、ここで読む欄（MCP ツールごとのトークン）。 */
const contextLineSchema = z.object({
  sessionId: z.string(),
  usage: z.object({ mcpTools: z.array(z.object({ name: z.string(), tokens: z.number() })) }),
})
type ContextLine = z.infer<typeof contextLineSchema>

const days = parseDaysOption(process.argv.slice(2))
if (days === "invalid") {
  process.stderr.write(`${USAGE}\n`)
  process.exit(2)
}

const usageLines = readRecent(reportUsageDir(), days, usageLineSchema)
const contextLines = readRecent(contextUsageDir(), days, contextLineSchema)
process.stdout.write(
  `直近${String(days)}日（記録の版${String(REPORT_SCHEMA_FORMAT_VERSION)}以降）\n`,
)
for (const variant of REPORT_SCHEMA_VARIANTS) {
  process.stdout.write(
    variantSection(
      variant,
      usageLines.filter((line) => line.reportSchema === variant),
      contextLines,
    ),
  )
}

/** 今日を含む直近 `dayCount` 日のファイルの行のうち、スキーマを通ったもの。 */
function readRecent<T>(
  root: string,
  dayCount: number,
  schema: { safeParse(raw: unknown): { success: true; data: T } | { success: false } },
): readonly T[] {
  const endDate = Temporal.Now.plainDateISO()
  const startDate = endDate.subtract({ days: dayCount - 1 })
  return dateFileNamesBetween(root, startDate.toString(), endDate.toString()).flatMap((name) =>
    readValidLines(`${root}/${name}`, schema),
  )
}

function variantSection(
  variant: string,
  lines: readonly UsageLine[],
  contexts: readonly ContextLine[],
): string {
  const rejections = lines.filter((line) => line.kind === "rejected")
  const accepted = lines.length - rejections.length
  const toolErrors = rejections.filter((line) =>
    (line.reasons ?? []).includes(REPORT_TOOL_ERROR_REASON),
  ).length
  const sessionIds = new Set(lines.map((line) => line.sessionId))
  const reportName = tsukumoToolFullName(REPORT_TOOL_NAME)
  const reportTokens = contexts
    .filter((line) => sessionIds.has(line.sessionId))
    .flatMap((line) => line.usage.mcpTools.filter((tool) => tool.name === reportName))
    .map((tool) => tool.tokens)
  return [
    `${variant}`,
    `  受理 ${String(accepted)} 回 / 差し戻し ${String(rejections.length)} 回 / 差し戻し ÷ 受理 ${ratio(rejections.length, accepted)}`,
    `  形の検査で落ちた率 ${ratio(toolErrors, lines.length)}（${REPORT_TOOL_ERROR_REASON} ${String(toolErrors)} 回 ÷ 呼び出し ${String(lines.length)} 回）`,
    `  引数の字数の中央値 ${median(lines.map((line) => line.argumentChars.total))}`,
    `  report の定義のトークンの中央値 ${median(reportTokens)}（context-usage ${String(reportTokens.length)} 行）`,
    "",
  ].join("\n")
}

function ratio(numerator: number, denominator: number): string {
  return denominator === 0 ? "—" : (numerator / denominator).toFixed(2)
}

function median(values: readonly number[]): string {
  const sorted = values.toSorted((a, b) => a - b)
  const middle = sorted[Math.floor((sorted.length - 1) / 2)]
  return middle === undefined ? "—" : String(middle)
}
