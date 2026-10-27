import { describe, expect, it } from "vitest"

import { toSessionEvents } from "../../../../src/server/session-driver/core/sdk-message.ts"
import { reportArgumentCharsOf } from "../../../../src/shared/report/report-argument-size.ts"
import { reportEvent } from "../../../fixture/report-event.ts"
import { assistantMessageWithoutUuid, EXPRESSIONS } from "../../../fixture/sdk-assistant-message.ts"
import { REPORT_TOOL_FULL_NAME } from "../../../fixture/sdk-message.ts"

describe("toSessionEvents（report ツール）", () => {
  it("メインの report の呼び出しはレポートにする（ツールの開始にはしない。文字列の body は逃げ道の塊1つの節に畳む）", () => {
    const message = assistantMessageWithoutUuid([
      {
        type: "tool_use",
        id: "toolu_r1",
        name: REPORT_TOOL_FULL_NAME,
        input: {
          conclusion: "架空の結論。",
          body: "## 架空の見出し",
          favor: "架空のお願い",
          checks: [{ status: "ok", label: "架空の検査", detail: "架空の件数" }], // figure・command・howToVerify の無い前の形
          closing: { text: "架空の締め", expression: "proud" },
          waitingLine: { text: "架空の待ちの一言", expression: "thinking" },
          sessionSummary: "架空の要約",
        },
      },
    ])

    expect(toSessionEvents(message, EXPRESSIONS)).toEqual([
      reportEvent({
        toolUseId: "toolu_r1",
        argumentChars: expect.objectContaining({ total: expect.any(Number) }),
        conclusion: "架空の結論。",
        sections: [
          {
            heading: "",
            shapeTag: "unspecified",
            blocks: [{ kind: "markdown", markdown: "## 架空の見出し", fold: "", aside: "" }],
          },
        ],
        favor: "架空のお願い",
        checks: [
          {
            status: "ok",
            label: "架空の検査",
            figure: "",
            command: "",
            detail: "架空の件数",
            howToVerify: "",
          },
        ],
        closing: { kind: "speech", text: "架空の締め", expression: "proud" },
        waitingLine: { kind: "speech", text: "架空の待ちの一言", expression: "thinking" },
        sessionSummary: "架空の要約",
      }),
    ])
  })

  it("report の workPlanClosing はイベントに乗せ、形の崩れは none に畳む", () => {
    const closings = ["finished", "stopped", "架空の閉じ方"].map((workPlanClosing) => {
      const [event] = toSessionEvents(
        assistantMessageWithoutUuid([
          {
            type: "tool_use",
            id: "toolu_r1",
            name: REPORT_TOOL_FULL_NAME,
            input: { conclusion: "架空の結論。", workPlanClosing },
          },
        ]),
        EXPRESSIONS,
      )
      return event?.kind === "report" ? event.workPlanClosing : "report でない"
    })

    expect(closings).toEqual(["finished", "stopped", "none"])
  })

  it("report の waitingLine が空白だけ・形の崩れなら書かなかったものとして畳む", () => {
    const waitingLines = [{ text: "   ", expression: "default" }, "架空の文字列だけ"].map(
      (waitingLine) => {
        const [event] = toSessionEvents(
          assistantMessageWithoutUuid([
            {
              type: "tool_use",
              id: "toolu_r1",
              name: REPORT_TOOL_FULL_NAME,
              input: { conclusion: "架空の結論。", waitingLine },
            },
          ]),
          EXPRESSIONS,
        )
        return event?.kind === "report" ? event.waitingLine : undefined
      },
    )

    expect(waitingLines).toEqual([{ kind: "none" }, { kind: "none" }])
  })

  it("report の figure は図の塊と none の理由を運び、無い（古い transcript）・崩れたものは unrecorded に畳む", () => {
    const figures = [
      {
        kind: "stats",
        items: [
          { value: "1", label: "架空の数" },
          { value: "2", label: "架空の数" },
          { value: "3", label: "架空の数" },
        ],
      },
      { kind: "none", reason: "single-value" },
      undefined,
      { kind: "none", reason: "架空の理由" },
      { kind: "table", title: "架空の表", columns: ["a", "b"], rows: [["1", "2"]] },
    ].map((figure) => {
      const [event] = toSessionEvents(
        assistantMessageWithoutUuid([
          {
            type: "tool_use",
            id: "toolu_r1",
            name: REPORT_TOOL_FULL_NAME,
            input: { conclusion: "架空の結論。", ...(figure === undefined ? {} : { figure }) },
          },
        ]),
        EXPRESSIONS,
      )
      return event?.kind === "report" ? event.figure : undefined
    })

    const unrecorded = { kind: "none", reason: "unrecorded" }
    expect(figures).toEqual([
      {
        kind: "stats",
        items: [
          { before: "", value: "1", total: "", label: "架空の数", series: [], better: "" },
          { before: "", value: "2", total: "", label: "架空の数", series: [], better: "" },
          { before: "", value: "3", total: "", label: "架空の数", series: [], better: "" },
        ],
        fold: "",
        aside: "",
      },
      { kind: "none", reason: "single-value" },
      unrecorded,
      unrecorded,
      unrecorded,
    ])
  })

  it("report の sessionSummary が文字列でない・空白だけなら無いものとして畳む", () => {
    const summaries = [42, "   "].map((sessionSummary) => {
      const [event] = toSessionEvents(
        assistantMessageWithoutUuid([
          {
            type: "tool_use",
            id: "toolu_r1",
            name: REPORT_TOOL_FULL_NAME,
            input: { conclusion: "架空の結論。", sessionSummary },
          },
        ]),
        EXPRESSIONS,
      )
      return event?.kind === "report" ? event.sessionSummary : "report でない"
    })

    expect(summaries).toEqual([undefined, undefined])
  })

  it("report の sessionRemaining は文字列なら残り、空白だけなら none、無い（古い transcript）・文字列でないなら unrecorded に畳む", () => {
    const remainings = ["架空の残り", "   ", undefined, 42].map((sessionRemaining) => {
      const [event] = toSessionEvents(
        assistantMessageWithoutUuid([
          {
            type: "tool_use",
            id: "toolu_r1",
            name: REPORT_TOOL_FULL_NAME,
            input: {
              conclusion: "架空の結論。",
              ...(sessionRemaining === undefined ? {} : { sessionRemaining }),
            },
          },
        ]),
        EXPRESSIONS,
      )
      return event?.kind === "report" ? event.sessionRemaining : "report でない"
    })

    expect(remainings).toEqual([
      { kind: "remaining", text: "架空の残り" },
      { kind: "none" },
      { kind: "unrecorded" },
      { kind: "unrecorded" },
    ])
  })

  it("finished の report で sessionRemaining を省いたら none、finished 以外は unrecorded に畳む", () => {
    const remainings = ["finished", "stopped"].map((outcome) => {
      const [event] = toSessionEvents(
        assistantMessageWithoutUuid([
          {
            type: "tool_use",
            id: "toolu_r1",
            name: REPORT_TOOL_FULL_NAME,
            input: {
              conclusion: "架空の結論。",
              task: { id: "T-1", name: "架空の作業", outcome },
            },
          },
        ]),
        EXPRESSIONS,
      )
      return event?.kind === "report" ? event.sessionRemaining : "report でない"
    })

    expect(remainings).toEqual([{ kind: "none" }, { kind: "unrecorded" }])
  })

  it("sections は塊ごとに検証し、崩れた塊・知らない種類の塊と、塊の残らない節を落とす（省いた欄は既定で埋める）", () => {
    const message = assistantMessageWithoutUuid([
      {
        type: "tool_use",
        id: "toolu_r1",
        name: REPORT_TOOL_FULL_NAME,
        input: {
          conclusion: "架空の結論。",
          sections: [
            {
              heading: "架空の節",
              blocks: [
                { kind: "text", text: "架空の根拠。" },
                { kind: "架空の種類", source: "{}" },
                { kind: "list", style: "bullet", items: [] },
                { kind: "code", language: "diff", source: "-a" },
              ],
            },
            { heading: "架空の空の節", blocks: [{ kind: "note", tone: "架空の種別", text: "x" }] },
            "架空の崩れた節",
          ],
          body: "架空の読まれない本文",
        },
      },
    ])

    expect(toSessionEvents(message, EXPRESSIONS)).toMatchObject([
      {
        kind: "report",
        sections: [
          {
            heading: "架空の節",
            blocks: [
              { kind: "text", text: "架空の根拠。", fold: "", aside: "" },
              { kind: "code", language: "diff", path: "", source: "-a", fold: "", aside: "" },
            ],
          },
        ],
        // 知らない種類（"架空の種類"）だけを数える。既知の種類の値が崩れた「list」「note」は数えない。
        unknownBlockCount: 1,
      },
    ])
  })

  it("body の型つきフェンスを塊に読み、読めないものは素のコードブロックに落として brokenFenceCount で数える", () => {
    const message = assistantMessageWithoutUuid([
      {
        type: "tool_use",
        id: "toolu_r1",
        name: REPORT_TOOL_FULL_NAME,
        input: {
          conclusion: "架空の結論。",
          body: "架空の文\n```graph\nA -> B: 渡す\n```\n```code\nx\n```",
        },
      },
    ])

    const [event] = toSessionEvents(message, EXPRESSIONS)

    expect(event).toMatchObject({
      kind: "report",
      brokenFenceCount: 1,
      unknownBlockCount: 0,
      argumentChars: { fields: { body: expect.any(Number) } },
    })
    expect(
      event?.kind === "report" && event.sections[0]?.blocks.map((block) => block.kind),
    ).toEqual(["markdown", "graph", "code"])
  })

  it("sections も body も無いときは節を空に、favor が無いときは空の文字列に、checks が無いときは空の配列に、closing と task が無いときは none に畳む", () => {
    const message = assistantMessageWithoutUuid([
      {
        type: "tool_use",
        id: "toolu_r1",
        name: REPORT_TOOL_FULL_NAME,
        input: { conclusion: "架空の結論。" },
      },
    ])

    expect(toSessionEvents(message, EXPRESSIONS)).toEqual([
      reportEvent({
        toolUseId: "toolu_r1",
        conclusion: "架空の結論。",
        argumentChars: { total: 23, fields: { conclusion: 8 } },
      }),
    ])
  })

  it("report の task は ID・作業の名前・終わり方が揃っていれば運び、崩れていれば none に畳む", () => {
    const tasks = [
      { id: "X-7", name: "架空の作業", outcome: "stopped" },
      { id: "X-7", name: "架空の作業", outcome: "架空の終わり方" },
      { id: "X-7", outcome: "finished" },
    ].map((task) => {
      const [event] = toSessionEvents(
        assistantMessageWithoutUuid([
          {
            type: "tool_use",
            id: "toolu_r1",
            name: REPORT_TOOL_FULL_NAME,
            input: { conclusion: "架空の結論。", task },
          },
        ]),
        EXPRESSIONS,
      )
      return event?.kind === "report" ? event.task : undefined
    })

    expect(tasks).toEqual([
      { kind: "task", id: "X-7", name: "架空の作業", outcome: "stopped", genre: "unspecified" },
      { kind: "none" },
      { kind: "none" },
    ])
  })

  it("サブエージェントの report の呼び出しは捨てる（レポートにもツールの開始にもしない）", () => {
    const message = assistantMessageWithoutUuid(
      [
        {
          type: "tool_use",
          id: "toolu_r1",
          name: REPORT_TOOL_FULL_NAME,
          input: { conclusion: "架空の結論。" },
        },
      ],
      "toolu_agent",
    )

    expect(toSessionEvents(message, EXPRESSIONS)).toEqual([])
  })

  it.each([[42], [["架空の1文目。", 42]]])(
    "conclusion が文字列・文字列の配列・省略のどれでもない report（%j）はレポートにせず、字数だけの report-malformed にする",
    (conclusion) => {
      const input = { conclusion, body: "架空の本文" }
      const message = assistantMessageWithoutUuid([
        { type: "tool_use", id: "toolu_r1", name: REPORT_TOOL_FULL_NAME, input },
      ])

      expect(toSessionEvents(message, EXPRESSIONS)).toEqual([
        {
          kind: "report-malformed",
          toolUseId: "toolu_r1",
          argumentChars: reportArgumentCharsOf(input),
        },
      ])
    },
  )

  it.each([
    {
      conclusion: ["架空の1文目。", "架空の2文目。"],
      joined: "架空の1文目。架空の2文目。",
      chars: [6, 6],
    },
    {
      conclusion: ["画面に「保存しました。」と出るようにした。", "Fixed the parser. Tests pass."],
      joined: "画面に「保存しました。」と出るようにした。Fixed the parser. Tests pass.",
      chars: [20, 29],
    },
    { conclusion: "架空の1文目。架空の2文目。", joined: "架空の1文目。架空の2文目。", chars: [13] },
  ])(
    "conclusion の配列は連結し、要素ごとの字数を持つ。文字列（古い transcript）は1要素として読む: $joined",
    ({ conclusion, joined, chars }) => {
      const [event] = toSessionEvents(
        assistantMessageWithoutUuid([
          { type: "tool_use", id: "toolu_r1", name: REPORT_TOOL_FULL_NAME, input: { conclusion } },
        ]),
        EXPRESSIONS,
      )

      expect(
        event?.kind === "report"
          ? { conclusion: event.conclusion, chars: event.conclusionSentenceChars }
          : undefined,
      ).toEqual({ conclusion: joined, chars })
    },
  )

  it("conclusion を省いた report は、結論が空のレポートにする（引き継ぎは後ろの段が埋める）", () => {
    const message = assistantMessageWithoutUuid([
      {
        type: "tool_use",
        id: "toolu_r1",
        name: REPORT_TOOL_FULL_NAME,
        input: { favor: "架空のお願い" },
      },
    ])

    expect(toSessionEvents(message, EXPRESSIONS)).toEqual([
      reportEvent({
        toolUseId: "toolu_r1",
        argumentChars: reportArgumentCharsOf({ favor: "架空のお願い" }),
        conclusion: "",
        conclusionSentenceChars: [],
        favor: "架空のお願い",
      }),
    ])
  })

  /** `report` などの呼び出しの塊が開いた断片（`includePartialMessages`）。 */
  function toolUseStarted(name: string, parentToolUseId: string | null) {
    return {
      type: "stream_event",
      parent_tool_use_id: parentToolUseId,
      event: {
        type: "content_block_start",
        index: 1,
        content_block: { type: "tool_use", id: "toolu_r1", name, input: {} },
      },
    }
  }

  it("メインの report の呼び出しの塊が開いたら、書き始めた合図にする（立ち絵の「書いている」）", () => {
    expect(toSessionEvents(toolUseStarted(REPORT_TOOL_FULL_NAME, null), EXPRESSIONS)).toEqual([
      { kind: "report-drafting", toolUseId: "toolu_r1" },
    ])
  })

  it("サブエージェントの report や、ほかのツールの塊が開いても合図にしない", () => {
    expect(
      toSessionEvents(toolUseStarted(REPORT_TOOL_FULL_NAME, "toolu_agent"), EXPRESSIONS),
    ).toEqual([])
    expect(toSessionEvents(toolUseStarted("Read", null), EXPRESSIONS)).toEqual([])
  })

  it("report の引数の断片（input_json_delta）は運ばない", () => {
    const delta = {
      type: "stream_event",
      parent_tool_use_id: null,
      event: {
        type: "content_block_delta",
        index: 1,
        delta: { type: "input_json_delta", partial_json: '{"conclusion":"架空' },
      },
    }

    expect(toSessionEvents(delta, EXPRESSIONS)).toEqual([])
  })
})
