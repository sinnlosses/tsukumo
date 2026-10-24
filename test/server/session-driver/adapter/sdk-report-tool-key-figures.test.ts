// `report` の `keyFigures`（結論の直下の数）。個数の検査・イベントへの変換・差し戻しのあとの引き継ぎを、モデルが見るのと同じ口で確かめる。

import { describe, expect, it } from "vitest"

import { createCallReview } from "../../../../src/server/session-driver/core/call-review.ts"
import { toSessionEvents } from "../../../../src/server/session-driver/core/sdk-message.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"
import { callTool } from "../../../fixture/mcp-server.ts"
import { assistantMessage, REPORT_TOOL_FULL_NAME } from "../../../fixture/sdk-message.ts"
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

type ReportCalled = Extract<SessionEvent, { kind: "report" }>

const COMPLETE = {
  conclusion: ["架空の結論"],
  figure: FIGURE,
  closing: CLOSING,
  sessionSummary: SUMMARY,
  sessionRemaining: REMAINING,
  waitingLine: WAITING_LINE,
}

function figures(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    value: String(index + 1),
    label: "架空の数",
  }))
}

describe("report の keyFigures の個数", () => {
  it.each([
    { name: "json-schema", mode: WORK_MODE },
    { name: "short-type", mode: SHORT_TYPE_WORK_MODE },
  ])("3〜4 個だけ受け付け、2 個以下・5 個以上は形の検査で落とす: $name", async ({ mode }) => {
    const outcomes = await Promise.all(
      [2, 3, 4, 5].map(async (count) => {
        const reply = await callTool(workServer([], [], createCallReview(), [], mode), "report", {
          ...COMPLETE,
          keyFigures: figures(count),
        })
        return reply.isError
      }),
    )

    expect(outcomes).toEqual([true, false, false, true])
  })
})

describe("report の keyFigures のイベントへの変換と引き継ぎ", () => {
  function convert(input: Readonly<Record<string, unknown>>) {
    const [event] = toSessionEvents(
      assistantMessage([{ type: "tool_use", id: "toolu_k1", name: REPORT_TOOL_FULL_NAME, input }]),
      ["default"],
    )
    return event?.kind === "report" ? event : undefined
  }

  it("省いた呼び出しは空の配列、渡した呼び出しは項目の全欄を残し、崩れたものは空に畳む", () => {
    const item = {
      before: "10",
      value: "20",
      total: "30",
      label: "架空の数",
      series: [1, 2, 3],
      better: "up",
    }

    expect(convert({ conclusion: "架空の結論。" })?.keyFigures).toEqual([])
    expect(
      convert({ conclusion: "架空の結論。", keyFigures: [item, item, item] })?.keyFigures,
    ).toEqual([item, item, item])
    expect(convert({ conclusion: "架空の結論。", keyFigures: [item] })?.keyFigures).toEqual([])
  })

  it("keyFigures を省いた出し直しは、直前に差し戻した呼び出しの keyFigures を引き継ぐ", async () => {
    const review = createCallReview()
    const call = async (id: string, input: Readonly<Record<string, unknown>>) => {
      const converted = toSessionEvents(
        assistantMessage([{ type: "tool_use", id, name: REPORT_TOOL_FULL_NAME, input }]),
        ["default"],
      )
      const before = converted.flatMap((event) => review.pass(event))
      const reply = await callTool(workServer([], [], review), "report", input)
      const after = review.pass({
        kind: "tool-finished",
        toolUseId: id,
        content: reply.text,
        isError: reply.isError,
      })
      return [...before, ...after].find((event): event is ReportCalled => event.kind === "report")
    }

    // conclusion が3要素以上だと差し戻される
    await call("toolu_r1", {
      ...COMPLETE,
      conclusion: ["架空の一文目。", "架空の二文目。", "架空の三文目。"],
      keyFigures: figures(3),
    })
    const resent = await call("toolu_r2", { conclusion: ["架空の直した結論"] })

    expect(resent?.keyFigures.map((figure) => figure.value)).toEqual(["1", "2", "3"])
    expect(resent?.inheritedFields).toContain("keyFigures")
  })
})
