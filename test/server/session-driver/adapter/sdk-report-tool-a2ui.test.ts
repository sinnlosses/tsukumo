// `report` を A2UI の部品の一覧で受ける版（`a2ui`）を、モデルが見るのと同じ `tools/list` / `tools/call` で確かめる。

import { describe, expect, it } from "vitest"
import { z } from "zod"

import { REPORT_TOOL_DESCRIPTION } from "../../../../src/server/report/core/report-tool.ts"
import type { ReportDraft } from "../../../../src/server/report/core/report-violation.ts"
import {
  type CallReview,
  createCallReview,
} from "../../../../src/server/session-driver/core/call-review.ts"
import { toSessionEvents } from "../../../../src/server/session-driver/core/sdk-message.ts"
import { REPORT_COMPONENT_SCHEMAS } from "../../../../src/shared/report/a2ui-report-catalog.ts"
import { reportOutline } from "../../../../src/shared/report/report-outline.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"
import { callTool, mcpRequest } from "../../../fixture/mcp-server.ts"
import { assistantMessage, REPORT_TOOL_FULL_NAME } from "../../../fixture/sdk-message.ts"
import {
  CLOSING,
  REMAINING,
  SESSION_SUMMARY,
  TOOL_EXPRESSIONS,
  WAITING_LINE,
  WORK_MODE,
  workServer,
} from "../../../fixture/sdk-tool.ts"

type ReportCalled = Extract<SessionEvent, { kind: "report" }>

const ROOT = {
  id: "root",
  component: "Report",
  conclusion: ["架空の結論。"],
  figureNone: "short-answer",
  closing: CLOSING,
  waitingLine: WAITING_LINE,
  sessionSummary: SESSION_SUMMARY,
  sessionRemaining: REMAINING,
  children: ["sec"],
}

const paragraph = (id: string, text: string) => ({ id, component: "Paragraph", text })

/** 正しい一覧。節 1 つに地の文 1 つ。 */
const VALID = [
  ROOT,
  { id: "sec", component: "Section", heading: "架空の節", children: ["p"] },
  paragraph("p", "架空の本文。"),
]

/** 3 つ目の部品（`Section`）の子に `Section` を置いた一覧。 */
const NESTED = [
  ROOT,
  paragraph("p", "架空の本文。"),
  { id: "sec", component: "Section", heading: "架空の節", children: ["inner"] },
  { id: "inner", component: "Section", heading: "架空の内側", children: ["p"] },
]

/** 本物の駆動と同じ並び（変換 → handler → 結果）で、1 つのセッションに `report` を呼んでいく口。 */
function session() {
  const inner = createCallReview()
  const drafts: ReportDraft[] = []
  const review: CallReview = {
    ...inner,
    judgeReport: (draft) => {
      drafts.push(draft)
      return inner.judgeReport(draft)
    },
  }
  let count = 0
  return {
    drafts,
    call: async (components: readonly unknown[]) => {
      count += 1
      const toolUseId = `toolu_a${String(count)}`
      const input = { components }
      const converted = toSessionEvents(
        assistantMessage([{ type: "tool_use", id: toolUseId, name: REPORT_TOOL_FULL_NAME, input }]),
        ["default"],
      )
      const before = converted.flatMap((event) => review.pass(event))
      const reply = await callTool(workServer([], [], review, [], WORK_MODE), "report", input)
      const after = review.pass({
        kind: "tool-finished",
        toolUseId,
        content: reply.text,
        isError: reply.isError,
      })
      const events = [...before, ...after]
      return {
        reply,
        drawn: events.find((event): event is ReportCalled => event.kind === "report"),
        rejected: events.find((event) => event.kind === "report-rejected"),
      }
    },
  }
}

