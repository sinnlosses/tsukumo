import { describe, expect, it } from "vitest"
import { z } from "zod"

import {
  type CallReview,
  createCallReview,
} from "../../../../src/server/session-driver/core/call-review.ts"
import { FIRST_SENTENCE_TARGET } from "../../../../src/shared/report/report-limit.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"
import { callTool, mcpRequest } from "../../../fixture/mcp-server.ts"
import {
  CLOSING,
  FIGURE,
  REMAINING,
  SUMMARY,
  WAITING_LINE,
  workServer,
} from "../../../fixture/sdk-tool.ts"

describe("report でターンを閉じる", () => {
  it("通った report の結果にだけ claude/endTurn を付ける", async () => {
    const reply = await callTool(workServer(), "report", {
      conclusion: ["架空の結論"],
      closing: CLOSING,
      figure: FIGURE,
      sessionSummary: SUMMARY,
      sessionRemaining: REMAINING,
      waitingLine: WAITING_LINE,
    })

    expect(reply).toEqual({ text: "架空の結論", isError: false, endsTurn: true })
  })

  it.each([
    { name: "2要素", conclusion: ["架空の一文目。", "架空の二文目。"], text: "架空の一文目。" },
    { name: "句点の無い2要素", conclusion: ["架空の結論A", "架空の補足B"], text: "架空の結論A" },
    {
      name: "鉤括弧の中に句点がある1要素目",
      conclusion: ["「架空の設定。」を直した。", "架空の二文目。"],
      text: "「架空の設定。」を直した。",
    },
    { name: "前後に空白のある1要素目", conclusion: ["  架空の結論。 "], text: "架空の結論。" },
  ])("通った report の結果の文は結論の1要素目になる（$name）", async ({ conclusion, text }) => {
    const reply = await callTool(workServer(), "report", {
      conclusion,
      closing: CLOSING,
      figure: FIGURE,
      sessionSummary: SUMMARY,
      sessionRemaining: REMAINING,
      waitingLine: WAITING_LINE,
    })

    expect(reply).toEqual({ text, isError: false, endsTurn: true })
  })

  it("差し戻した report（isError）には付けない（直して呼び直せる）", async () => {
    // conclusion が3要素以上（規約違反「冒頭の1〜2文で結論」）だと差し戻される。
    const reply = await callTool(workServer(), "report", {
      conclusion: ["架空の一文目。", "架空の二文目。", "架空の三文目。"],
      closing: CLOSING,
      figure: FIGURE,
      sessionSummary: SUMMARY,
      sessionRemaining: REMAINING,
      waitingLine: WAITING_LINE,
    })

    expect(reply.isError).toBe(true)
    expect(reply.endsTurn).toBe(false)
  })

  it("構文が割れる mermaid の図を含む report は差し戻し、直した report は通す", async () => {
    const withDiagram = (source: string) => ({
      conclusion: ["架空の結論"],
      sections: [{ blocks: [{ kind: "mermaid", source }] }],
      closing: CLOSING,
      figure: FIGURE,
      sessionSummary: SUMMARY,
      sessionRemaining: REMAINING,
      waitingLine: WAITING_LINE,
    })

    const broken = await callTool(
      workServer(),
      "report",
      withDiagram("sequenceDiagram\n  A->>B: hi; there"),
    )
    const fixed = await callTool(
      workServer(),
      "report",
      withDiagram("sequenceDiagram\n  A->>B: hi"),
    )

    expect(broken.isError).toBe(true)
    expect(broken.text).toContain("1個目の 2 行目")
    expect(broken.text).not.toContain("there")
    expect(fixed).toEqual({ text: "架空の結論", isError: false, endsTurn: true })
  })

  it("figure に置いた mermaid の構文も検査し、描く順の1個目として差し戻す", async () => {
    const reply = await callTool(workServer(), "report", {
      conclusion: ["架空の結論"],
      figure: { kind: "mermaid", source: "sequenceDiagram\n  A->>B: hi; there" },
      sections: [{ blocks: [{ kind: "mermaid", source: "sequenceDiagram\n  A->>B: hi" }] }],
      closing: CLOSING,
      sessionSummary: SUMMARY,
      sessionRemaining: REMAINING,
      waitingLine: WAITING_LINE,
    })

    expect(reply.isError).toBe(true)
    expect(reply.text).toContain("1個目の 2 行目")
    expect(reply.text).not.toContain("there")
  })

  it("引き継ぐ土台が無いのに closing を省いた report は組んだ値の形の検査で落ち、ターンを閉じない", async () => {
    const reply = await callTool(workServer(), "report", { conclusion: ["架空の結論"] })

    expect(reply.isError).toBe(true)
    expect(reply.text).toContain("Input validation error")
    expect(reply.endsTurn).toBe(false)
  })

  it("conclusion を配列でなく文字列で渡した report は引数の検査で落ち、ターンを閉じない", async () => {
    const reply = await callTool(workServer(), "report", {
      conclusion: "架空の結論",
      closing: CLOSING,
      figure: FIGURE,
      sessionSummary: SUMMARY,
      sessionRemaining: REMAINING,
      waitingLine: WAITING_LINE,
    })

    expect(reply.isError).toBe(true)
    expect(reply.text).toContain("Input validation error")
    expect(reply.endsTurn).toBe(false)
  })

  it("組んだ値の形の検査で落ちた report は判定しない（記録は CallReview.pass が結果から作る）", async () => {
    const events: SessionEvent[] = []
    const review = createCallReview()
    let judged = 0
    const judgeReport: CallReview["judgeReport"] = (draft) => {
      judged += 1
      return review.judgeReport(draft)
    }

    const reply = await callTool(workServer(events, [], { ...review, judgeReport }), "report", {
      conclusion: ["架空の結論"],
    })

    expect(reply.isError).toBe(true)
    expect(judged).toBe(0)
    expect(events).toEqual([])
  })

  it("選択肢に無い表情の waitingLine は形の検査で落ちる", async () => {
    const reply = await callTool(workServer(), "report", {
      conclusion: ["架空の結論"],
      closing: CLOSING,
      figure: FIGURE,
      sessionSummary: SUMMARY,
      sessionRemaining: REMAINING,
      waitingLine: { text: "架空の待ちの一言", expression: "架空の表情" },
    })

    expect(reply.isError).toBe(true)
    expect(reply.endsTurn).toBe(false)
  })

  it("waitingLine・sessionSummary・sessionRemaining のどれかの無い report は形の検査で落ち、ターンを閉じない", async () => {
    const complete = {
      conclusion: ["架空の結論"],
      figure: FIGURE,
      closing: CLOSING,
      waitingLine: WAITING_LINE,
      sessionSummary: SUMMARY,
      sessionRemaining: REMAINING,
    }
    const { waitingLine: _waitingLine, ...noWaitingLine } = complete
    const { sessionSummary: _sessionSummary, ...noSummary } = complete
    const { sessionRemaining: _sessionRemaining, ...noRemaining } = complete

    for (const input of [noWaitingLine, noSummary, noRemaining]) {
      expect(await callTool(workServer(), "report", input)).toMatchObject({
        isError: true,
        endsTurn: false,
      })
    }
    expect(await callTool(workServer(), "report", complete)).toMatchObject({
      isError: false,
      endsTurn: true,
    })
  })

  it("figure の無い report・理由の無い none は形の検査で落ち、図の塊1つか none と理由で通る", async () => {
    const withFigure = (figure: unknown) => ({
      conclusion: ["架空の結論"],
      ...(figure === undefined ? {} : { figure }),
      closing: CLOSING,
      sessionSummary: SUMMARY,
      sessionRemaining: REMAINING,
      waitingLine: WAITING_LINE,
    })

    const replies = await Promise.all(
      [
        undefined,
        { kind: "none" },
        { kind: "none", reason: "unrecorded" },
        { kind: "table", title: "架空の表", columns: ["a", "b"], rows: [["1", "2"]] },
        { kind: "graph", direction: "LR", source: "架空のA -> 架空のB" },
        { kind: "none", reason: "no-shape" },
      ].map((figure) => callTool(workServer(), "report", withFigure(figure))),
    )

    expect(replies.map((reply) => reply.isError)).toEqual([true, true, true, true, false, false])
    expect(replies[5]).toEqual({ text: "架空の結論", isError: false, endsTurn: true })
  })

  it("speak はターンを閉じない", async () => {
    const reply = await callTool(workServer(), "speak", CLOSING)

    expect(reply).toEqual({ text: "ok", isError: false, endsTurn: false })
  })
})

