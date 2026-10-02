import { describe, expect, it } from "vitest"

import { toSessionDigest } from "../../../../src/server/session-driver/core/session-digest.ts"
import { toRestoredEvents } from "../../../../src/server/session-driver/core/session-restore.ts"
import type { Expression } from "../../../../src/shared/character-pack/expression.ts"
import { MAX_SESSION_SUMMARY_LENGTH } from "../../../../src/shared/session/session-digest.ts"
import {
  assistantMessage,
  REPORT_TOOL_FULL_NAME,
  SPEAK_TOOL_FULL_NAME,
  userMessage,
} from "../../../fixture/sdk-message.ts"

const EXPRESSIONS: readonly Expression[] = ["default", "proud"]

function reportCall(id: string, input: Readonly<Record<string, unknown>>): unknown {
  return assistantMessage([{ type: "tool_use", id, name: REPORT_TOOL_FULL_NAME, input }])
}

function toolResult(id: string, isError: boolean): unknown {
  return userMessage([
    {
      type: "tool_result",
      tool_use_id: id,
      content: isError ? "架空の差し戻し" : "ok",
      is_error: isError,
    },
  ])
}

describe("toSessionDigest", () => {
  it("依頼の数・最後に通った report の要約・最後のセリフを拾う", () => {
    const messages = [
      userMessage("架空の依頼その1"),
      reportCall("r-1", {
        conclusion: "架空の一",
        sessionSummary: "架空の古い要約",
        closing: { text: "架空の締めその1", expression: "default" },
      }),
      toolResult("r-1", false),
      userMessage("架空の依頼その2"),
      assistantMessage([
        {
          type: "tool_use",
          id: "t-1",
          name: SPEAK_TOOL_FULL_NAME,
          input: { text: "架空の途中のセリフ", expression: "default" },
        },
      ]),
      toolResult("t-1", false),
      reportCall("r-2", {
        conclusion: "架空の二",
        sessionSummary: "架空の新しい要約。\n\n残り：架空の残り。",
        closing: { text: "架空の締めその2", expression: "proud" },
      }),
      toolResult("r-2", false),
    ]

    expect(toSessionDigest(messages, EXPRESSIONS)).toEqual({
      kind: "known",
      requestCount: 2,
      summary: "架空の新しい要約。\n\n残り：架空の残り。",
      lastLine: "架空の締めその2",
    })
  })

  it("差し戻された report の要約は拾わず、要約の無い report はその前の要約を残す", () => {
    const messages = [
      userMessage("架空の依頼"),
      reportCall("r-1", { conclusion: "架空の一", sessionSummary: "架空の通った要約" }),
      toolResult("r-1", false),
      userMessage("架空の依頼その2"),
      reportCall("r-2", { conclusion: "架空の二", sessionSummary: "架空の差し戻された要約" }),
      toolResult("r-2", true),
      reportCall("r-3", { conclusion: "架空の三" }),
      toolResult("r-3", false),
    ]

    expect(toSessionDigest(messages, EXPRESSIONS)).toMatchObject({
      kind: "known",
      summary: "架空の通った要約",
    })
  })

  it("差し戻された speak のセリフは最後のセリフに拾わない", () => {
    const messages = [
      userMessage("架空の依頼"),
      speakCall("s-1", "架空の通ったセリフ"),
      toolResult("s-1", false),
      speakCall("s-2", "架空の差し戻されたセリフ"),
      toolResult("s-2", true),
    ]

    expect(toSessionDigest(messages, EXPRESSIONS)).toMatchObject({
      lastLine: "架空の通ったセリフ",
    })
  })

  it("要約は上限で切って … を足し、要約もセリフも無ければ undefined", () => {
    const long = "架".repeat(MAX_SESSION_SUMMARY_LENGTH + 10)
    const withLong = [
      userMessage("架空の依頼"),
      reportCall("r-1", { conclusion: "架空の一", sessionSummary: long }),
      toolResult("r-1", false),
    ]

    expect(toSessionDigest(withLong, EXPRESSIONS)).toMatchObject({
      summary: `${"架".repeat(MAX_SESSION_SUMMARY_LENGTH)}…`,
    })
    expect(toSessionDigest([userMessage("架空の依頼")], EXPRESSIONS)).toEqual({
      kind: "known",
      requestCount: 1,
      summary: undefined,
      lastLine: undefined,
    })
  })

  it("列でなければ読めなかったものとして扱う", () => {
    expect(toSessionDigest(undefined, EXPRESSIONS)).toEqual({ kind: "unavailable" })
  })
})

