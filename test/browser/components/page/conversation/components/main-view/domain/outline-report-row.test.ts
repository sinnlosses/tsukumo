import { describe, expect, it } from "vitest"

import { outlineReportOf } from "../../../../../../../../src/browser/components/page/conversation/components/main-view/domain/outline-report-row.ts"
import type { ReportTask } from "../../../../../../../../src/shared/report/report-task.ts"
import type {
  MainViewStep,
  MainViewTurn,
} from "../../../../../../../../src/shared/session/main-view-shape.ts"

function textStep(id: number, firstLine: string, task: ReportTask, final: boolean): MainViewStep {
  return {
    id,
    body: {
      kind: "text",
      report: {
        kind: "regions",
        head: "",
        finalHead: "",
        sections: [],
        retrospective: "",
        favor: { id: "favor-toolu_fictional", markdown: "" },
        a2ui: { kind: "none" },
      },
      firstLine,
      task,
      finishedPhase: { kind: "none" },
      changeSummary: { kind: "none" },
    },
    interim: !final,
    superseded: false,
    final,
    actions: [],
    asides: [],
  }
}

function turnOf(steps: readonly MainViewStep[]): MainViewTurn {
  return {
    id: 0,
    request: undefined,
    steps,
    hasInterimReport: steps.some((step) => step.interim),
    droppedCount: 0,
    failure: { kind: "none" },
  }
}

const NO_TASK = { kind: "none" } as const satisfies ReportTask
const TASK = {
  kind: "task",
  id: "fictional-task",
  name: "架空のタスクの名前",
  outcome: "finished",
  genre: "work",
} as const satisfies ReportTask

describe("outlineReportOf", () => {
  it("最終レポートがあれば、中間より最終を選んでラベルを final にする", () => {
    const interim = textStep(0, "中間の先頭行", NO_TASK, false)
    const closed = textStep(1, "最終の先頭行", NO_TASK, true)

    expect(outlineReportOf(turnOf([interim, closed]))).toEqual({
      kind: "report",
      label: "final",
      title: "最終の先頭行",
    })
  })

  it("最終が無ければ最後の本文を選んでラベルを interim にする", () => {
    const first = textStep(0, "一つ目", NO_TASK, false)
    const last = textStep(1, "二つ目", NO_TASK, false)

    expect(outlineReportOf(turnOf([first, last]))).toEqual({
      kind: "report",
      label: "interim",
      title: "二つ目",
    })
  })

  it("タスクのレポートでは、題が先頭行ではなくタスクの名前になる", () => {
    const closed = textStep(0, "先頭行", TASK, true)

    expect(outlineReportOf(turnOf([closed]))).toEqual({
      kind: "report",
      label: "final",
      title: "架空のタスクの名前",
    })
  })

  it("先頭行の空白の並びは1つに詰める", () => {
    expect(outlineReportOf(turnOf([textStep(0, "  あ \t い  ", NO_TASK, true)]))).toMatchObject({
      title: "あ い",
    })
  })

  it("本文が無い・題にできる字が無いやり取りは行を出さない", () => {
    expect(outlineReportOf(turnOf([]))).toEqual({ kind: "none" })
    expect(outlineReportOf(turnOf([textStep(0, "  ", NO_TASK, true)]))).toEqual({ kind: "none" })
  })
})
