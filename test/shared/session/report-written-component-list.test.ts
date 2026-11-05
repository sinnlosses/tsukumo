import { describe, expect, it } from "vitest"

import { reportUsageEntryOf } from "../../../src/server/report/core/usage/report-usage.ts"
import { reportEvents } from "../../../src/server/session-driver/core/message/sdk-report-message.ts"
import { applyRestoredEvents } from "../../../src/server/session/core/event/restored-event.ts"
import { mainViewEntries } from "../../../src/shared/session/main-view-entry.ts"
import { reportDrawnPieces } from "../../../src/shared/session/report-drawn-markdown.ts"
import type { ReportCalledEvent } from "../../../src/shared/session/session-event.ts"
import { applySessionEvent } from "../../../src/shared/session/session-fold.ts"
import { INITIAL_SESSION_STATE } from "../../../src/shared/session/session-state.ts"
import { checkedToolUseId } from "../../fixture/tool-use-id.ts"

const WRITTEN_TEXT = { call: "format", args: { template: "合計 ${n * 2} 件" } }

const COMPONENTS = [
  { id: "root", component: "Report", conclusion: ["架空の結論。"], children: ["sec"] },
  { id: "sec", component: "Section", heading: "架空の節", children: ["p", "sl"] },
  { id: "p", component: "Paragraph", text: WRITTEN_TEXT },
  {
    id: "sl",
    component: "ParameterSlider",
    name: "n",
    label: "件数",
    min: 0,
    max: 10,
    step: 1,
    initial: 3,
  },
]

function reportOf(): ReportCalledEvent {
  const [event] = reportEvents(checkedToolUseId("toolu_fictional"), { components: COMPONENTS }, [])
  if (event?.kind !== "report") throw new Error("report にならなかった")
  return event
}

function recordOf(event: ReportCalledEvent) {
  const record = applySessionEvent(INITIAL_SESSION_STATE, event, 0).records.find(
    (candidate) => candidate.kind === "report",
  )
  if (record?.kind !== "report") throw new Error("レポートの記録が無い")
  return record
}

describe("transcript からの復元", () => {
  it("復元した記録の components にも式が書いたままで残る", () => {
    const state = applyRestoredEvents(
      INITIAL_SESSION_STATE,
      [{ event: reportOf(), time: { kind: "known", at: 1000 } }],
      2000,
    )
    const record = state.records.find((candidate) => candidate.kind === "report")
    if (record?.kind !== "report") throw new Error("レポートの記録が無い")

    expect(record.components.find((part) => part.id === "p")).toMatchObject({ text: WRITTEN_TEXT })
  })
})

describe("書き手が書いたままの一覧と、初期値で評価した静的な一覧", () => {
  it("イベントと記録には式が書いたままで残る", () => {
    const event = reportOf()

    expect(event.components.find((part) => part.id === "p")).toMatchObject({ text: WRITTEN_TEXT })
    expect(recordOf(event).components).toEqual(event.components)
  })

  it("描く節の値と Markdown 化は初期値の値で出て、つまみは label: 初期値 の段落になる", () => {
    const { drawn } = reportDrawnPieces(recordOf(reportOf()))
    const texts = JSON.stringify(drawn.sections)

    expect(texts).toContain("合計 6 件")
    expect(texts).toContain("件数: 3")
    expect(texts).not.toContain("call")
  })

  it("画面の面の部品は静的な一覧で、式もつまみも持たない", () => {
    const entry = mainViewEntries(applySessionEvent(INITIAL_SESSION_STATE, reportOf(), 0)).find(
      (candidate) => candidate.kind === "report",
    )
    if (entry?.kind !== "report" || entry.regions.a2ui.kind !== "surface") {
      throw new Error("面の値が無い")
    }

    expect(entry.regions.a2ui.components.map((part) => part.component)).not.toContain(
      "ParameterSlider",
    )
    expect(JSON.stringify(entry.regions.a2ui.components)).not.toContain('"call"')
  })

  it("使われ方の記録は静的な一覧で分類し、つまみと式を持つ props の数を数える", () => {
    const entry = reportUsageEntryOf(reportOf(), "claude-session-1", 1, false)

    expect(entry.blockKinds).toEqual(["text"])
    expect(entry.componentNames).toContain("ParameterSlider")
    expect([entry.parameterCount, entry.expressionPropCount]).toEqual([1, 1])
  })
})