describe("report の本文（sections）", () => {
  it("引数は節と塊の並び（sections）で、文字列の body は無い", async () => {
    const reply = await mcpRequest(workServer(), "tools/list", {}, TOOLS_SCHEMA_REPLY)
    const properties = reply.result.tools.find((tool) => tool.name === "report")?.inputSchema
      .properties

    expect(Object.keys(properties ?? {})).toContain("sections")
    expect(Object.keys(properties ?? {})).not.toContain("body")
  })

  it("figure と sections が共有する塊は definitions に1回だけ置いて参照し、report の引数の schema が字数の上限を超えない", async () => {
    const reply = await mcpRequest(workServer(), "tools/list", {}, TOOLS_WHOLE_SCHEMA_REPLY)
    const inputSchema = reply.result.tools.find((tool) => tool.name === "report")?.inputSchema
    const schema = z
      .object({
        properties: z.object({
          figure: z.object({ oneOf: z.array(z.record(z.string(), z.unknown())) }),
        }),
        definitions: z.record(z.string(), z.unknown()),
      })
      .parse(inputSchema)
    const figureRefs = schema.properties.figure.oneOf.flatMap((branch) =>
      typeof branch["$ref"] === "string" ? [branch["$ref"]] : [],
    )

    expect(Object.keys(schema.definitions).toSorted()).toEqual(SHARED_BLOCK_DEFINITIONS)
    expect(figureRefs.toSorted()).toEqual(
      SHARED_BLOCK_DEFINITIONS.filter(
        (name) => name !== "BeforeAfterSide" && name !== "SvgShape" && name !== "ToneLegend",
      ).map((name) => `#/definitions/${name}`),
    )
    expect(JSON.stringify(inputSchema).length).toBeLessThan(REPORT_INPUT_SCHEMA_MAX_CHARS)
  })

  it("report の引数の schema に、既定値と書き方に効かない数・字数の制約が出ない", async () => {
    const reply = await mcpRequest(workServer(), "tools/list", {}, TOOLS_WHOLE_SCHEMA_REPLY)
    const inputSchema = reply.result.tools.find((tool) => tool.name === "report")?.inputSchema

    expect(JSON.stringify(inputSchema)).not.toMatch(
      /"(?:default|exclusiveMinimum|minLength|minimum|maximum)":/,
    )
  })

  it("schema から外した制約も検査には残り、空白だけの ID と0の幅の report は差し戻す", async () => {
    const reply = await callTool(workServer(), "report", {
      task: { id: " ", name: "架空の作業", outcome: "finished" },
      conclusion: ["架空の結論"],
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
      closing: CLOSING,
      figure: FIGURE,
      sessionSummary: SUMMARY,
      sessionRemaining: REMAINING,
      waitingLine: WAITING_LINE,
    })

    expect(reply.isError).toBe(true)
    expect(reply.text).toContain("Too small: expected string to have >=1 characters")
    expect(reply.text).toContain("Too small: expected number to be >0")
  })

  it("conclusion の説明に、目安の字数・読点の数・悪い例と良い例がある", async () => {
    const reply = await mcpRequest(workServer(), "tools/list", {}, TOOLS_SCHEMA_REPLY)
    const conclusion = z
      .object({ description: z.string() })
      .parse(
        reply.result.tools.find((tool) => tool.name === "report")?.inputSchema.properties[
          "conclusion"
        ],
      )

    expect(conclusion.description).toContain(`目安は${String(FIRST_SENTENCE_TARGET)}字`)
    expect(conclusion.description).toContain("読点は1つまで")
    expect(conclusion.description).toContain("悪い例")
    expect(conclusion.description).toContain("良い例")
  })

  it("塊で書いた report は通り、逃げ道に塊の種類がある記法を書いた report は差し戻す", async () => {
    const accepted = await callTool(workServer(), "report", {
      conclusion: ["架空の結論"],
      sections: [
        {
          heading: "架空の節",
          blocks: [
            { kind: "text", text: "架空の根拠。" },
            { kind: "list", style: "bullet", items: [{ text: "架空の項目" }] },
          ],
        },
      ],
      closing: CLOSING,
      figure: FIGURE,
      sessionSummary: SUMMARY,
      sessionRemaining: REMAINING,
      waitingLine: WAITING_LINE,
    })
    const rejected = await callTool(workServer(), "report", {
      conclusion: ["架空の結論"],
      sections: [{ blocks: [{ kind: "markdown", markdown: "- 架空の項目" }] }],
      closing: CLOSING,
      figure: FIGURE,
      sessionSummary: SUMMARY,
      sessionRemaining: REMAINING,
      waitingLine: WAITING_LINE,
    })

    expect(accepted).toEqual({ text: "架空の結論", isError: false, endsTurn: true })
    expect(rejected.isError).toBe(true)
    expect(rejected.text).toContain("`list` の塊")
  })
})

