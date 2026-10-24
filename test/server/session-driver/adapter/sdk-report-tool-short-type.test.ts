// `report` の塊の型を短い型の表記で渡す版（`short-type`）を、モデルが見るのと同じ `tools/list` / `tools/call` で確かめる。

import { describe, expect, it } from "vitest"
import { z } from "zod"

import {
  REPORT_FIGURE_DESCRIPTION,
  REPORT_SECTIONS_DESCRIPTION,
  REPORT_TOOL_DESCRIPTION,
} from "../../../../src/server/report/core/report-tool.ts"
import { reportShortTypeText } from "../../../../src/server/report/core/short-type-text.ts"
import {
  type CallReview,
  createCallReview,
} from "../../../../src/server/session-driver/core/call-review.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"
import { callTool, mcpRequest } from "../../../fixture/mcp-server.ts"
import {
  CLOSING,
  FIGURE,
  REMAINING,
  SHORT_TYPE_WORK_MODE,
  SUMMARY,
  WAITING_LINE,
  WORK_MODE,
  workServer,
} from "../../../fixture/sdk-tool.ts"

describe("short-type の report の定義", () => {
  it("説明文は json-schema と同じで、塊の型は sections の欄の説明に載り、definitions は無い", async () => {
    const report = await listedReport(shortTypeServer())

    expect(report.description).toBe(REPORT_TOOL_DESCRIPTION)
    expect(report.inputSchema.definitions).toBeUndefined()
    expect(report.inputSchema.properties.sections.description).toContain(
      REPORT_SECTIONS_DESCRIPTION,
    )
    expect(report.inputSchema.properties.sections.description).toContain(reportShortTypeText())
    expect(report.inputSchema.properties.figure.description).toContain(REPORT_FIGURE_DESCRIPTION)
  })

  it("引数の schema は json-schema の版より小さく、上限を超えない", async () => {
    const short = (await listedReport(shortTypeServer())).inputSchemaChars
    const full = (await listedReport(workServer())).inputSchemaChars

    expect(short).toBeLessThan(full)
    expect(short).toBeLessThan(SHORT_TYPE_INPUT_SCHEMA_MAX_CHARS)
  })
})

describe("short-type の report の受理", () => {
  const draft = {
    conclusion: ["架空の結論"],
    closing: CLOSING,
    figure: FIGURE,
    sessionSummary: SUMMARY,
    sessionRemaining: REMAINING,
    waitingLine: WAITING_LINE,
  }
  const inputs = [
    ...[
      undefined,
      { kind: "none" },
      { kind: "none", reason: "unrecorded" },
      { kind: "table", title: "架空の表", columns: ["a", "b"], rows: [["1", "2"]] },
      { kind: "graph", direction: "LR", source: "架空のA -> 架空のB" },
      { kind: "none", reason: "no-shape" },
    ].map((figure) => {
      const { figure: _figure, ...rest } = draft
      return figure === undefined ? rest : { ...rest, figure }
    }),
    {
      ...draft,
      task: { id: " ", name: "架空の作業", outcome: "finished" },
      sections: [
        {
          blocks: [
            {
              kind: "svg",
              width: 0,
              height: 10,
              shapes: [{ kind: "text", x: 0, y: 0, text: "架空" }],
            },
          ],
        },
      ],
    },
    { ...draft, sections: [{ blocks: [{ kind: "markdown", markdown: "- 架空の項目" }] }] },
    { ...draft, sections: [{ blocks: [{ kind: "text" }] }] },
    {
      ...draft,
      sections: [
        {
          heading: "架空の節",
          blocks: [
            { kind: "text", text: "架空の根拠。" },
            { kind: "list", style: "bullet", items: [{ text: "架空の項目" }] },
          ],
        },
      ],
    },
  ]

  it("同じ引数なら json-schema の版と同じに受け付け・差し戻す", async () => {
    const outcomes = async (mode: typeof WORK_MODE) =>
      Promise.all(
        inputs.map(async (input) => {
          const reply = await callTool(
            workServer([], [], createCallReview(), [], mode),
            "report",
            input,
          )
          return { isError: reply.isError, endsTurn: reply.endsTurn }
        }),
      )

    const short = await outcomes(SHORT_TYPE_WORK_MODE)

    expect(short).toEqual(await outcomes(WORK_MODE))
    expect(short.map((outcome) => outcome.isError)).toEqual([
      true,
      true,
      true,
      true,
      false,
      false,
      true,
      true,
      true,
      false,
    ])
  })

  it("緩い形を通った塊は handler が zod の制約で落とし、落ちた文面は zod の文を載せる", async () => {
    const reply = await callTool(shortTypeServer(), "report", {
      ...draft,
      sections: [
        {
          blocks: [
            {
              kind: "svg",
              width: 0,
              height: 10,
              shapes: [{ kind: "text", x: 0, y: 0, text: "架空" }],
            },
          ],
        },
      ],
    })

    expect(reply.isError).toBe(true)
    // SDK の検査で落ちた文面には `MCP error` が前に付く。付かないのは handler で落ちたもの。
    expect(reply.text).not.toContain("MCP error")
    expect(reply.text).toContain("Input validation error: Invalid arguments for tool report")
    expect(reply.text).toContain("Too small: expected number to be >0")
  })

  it("塊の形が崩れた report は判定せず、handler からイベントを流さない", async () => {
    const events: SessionEvent[] = []
    const review = createCallReview()
    let judged = 0
    const judgeReport: CallReview["judgeReport"] = (report) => {
      judged += 1
      return review.judgeReport(report)
    }

    const reply = await callTool(
      workServer(events, [], { ...review, judgeReport }, [], SHORT_TYPE_WORK_MODE),
      "report",
      { ...draft, sections: [{ blocks: [{ kind: "text" }] }] },
    )

    expect(reply.isError).toBe(true)
    expect(judged).toBe(0)
    expect(events).toEqual([])
  })
})

/** 今の形（17,247字）に余白を持たせた上限。 */
const SHORT_TYPE_INPUT_SCHEMA_MAX_CHARS = 17_350

function shortTypeServer() {
  return workServer([], [], createCallReview(), [], SHORT_TYPE_WORK_MODE)
}

/** `tools/list` の応答のうち、ここで読む形（名前・説明文・引数の schema）。 */
const TOOLS_REPLY = z.object({
  id: z.literal(1),
  result: z.object({
    tools: z.array(
      z.object({ name: z.string(), description: z.string(), inputSchema: z.unknown() }),
    ),
  }),
})

/** report の引数の schema のうち、ここで読む形（`definitions` の有無と、figure・sections の説明）。 */
const REPORT_INPUT_SCHEMA = z.object({
  definitions: z.unknown().optional(),
  properties: z.object({
    figure: z.object({ description: z.string() }),
    sections: z.object({ description: z.string() }),
  }),
})

async function listedReport(server: ReturnType<typeof workServer>) {
  const reply = await mcpRequest(server, "tools/list", {}, TOOLS_REPLY)
  const report = reply.result.tools.find((tool) => tool.name === "report")
  if (report === undefined) {
    throw new Error("report が載っていない")
  }
  return {
    description: report.description,
    inputSchema: REPORT_INPUT_SCHEMA.parse(report.inputSchema),
    inputSchemaChars: JSON.stringify(report.inputSchema).length,
  }
}