// 復元（`toRestoredEvents`）の結果を数える従来の組み方。1パスの畳み方と食い違わないことを守る。
function digestViaRestoredEvents(messages: readonly unknown[]): unknown {
  const events = toRestoredEvents(messages, EXPRESSIONS)
  const summary = events
    .flatMap((event) =>
      event.kind === "report" && event.sessionSummary !== undefined ? [event.sessionSummary] : [],
    )
    .at(-1)
  return {
    kind: "known",
    requestCount: events.filter((event) => event.kind === "request").length,
    summary:
      summary === undefined
        ? undefined
        : summary.trim().slice(0, MAX_SESSION_SUMMARY_LENGTH) +
          (summary.trim().length > MAX_SESSION_SUMMARY_LENGTH ? "…" : ""),
    lastLine: events.flatMap((event) => (event.kind === "speech" ? [event.text] : [])).at(-1),
  }
}

function speakCall(id: string, text: string): unknown {
  return assistantMessage([
    {
      type: "tool_use",
      id,
      name: SPEAK_TOOL_FULL_NAME,
      input: { text, expression: "default" },
    },
  ])
}

const withClosing = (n: string): Readonly<Record<string, unknown>> => ({
  conclusion: `架空の結論${n}`,
  sessionSummary: `架空の要約${n}`,
  closing: { text: `架空の締め${n}`, expression: "proud" },
})

describe("toSessionDigest と toRestoredEvents の一致", () => {
  const cases: Readonly<Record<string, readonly unknown[]>> = {
    "通った report と差し戻された report が混ざる": [
      userMessage("架空の依頼1"),
      reportCall("r-1", withClosing("1")),
      toolResult("r-1", false),
      userMessage("架空の依頼2"),
      reportCall("r-2", withClosing("2")),
      toolResult("r-2", true),
    ],
    "結果の無い report で終わる": [userMessage("架空の依頼"), reportCall("r-1", withClosing("1"))],
    "結果待ちの report のまま次の依頼が来る": [
      userMessage("架空の依頼1"),
      reportCall("r-1", withClosing("1")),
      userMessage("架空の依頼2"),
      speakCall("s-1", "架空のセリフ"),
    ],
    "要約の無い report と要約の古い report": [
      userMessage("架空の依頼"),
      reportCall("r-1", withClosing("1")),
      toolResult("r-1", false),
      reportCall("r-2", { conclusion: "架空の結論2" }),
      toolResult("r-2", false),
    ],
    "speak だけ": [userMessage("架空の依頼"), speakCall("s-1", "架空のセリフ")],
    "通った speak と差し戻された speak が混ざる": [
      userMessage("架空の依頼"),
      speakCall("s-1", "架空の通ったセリフ"),
      toolResult("s-1", false),
      speakCall("s-2", "架空の差し戻されたセリフ"),
      toolResult("s-2", true),
    ],
    "依頼より前に report が来る": [
      reportCall("r-1", withClosing("1")),
      toolResult("r-1", false),
      userMessage("架空の依頼"),
    ],
    空: [],
    壊れた要素を含む: [
      null,
      { type: "unknown-type" },
      userMessage("架空の依頼"),
      "壊れた要素",
      speakCall("s-1", "架空のセリフ"),
    ],
    "同じ toolUseId が2つある": [
      userMessage("架空の依頼"),
      reportCall("r-1", withClosing("1")),
      reportCall("r-1", withClosing("2")),
      toolResult("r-1", false),
      toolResult("r-1", true),
    ],
  }

  it.each(Object.entries(cases))("%s", (_name, messages) => {
    expect(toSessionDigest(messages, EXPRESSIONS)).toEqual(digestViaRestoredEvents(messages))
  })
})
