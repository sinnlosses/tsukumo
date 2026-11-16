import { describe, expect, it } from "vitest"

import {
  foldSummaryOf,
  streamItemsOf,
} from "../../../../../../../../src/browser/components/page/conversation/components/main-view/domain/stream-item-list.ts"
import { conversationStreamRows } from "../../../../../../../../src/browser/domain/main-view/conversation-stream.ts"
import type { SessionRecord } from "../../../../../../../../src/shared/session/session-record.ts"
import { splitIntoTurns } from "../../../../../../../../src/shared/session/turn.ts"
import {
  asideRecord,
  reportRecord,
  requestRecord,
  speechRecord,
  workPlanRecord,
} from "../../../../../../../fixture/session-record.ts"
import { step, turn, turnBodyText } from "../../../../../../../fixture/turn.ts"

function rowsOf(records: readonly SessionRecord[]) {
  const [first] = splitIntoTurns(records)
  if (first === undefined) {
    throw new Error("やり取りが無い")
  }
  return conversationStreamRows(first)
}

function reportWith(toolUseId: string, conclusion: string): SessionRecord {
  const base = reportRecord(conclusion)
  if (base.kind !== "report") {
    throw new Error("report の記録ではない")
  }
  return { ...base, toolUseId }
}

const reportStep = (id: number, toolUseId: string, mark: "interim-kept" | "final") =>
  step({
    id,
    body: turnBodyText(`本文${String(id)}`),
    origin: { kind: "tool-report", toolUseId },
    mark,
  })

describe("streamItemsOf", () => {
  it("投稿とセリフと本文を、記録の位置の順に並べる", () => {
    const items = streamItemsOf(
      rowsOf([
        requestRecord(),
        speechRecord({ text: "一言目" }),
        asideRecord(),
        speechRecord({ text: "答え", answersAside: true }),
        reportRecord("本文"),
      ]),
      turn([reportStep(0, "fictional-report", "final")]),
    )

    expect(items.map((item) => item.kind)).toEqual(["post", "say", "post", "say", "body"])
  })

  it("最終レポートの前の段・質問・中間の本文は、最終レポートの上の作業の経過1つに畳む", () => {
    const items = streamItemsOf(
      rowsOf([
        requestRecord(),
        workPlanRecord(),
        speechRecord(),
        reportWith("interim", "中間"),
        reportWith("last", "最終"),
      ]),
      turn([reportStep(0, "interim", "interim-kept"), reportStep(1, "last", "final")]),
    )

    expect(items.map((item) => item.kind)).toEqual(["post", "say", "fold", "body"])
    const fold = items[2]
    expect(fold?.kind === "fold" && fold.items.map((item) => item.kind)).toEqual(["plan", "body"])
    expect(fold?.kind === "fold" && foldSummaryOf(fold.items)).toBe("作業の経過 1 件")
  })

  it("最終レポートが無いあいだは畳まず、突き合わせの外の本文は末尾に並ぶ", () => {
    const items = streamItemsOf(
      rowsOf([requestRecord(), workPlanRecord(), speechRecord()]),
      turn([step({ id: 0, body: turnBodyText("書きかけ"), mark: "plain" })]),
    )

    expect(items.map((item) => item.kind)).toEqual(["post", "say", "body"])
  })

  it("段のまとめは、その段を済ませた work_plan の記録の位置に出し、段を進めない呼び直しは取らない", () => {
    const phases = ["架空の段A", "架空の段B", "架空の段C", "架空の段D"]
    const phaseStep = (id: number) =>
      step({
        id,
        body: {
          kind: "text",
          report: { kind: "markdown", markdown: `まとめ${String(id)}` },
          firstLine: `まとめ${String(id)}`,
          task: { kind: "none" },
          finishedPhase: {
            kind: "phase",
            label: `段${String(id)}`,
            duration: { kind: "unknown" },
            skipped: false,
          },
          changeSummary: { kind: "none" },
        },
      })
    const items = streamItemsOf(
      rowsOf([
        requestRecord(),
        workPlanRecord({ phases, current: 0 }),
        speechRecord({ text: "段Aのセリフ" }),
        workPlanRecord({ phases, current: 1, phaseSummary: "まとめ1" }),
        speechRecord({ text: "段Bのセリフ" }),
        workPlanRecord({ phases, current: 1 }),
        speechRecord({ text: "段Bの続き" }),
        workPlanRecord({ phases, current: 2, phaseSummary: "まとめ2" }),
        speechRecord({ text: "段Cのセリフ" }),
      ]),
      turn([phaseStep(1), phaseStep(2)]),
    )

    expect(
      items.map((item) =>
        item.kind === "body"
          ? `body${String(item.step.id)}`
          : item.kind === "say"
            ? "say"
            : item.kind,
      ),
    ).toEqual(["post", "say", "body1", "say", "say", "body2", "say"])
  })

  it("失敗したやり取りは、最初の本文の手前に失敗の表示を置く", () => {
    const failed = {
      ...turn([reportStep(0, "fictional-report", "final")]),
      failure: { kind: "failed", failure: { kind: "max-turns" } },
    } as const
    const items = streamItemsOf(
      rowsOf([requestRecord(), speechRecord(), reportRecord("本文")]),
      failed,
    )

    expect(items.map((item) => item.kind)).toEqual(["post", "say", "failure", "body"])
  })
})
