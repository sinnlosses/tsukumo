import { describe, expect, it } from "vitest"

import { EMPTY_INPUT_LEDGER } from "../../../../src/server/session-driver/core/input-ledger.ts"
import { toRestoredEvents } from "../../../../src/server/session-driver/core/session-restore.ts"
import { applyRestoredEvents } from "../../../../src/server/session/core/restored-event.ts"
import { mainViewEntries } from "../../../../src/shared/session/main-view-entry.ts"
import { applySessionEvent } from "../../../../src/shared/session/session-fold.ts"
import { INITIAL_SESSION_STATE } from "../../../../src/shared/session/session-state.ts"
import { reportEvent } from "../../../fixture/report-event.ts"
import { EXPRESSIONS } from "../../../fixture/sdk-assistant-message.ts"
import {
  assistantMessage,
  REPORT_TOOL_FULL_NAME,
  SPEAK_TOOL_FULL_NAME,
  userMessage,
  WORK_PLAN_TOOL_FULL_NAME,
} from "../../../fixture/sdk-message.ts"
import { requestEvent } from "../../../fixture/session-event.ts"
import { eventsOf, stamped } from "../../../fixture/session-restore.ts"

describe("toRestoredEvents", () => {
  it("組み直せたものが無ければ空", () => {
    expect(toRestoredEvents([null, { type: "user" }], EXPRESSIONS, EMPTY_INPUT_LEDGER)).toEqual([])
  })

  it("出来事は元のメッセージの timestamp を持ち、ターンの境目は直前の出来事の時刻を引き継ぐ", () => {
    const messages = [
      stamped(userMessage("架空の依頼その1"), "2026-01-02T03:00:00.000Z"),
      stamped(assistantMessage([{ type: "text", text: "架空の本文" }]), "2026-01-02T03:05:00.000Z"),
      stamped(userMessage("架空の依頼その2"), "2026-01-02T03:10:00.000Z"),
    ]

    expect(
      toRestoredEvents(messages, EXPRESSIONS, EMPTY_INPUT_LEDGER).map(({ event, time }) => [
        event.kind,
        time,
      ]),
    ).toEqual([
      ["request", { kind: "known", at: 1767322800000 }],
      ["utterance", { kind: "known", at: 1767323100000 }],
      ["turn-finished", { kind: "known", at: 1767323100000 }],
      ["request", { kind: "known", at: 1767323400000 }],
      ["turn-finished", { kind: "known", at: 1767323400000 }],
    ])
  })

  it("畳むと、最後のやり取りの所要が transcript の依頼から終わりまでの時刻の差になる", () => {
    const messages = [
      stamped(userMessage("架空の依頼その1"), "2026-01-02T03:00:00.000Z"),
      stamped(userMessage("架空の依頼その2"), "2026-01-02T03:10:00.000Z"),
      stamped(assistantMessage([{ type: "text", text: "架空の本文" }]), "2026-01-02T03:12:30.000Z"),
    ]

    const state = applyRestoredEvents(
      INITIAL_SESSION_STATE,
      toRestoredEvents(messages, EXPRESSIONS, EMPTY_INPUT_LEDGER),
      999,
    )

    expect(state.turn).toMatchObject({
      kind: "finished",
      startedAt: 1767323400000,
      finishedAt: 1767323550000,
    })
  })

  it("時刻の読めないメッセージの出来事は unknown", () => {
    const messages = [
      stamped(userMessage("架空の依頼"), "読めない綴り"),
      userMessage("架空の依頼その2"),
    ]

    expect(
      toRestoredEvents(messages, EXPRESSIONS, EMPTY_INPUT_LEDGER).map(({ time }) => time.kind),
    ).toEqual(["unknown", "unknown", "unknown", "unknown"])
  })

  it("依頼・本文・セリフ・ツールの行が起き、ターンの境目が依頼ごとに分かれる", () => {
    const messages = [
      userMessage([{ type: "text", text: "架空の依頼その1" }]),
      assistantMessage([
        { type: "text", text: "架空の本文その1" },
        { type: "tool_use", id: "t-1", name: "Read", input: { file_path: "/tmp/dummy.txt" } },
      ]),
      userMessage([{ type: "tool_result", tool_use_id: "t-1", content: "架空の結果" }]),
      assistantMessage([
        {
          type: "tool_use",
          id: "t-2",
          name: SPEAK_TOOL_FULL_NAME,
          input: { text: "できたよ", expression: "proud" },
        },
      ]),
      userMessage("架空の依頼その2"),
      assistantMessage([{ type: "text", text: "架空の本文その2" }]),
    ]

    expect(eventsOf(messages)).toEqual([
      requestEvent("架空の依頼その1"),
      { kind: "utterance", text: "架空の本文その1" },
      {
        kind: "tool-started",
        toolUseId: "t-1",
        name: "Read",
        input: { file_path: "/tmp/dummy.txt" },
        parentToolUseId: undefined,
      },
      { kind: "tool-finished", toolUseId: "t-1", content: "架空の結果", isError: false },
      { kind: "speech", text: "できたよ", expression: "proud" },
      { kind: "speak-drawn" },
      { kind: "turn-finished", outcome: { kind: "completed" } },
      requestEvent("架空の依頼その2"),
      { kind: "utterance", text: "架空の本文その2" },
      { kind: "turn-finished", outcome: { kind: "completed" } },
    ])
  })

  it("差し戻された report の呼び出しは落とし、通った呼び出しだけを残す", () => {
    const messages = [
      userMessage("架空の依頼"),
      assistantMessage([
        {
          type: "tool_use",
          id: "r-1",
          name: REPORT_TOOL_FULL_NAME,
          input: { conclusion: "架空の一" },
        },
      ]),
      userMessage([
        { type: "tool_result", tool_use_id: "r-1", content: "架空の差し戻し", is_error: true },
      ]),
      assistantMessage([
        {
          type: "tool_use",
          id: "r-2",
          name: REPORT_TOOL_FULL_NAME,
          input: { conclusion: "架空の二" },
        },
      ]),
      userMessage([{ type: "tool_result", tool_use_id: "r-2", content: "ok" }]),
    ]

    const reports = eventsOf(messages).filter((event) => event.kind === "report")

    expect(reports).toEqual([
      reportEvent({
        toolUseId: "r-2",
        conclusion: "架空の二",
        argumentChars: { total: 21, fields: { conclusion: 6 } },
      }),
    ])
  })

  it("差し戻しのあと欄を省いて呼び直した report は、省いた欄を差し戻した値で埋めて組み直す", () => {
    const messages = [
      userMessage("架空の依頼"),
      assistantMessage([
        {
          type: "tool_use",
          id: "r-1",
          name: REPORT_TOOL_FULL_NAME,
          input: { conclusion: "架空の一", favor: "架空のお願い" },
        },
      ]),
      userMessage([
        { type: "tool_result", tool_use_id: "r-1", content: "架空の差し戻し", is_error: true },
      ]),
      assistantMessage([
        {
          type: "tool_use",
          id: "r-2",
          name: REPORT_TOOL_FULL_NAME,
          input: { conclusion: "架空の二" },
        },
      ]),
      userMessage([{ type: "tool_result", tool_use_id: "r-2", content: "ok" }]),
    ]

    const reports = eventsOf(messages).filter((event) => event.kind === "report")

    expect(reports).toEqual([
      reportEvent({
        toolUseId: "r-2",
        conclusion: "架空の二",
        favor: "架空のお願い",
        argumentChars: { total: 21, fields: { conclusion: 6 } },
        inheritedFields: ["favor"],
      }),
    ])
  })

  it("finishedInGroup を持たない前の work_plan の呼び出しも、空の finishedInGroup のワークプランとして組み直す", () => {
    const workPlanCall = (id: string, input: unknown) => [
      assistantMessage([{ type: "tool_use", id, name: WORK_PLAN_TOOL_FULL_NAME, input }]),
      userMessage([{ type: "tool_result", tool_use_id: id, content: "ok" }]),
    ]
    const phases = ["架空の段A", "架空の段B"]
    const messages = [
      userMessage("架空の依頼"),
      ...workPlanCall("w-1", { phases, current: 0 }),
      ...workPlanCall("w-2", { phases, current: 1, phaseSummary: "架空のまとめ。" }),
    ]

    const plans = eventsOf(messages).filter((event) => event.kind === "work-plan")

    expect(plans).toEqual([
      {
        kind: "work-plan",
        phases,
        current: 0,
        finishedInGroup: [],
        phaseSummary: "",
        delegatedRange: { kind: "none" },
        skippedPhases: [],
        awaitingSummary: { kind: "none" },
      },
      {
        kind: "work-plan",
        phases,
        current: 1,
        finishedInGroup: [],
        phaseSummary: "架空のまとめ。",
        delegatedRange: { kind: "none" },
        skippedPhases: [],
        awaitingSummary: { kind: "none" },
      },
    ])
  })

  it("差し戻された speak の呼び出しは落とし、通ったセリフだけを結果の直前に残す", () => {
    const speakCall = (id: string, text: string): unknown =>
      assistantMessage([
        {
          type: "tool_use",
          id,
          name: SPEAK_TOOL_FULL_NAME,
          input: { text, expression: "default" },
        },
      ])
    const messages = [
      userMessage("架空の依頼"),
      speakCall("s-1", "架空の通ったセリフ"),
      userMessage([{ type: "tool_result", tool_use_id: "s-1", content: "ok" }]),
      speakCall("s-2", "架空の差し戻されたセリフ"),
      userMessage([
        { type: "tool_result", tool_use_id: "s-2", content: "架空の差し戻し", is_error: true },
      ]),
    ]

    expect(eventsOf(messages)).toEqual([
      requestEvent(),
      { kind: "speech", text: "架空の通ったセリフ", expression: "default" },
      { kind: "speak-drawn" },
      { kind: "tool-finished", toolUseId: "s-1", content: "ok", isError: false },
      { kind: "tool-finished", toolUseId: "s-2", content: "架空の差し戻し", isError: true },
      { kind: "turn-finished", outcome: { kind: "completed" } },
    ])
  })

  it("通った report の closing だけを、report の後ろのセリフとして組み直す", () => {
    const messages = [
      userMessage("架空の依頼"),
      assistantMessage([
        {
          type: "tool_use",
          id: "r-1",
          name: REPORT_TOOL_FULL_NAME,
          input: {
            conclusion: "架空の一",
            closing: { text: "架空の出ない締め", expression: "default" },
          },
        },
      ]),
      userMessage([
        { type: "tool_result", tool_use_id: "r-1", content: "架空の差し戻し", is_error: true },
      ]),
      assistantMessage([
        {
          type: "tool_use",
          id: "r-2",
          name: REPORT_TOOL_FULL_NAME,
          input: { conclusion: "架空の二", closing: { text: "架空の締め", expression: "proud" } },
        },
      ]),
      userMessage([{ type: "tool_result", tool_use_id: "r-2", content: "ok" }]),
    ]

    const shown = eventsOf(messages)
      .filter((event) => event.kind === "report" || event.kind === "speech")
      .map((event) => (event.kind === "report" ? event.conclusion : event.text))

    expect(shown).toEqual(["架空の二", "架空の締め"])
  })

  it("組み直した report も、動いているときと同じく整形してから描く", () => {
    const messages = [
      userMessage("架空の依頼"),
      assistantMessage([
        {
          type: "tool_use",
          id: "r-1",
          name: REPORT_TOOL_FULL_NAME,
          input: { conclusion: "架空の結論。", body: "架空の結論。\n\n架空の根拠。\n\n以上です。" },
        },
      ]),
      userMessage([{ type: "tool_result", tool_use_id: "r-1", content: "ok" }]),
    ]
    const state = eventsOf(messages).reduce(
      (current, event) => applySessionEvent(current, event, 0),
      INITIAL_SESSION_STATE,
    )

    expect(mainViewEntries(state).filter((entry) => entry.kind === "report")).toEqual([
      {
        kind: "report",
        regions: {
          kind: "regions",
          sections: [{ id: 0, heading: "" }],
          a2ui: expect.objectContaining({ kind: "surface" }),
        },
        conclusion: "架空の結論。",
        task: { kind: "none" },
        changeSummary: { kind: "none" },
        toolUseId: "r-1",
      },
    ])
  })

  it("部品の一覧で呼んだ report も、同じ中身の節で呼んだときと同じ欄に組み直し、面で描く値を持つ", () => {
    const restoredRegions = (input: Readonly<Record<string, unknown>>) => {
      const messages = [
        userMessage("架空の依頼"),
        assistantMessage([{ type: "tool_use", id: "r-1", name: REPORT_TOOL_FULL_NAME, input }]),
        userMessage([{ type: "tool_result", tool_use_id: "r-1", content: "ok" }]),
      ]
      const state = eventsOf(messages).reduce(
        (current, event) => applySessionEvent(current, event, 0),
        INITIAL_SESSION_STATE,
      )
      const entry = mainViewEntries(state).find((candidate) => candidate.kind === "report")
      if (entry?.kind !== "report") throw new Error("レポートの記録が無い")
      return entry.regions
    }
    const fromComponents = restoredRegions({
      components: [
        { id: "root", component: "Report", conclusion: ["架空の結論。"], children: ["s1"] },
        { id: "s1", component: "Section", heading: "架空の節", children: ["p1"] },
        { id: "p1", component: "Paragraph", text: "架空の根拠。" },
      ],
    })
    const fromSections = restoredRegions({
      conclusion: ["架空の結論。"],
      sections: [{ heading: "架空の節", blocks: [{ kind: "text", text: "架空の根拠。" }] }],
    })

    expect({ ...fromComponents, a2ui: fromSections.a2ui }).toEqual(fromSections)
    expect(fromComponents.a2ui).toMatchObject({
      kind: "surface",
      sections: { s1: { regionId: 0, heading: "## 架空の節" } },
      markdownLeaves: {},
      leafValues: { p1: expect.objectContaining({ mergedIntoPrevious: false }) },
    })
  })

  it("依頼が1つも無い列にはターンの境目を足さない", () => {
    const events = eventsOf([assistantMessage([{ type: "text", text: "架空の本文" }])])

    expect(events).toEqual([{ kind: "utterance", text: "架空の本文" }])
  })

  it("依頼より前の本文のあとの最初の依頼の手前には境目を足さず、2件目の依頼の手前と末尾にだけ足す", () => {
    const messages = [
      assistantMessage([{ type: "text", text: "架空の前置き" }]),
      userMessage("架空の依頼その1"),
      assistantMessage([{ type: "text", text: "架空の本文その1" }]),
      userMessage("架空の依頼その2"),
    ]

    expect(eventsOf(messages)).toEqual([
      { kind: "utterance", text: "架空の前置き" },
      requestEvent("架空の依頼その1"),
      { kind: "utterance", text: "架空の本文その1" },
      { kind: "turn-finished", outcome: { kind: "completed" } },
      requestEvent("架空の依頼その2"),
      { kind: "turn-finished", outcome: { kind: "completed" } },
    ])
  })

  it("空の列・壊れた要素が混じった列でも落ちず、読めたものだけを返す", () => {
    expect(toRestoredEvents([], EXPRESSIONS, EMPTY_INPUT_LEDGER)).toEqual([])
    expect(toRestoredEvents(undefined, EXPRESSIONS, EMPTY_INPUT_LEDGER)).toEqual([])

    const messages = [
      null,
      { type: "user" },
      userMessage([{ type: "text", text: "   " }]),
      userMessage([{ type: "text", text: "架空の依頼" }]),
      { type: "知らない種別" },
      assistantMessage([{ type: "text", text: "架空の本文" }]),
    ]

    expect(eventsOf(messages)).toEqual([
      requestEvent(),
      { kind: "utterance", text: "架空の本文" },
      { kind: "turn-finished", outcome: { kind: "completed" } },
    ])
  })

  // 圧縮（`/compact`）が起きると transcript の鎖が切れ、`includeSystemMessages: true` で読んだ
  // 並びは区切りの行から始まる（`readRestoredEvents`。
  // 実測）。起こし直したあとに区切りがログのいちばん上に来ることをここで示す。
  it("圧縮の区切り（system の compact_boundary）が並びの先頭に来る", () => {
    const messages = [
      { type: "system", subtype: "compact_boundary", compact_metadata: { trigger: "auto" } },
      userMessage([{ type: "text", text: "架空の依頼" }]),
      assistantMessage([{ type: "text", text: "架空の本文" }]),
    ]

    expect(eventsOf(messages)).toEqual([
      { kind: "compact-boundary" },
      requestEvent(),
      { kind: "utterance", text: "架空の本文" },
      { kind: "turn-finished", outcome: { kind: "completed" } },
    ])
  })
})