describe("a2ui の report の受理と差し戻し", () => {
  it("正しい一覧は結論の 1 文目で通し、ターンを閉じ、写した節を描く", async () => {
    const live = session()

    const { reply, drawn } = await live.call(VALID)

    expect(reply).toEqual({ text: "架空の結論。", isError: false, endsTurn: true })
    expect(drawn?.sections).toMatchObject([
      { heading: "架空の節", blocks: [{ kind: "text", text: "架空の本文。" }] },
    ])
    expect(drawn?.components).toHaveLength(VALID.length)
  })

  it("Section の入れ子は判定より先に VALIDATION_FAILED と JSON Pointer で差し戻し、記録の理由と欄に残す", async () => {
    const live = session()

    const { reply, rejected } = await live.call(NESTED)

    expect(reply.isError).toBe(true)
    expect(reply.text).toContain('"code":"VALIDATION_FAILED"')
    expect(reply.text).toContain('"surfaceId":"report"')
    expect(reply.text).toContain('"path":"/components/2/children/0"')
    expect(reply.text).not.toContain("架空の内側")
    expect(live.drafts).toEqual([])
    expect(rejected).toMatchObject({
      reasons: ["tool-error", "a2ui-structure"],
      toolErrorFields: [{ field: "components.n.children.n", code: "nested-section" }],
    })
  })

  it("同じターンの 2 回目の構造の違反は差し戻さず、判定へ進む", async () => {
    const live = session()

    await live.call(NESTED)
    const second = await live.call(NESTED)

    expect(second.reply.isError).toBe(false)
    expect(live.drafts).toHaveLength(1)
  })

  it("判定の差し戻しのあと一覧を直して出し直すと、新しい一覧の節で判定し描く", async () => {
    const live = session()
    const violating = [
      { ...ROOT, conclusion: ["架空の一文目。", "架空の二文目。", "架空の三文目。"] },
      ...VALID.slice(1),
    ]
    const fixed = [
      ROOT,
      { id: "sec", component: "Section", heading: "架空の直した節", children: ["p"] },
      paragraph("p", "架空の直した本文。"),
    ]

    const rejected = await live.call(violating)
    const resent = await live.call(fixed)

    expect(rejected.reply.isError).toBe(true)
    expect(resent.reply.isError).toBe(false)
    expect(reportOutline(live.drafts.at(-1)?.components ?? []).sections).toMatchObject([
      {
        kind: "section",
        heading: "架空の直した節",
        leaves: [{ component: "Paragraph", text: "架空の直した本文。" }],
      },
    ])
    expect(resent.drawn?.sections).toMatchObject([{ heading: "架空の直した節" }])
  })
})

describe("a2ui の report の定義", () => {
  it("説明文は REPORT_TOOL_DESCRIPTION で、引数は components だけを持つ", async () => {
    const report = await listedReport()

    expect(report.description).toBe(REPORT_TOOL_DESCRIPTION)
    expect(Object.keys(report.inputSchema.properties)).toEqual(["components"])
  })

  it("components の要素はカタログの 28 部品のどれか", async () => {
    const report = await listedReport()

    expect(componentNames(report).toSorted()).toEqual(
      Object.keys(REPORT_COMPONENT_SCHEMAS).toSorted(),
    )
  })

  it("Report の締めのセリフと待ちの一言は、渡した表情の名前だけを選べる", async () => {
    const report = await listedReport()
    const reportPart = report.inputSchema.properties.components.items.oneOf.find(
      (part) => part.properties.component.const === "Report",
    )

    expect(JSON.stringify(reportPart?.properties.closing)).toContain(
      JSON.stringify(TOOL_EXPRESSIONS.map((choice) => choice.name)),
    )
    expect(JSON.stringify(reportPart?.properties.waitingLine)).toContain(
      JSON.stringify(TOOL_EXPRESSIONS.map((choice) => choice.name)),
    )
  })
})

/** `tools/list` の応答のうち、ここで読む形（名前・説明文・引数の schema）。 */
const TOOLS_REPLY = z.object({
  id: z.literal(1),
  result: z.object({
    tools: z.array(
      z.object({ name: z.string(), description: z.string(), inputSchema: z.unknown() }),
    ),
  }),
})

/** report の引数の schema のうち、ここで読む形（`components` の要素の部品ごとの props）。 */
const REPORT_INPUT_SCHEMA = z.object({
  properties: z.object({
    components: z.object({
      items: z.object({
        oneOf: z.array(
          z.object({
            properties: z.looseObject({
              component: z.object({ const: z.string() }),
              closing: z.unknown().optional(),
              waitingLine: z.unknown().optional(),
            }),
          }),
        ),
      }),
    }),
  }),
})

async function listedReport() {
  const server = workServer([], [], createCallReview(), [], WORK_MODE)
  const reply = await mcpRequest(server, "tools/list", {}, TOOLS_REPLY)
  const report = reply.result.tools.find((tool) => tool.name === "report")
  if (report === undefined) {
    throw new Error("report が載っていない")
  }
  return {
    description: report.description,
    inputSchema: REPORT_INPUT_SCHEMA.parse(report.inputSchema),
  }
}

function componentNames(report: Awaited<ReturnType<typeof listedReport>>): readonly string[] {
  return report.inputSchema.properties.components.items.oneOf.map(
    (part) => part.properties.component.const,
  )
}
