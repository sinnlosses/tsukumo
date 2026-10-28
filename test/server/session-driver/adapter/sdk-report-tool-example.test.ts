import { describe, expect, it } from "vitest"
import { z } from "zod"

import { REPORT_CALL_EXAMPLES_TEXT } from "../../../../src/server/report/core/call-example.ts"
import { REPORT_TOOL_DESCRIPTION } from "../../../../src/server/report/core/report-tool.ts"
import { callReport } from "../../../fixture/a2ui-report.ts"
import {
  CLOSING,
  REMAINING,
  SESSION_SUMMARY,
  WAITING_LINE,
  workServer,
} from "../../../fixture/sdk-tool.ts"

const TOOL_DESCRIPTION_MAX_CHARS = 2048
const EXAMPLES_MAX_CHARS = 1600

/** 省けない欄だけを足した呼び出し。例の値がその上に重なる。 */
const baseCall = {
  conclusion: ["架空の結論"],
  closing: CLOSING,
  sessionSummary: SESSION_SUMMARY,
  sessionRemaining: REMAINING,
  waitingLine: WAITING_LINE,
}

/** ツールの説明文に載った例を、1行ずつ JSON として読み戻す。 */
const examples = REPORT_CALL_EXAMPLES_TEXT.split("\n- ")
  .slice(1)
  .map((line) => {
    const separator = line.indexOf(": ")
    return {
      name: line.slice(0, separator),
      value: z.record(z.string(), z.unknown()).parse(JSON.parse(line.slice(separator + 2))),
    }
  })

describe("report の呼び出しの例", () => {
  it("例は4つ", () => {
    expect(examples).toHaveLength(4)
  })

  it.each(examples)(
    "$name は components に組み直した report が差し戻されずに通る",
    async (example) => {
      const reply = await callReport(workServer(), { ...baseCall, ...example.value })

      expect(reply).toMatchObject({ isError: false, endsTurn: true })
    },
  )

  it("例の欄名と kind は全部ツールの説明文に残り、欄名を1つ落とした文では欠けが分かる", () => {
    const tokens = examples.flatMap((example) => tokensIn(example.value))

    expect(tokens).toContain("sections")
    expect(tokens).toContain("graph")
    expect(tokens).toContain("checks")
    expect(tokens.filter((token) => !REPORT_TOOL_DESCRIPTION.includes(token))).toEqual([])
    expect(
      tokens.filter(
        (token) => !REPORT_TOOL_DESCRIPTION.replaceAll("chartKind", "").includes(token),
      ),
    ).toContain("chartKind")
  })

  it("ツールの説明文は 2048 字に収まり、例の文は 1,600 字以内", () => {
    expect(REPORT_TOOL_DESCRIPTION.length).toBeLessThanOrEqual(TOOL_DESCRIPTION_MAX_CHARS)
    expect(REPORT_CALL_EXAMPLES_TEXT.length).toBeLessThanOrEqual(EXAMPLES_MAX_CHARS)
  })
})

/** 値を再帰で歩き、オブジェクトの欄名と文字列の `kind` の値を全部集める。 */
function tokensIn(value: unknown): readonly string[] {
  if (Array.isArray(value)) {
    return value.flatMap(tokensIn)
  }
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([key, child]) => [
      key,
      ...(key === "kind" && typeof child === "string" ? [child] : []),
      ...tokensIn(child),
    ])
  }
  return []
}