describe("report の差し戻しの記録", () => {
  const draft = {
    conclusion: ["架空の結論"],
    closing: CLOSING,
    figure: FIGURE,
    sessionSummary: SUMMARY,
    sessionRemaining: REMAINING,
    waitingLine: WAITING_LINE,
  }

  it("差し戻した report の記録は handler からは流さない（結果を見る CallReview.pass が作る）", async () => {
    const events: SessionEvent[] = []
    const reply = await callTool(workServer(events), "report", {
      ...draft,
      sections: [{ blocks: [{ kind: "markdown", markdown: "- 架空の項目" }] }],
    })

    expect(reply.isError).toBe(true)
    expect(events).toEqual([])
  })
})

describe("report の title", () => {
  it("通った report の title を渡す", async () => {
    const titles: string[] = []

    const reply = await callTool(workServer([], titles), "report", {
      conclusion: ["架空の結論"],
      closing: CLOSING,
      figure: FIGURE,
      sessionSummary: SUMMARY,
      sessionRemaining: REMAINING,
      waitingLine: WAITING_LINE,
      title: "架空の題",
    })

    expect(reply.isError).toBe(false)
    expect(titles).toEqual(["架空の題"])
  })

  it("title を渡さなくても report は通る", async () => {
    const titles: string[] = []

    const reply = await callTool(workServer([], titles), "report", {
      conclusion: ["架空の結論"],
      closing: CLOSING,
      figure: FIGURE,
      sessionSummary: SUMMARY,
      sessionRemaining: REMAINING,
      waitingLine: WAITING_LINE,
    })

    expect(reply.isError).toBe(false)
    expect(titles).toEqual([])
  })

  it("規約違反で差し戻された report の title は渡さない", async () => {
    const titles: string[] = []

    const reply = await callTool(workServer([], titles), "report", {
      conclusion: ["架空の一文目。", "架空の二文目。", "架空の三文目。"],
      closing: CLOSING,
      figure: FIGURE,
      sessionSummary: SUMMARY,
      sessionRemaining: REMAINING,
      waitingLine: WAITING_LINE,
      title: "架空の題",
    })

    expect(reply.isError).toBe(true)
    expect(titles).toEqual([])
  })
})

