// 判定・次の手・前回との対応・出どころ・案内の付箋を書いた疑似セッションの場面が、本番と同じ読み替え（`reportEvents`）を通って欄どおりに出ること。

import { describe, expect, it } from "vitest"

import { reportEvents } from "../../../../../src/server/session-driver/core/message/sdk-report-message.ts"
import type { ReportCalledEvent } from "../../../../../src/shared/session/session-event.ts"
import { bundledFakeSession } from "../../../../fixture/bundled-fake-session.ts"
import { EXPRESSIONS } from "../../../../fixture/sdk-assistant-message.ts"

function reportsOf(name: string): readonly ReportCalledEvent[] {
  const scene = bundledFakeSession().turns.find((turn) => turn.name === name)
  if (scene === undefined) {
    throw new Error(`場面 ${name} が無い`)
  }
  return scene.steps.flatMap(({ event }) =>
    event.kind === "report"
      ? reportEvents(event.toolUseId, event, EXPRESSIONS).flatMap((read) =>
          read.kind === "report" ? [read] : [],
        )
      : [],
  )
}

describe("疑似セッションの判定と次の手の場面", () => {
  it("progress-delivered は、済んだ判定・置いた前提・本文の番号と出どころ・案内の付箋を持つ", () => {
    const [report] = reportsOf("progress-delivered")

    expect(report).toMatchObject({
      verdict: "done",
      verdictWritten: true,
      next: { kind: "next", owner: "none" },
      assumptions: [expect.any(String)],
      sources: [{ mark: 1, place: "src/fictional/list.ts:12" }],
      guideNotes: [{ target: "checks" }],
      workPlanClosing: "finished",
    })
    expect(report?.conclusion).toContain("{{src: 1}}")
  })

  it("progress-second は、1回目は前回との対応を持たず、2回目だけが持つ", () => {
    const [first, second] = reportsOf("progress-second")

    expect(first).toMatchObject({ verdict: "partial", previous: { kind: "none" } })
    expect(second).toMatchObject({
      verdict: "done",
      previous: {
        kind: "previous",
        resolved: [expect.any(String)],
        added: [expect.any(String)],
        remaining: [],
      },
    })
  })

  it("progress-ask は、利用者の番で、選べる答えを2つ持つ", () => {
    const [report] = reportsOf("progress-ask")

    expect(report).toMatchObject({
      verdict: "yours",
      next: { kind: "next", owner: "you", choices: ["消す", "残す"] },
      workPlanClosing: "stopped",
    })
  })

  it("progress-short は、済んだ判定と結論1文だけで、本文の節を持たない", () => {
    const [report] = reportsOf("progress-short")

    expect(report).toMatchObject({ verdict: "done", next: { kind: "none" }, sources: [] })
    expect(report?.components.filter((part) => part.component === "Section")).toEqual([])
  })

  it("progress-failed は、失敗で止まった判定と ng の行と、書き手が続ける次の手を持つ", () => {
    const [report] = reportsOf("progress-failed")

    expect(report).toMatchObject({
      verdict: "failed",
      next: { kind: "next", owner: "writer" },
      checks: [{ status: "ng" }],
      workPlanClosing: "stopped",
    })
  })

  it("progress-stopped は、止めた判定と書き手が続ける次の手を持つ", () => {
    const [report] = reportsOf("progress-stopped")

    expect(report).toMatchObject({
      verdict: "stopped",
      next: { kind: "next", owner: "writer" },
      guideNotes: [],
      previous: { kind: "none" },
    })
  })
})