/** `figure` と `sections` の両方に置ける塊と、`beforeAfter` の前後の側、svg の図形。`report` の schema の `definitions` に1回ずつ出る。 */
const SHARED_BLOCK_DEFINITIONS = [
  "BeforeAfterBlock",
  "BeforeAfterSide",
  "ChartBlock",
  "DimensionBlock",
  "GraphBlock",
  "ImageBlock",
  "MermaidBlock",
  "StatsBlock",
  "SvgBlock",
  "SvgShape",
  "ToneLegend",
]

/** 塊の定義が `figure` と `sections` に複製されていたとき（約3.0万字）に落ち、いまの形（22,407字）には余白を持たせた上限。 */
const REPORT_INPUT_SCHEMA_MAX_CHARS = 22_500

/** `tools/list` の応答のうち、引数の schema を丸ごと読む形。 */
const TOOLS_WHOLE_SCHEMA_REPLY = z.object({
  id: z.literal(1),
  result: z.object({
    tools: z.array(z.object({ name: z.string(), inputSchema: z.record(z.string(), z.unknown()) })),
  }),
})

/** `tools/list` の応答のうち、ここで読む形（名前と、引数の schema の欄の名前）。 */
const TOOLS_SCHEMA_REPLY = z.object({
  id: z.literal(1),
  result: z.object({
    tools: z.array(
      z.object({
        name: z.string(),
        inputSchema: z.object({ properties: z.record(z.string(), z.unknown()) }),
      }),
    ),
  }),
})
