import { describe, expect, it } from "vitest"

import type { ReportTask, ReportTaskOutcome } from "../../../src/shared/report/report-task.ts"
import type { MainViewStep, MainViewTurn } from "../../../src/shared/session/main-view.ts"
import { turnResultsOf } from "../../../src/shared/session/turn-result.ts"

// フィクスチャはすべて手で書いた架空の依頼とレポート（実物の会話は使わない）。

function reportStep(id: number, task: ReportTask): MainViewStep {
  return {
    id,
    body: {
      kind: "text",
      report: "架空のレポート",
      firstLine: "架空のレポート",
      task,
      finishedPhase: { kind: "none" },
    },
    interim: false,
    superseded: false,
    final: true,
    actions: [],
  }
}

function emptyStep(id: number): MainViewStep {
  return {
    id,
    body: { kind: "none" },
    interim: false,
    superseded: false,
    final: false,
    actions: [],
  }
}

function turn(id: number, overrides: Partial<MainViewTurn>): MainViewTurn {
  return {
    id,
    request: { text: "架空の依頼", images: [] },
    steps: [],
    hasInterimReport: false,
    droppedCount: 0,
    failure: { kind: "none" },
    ...overrides,
  }
}

function taskOf(outcome: ReportTaskOutcome): ReportTask {
  return { kind: "task", id: "架空-1", name: "架空の作業", outcome }
}

const DONE = turn(1, { steps: [reportStep(0, { kind: "none" })] })

describe("turnResultsOf（やり取りごとの結果）", () => {
  it("閉じたやり取りを、済んだ・答え待ち・止めた・失敗・レポートの無いやり取りに分ける", () => {
    const turns = [
      DONE,
      turn(2, { steps: [reportStep(0, taskOf("finished"))] }),
      turn(3, { steps: [reportStep(0, taskOf("awaiting-answer"))] }),
      turn(4, { steps: [reportStep(0, taskOf("stopped"))] }),
      turn(5, {
        steps: [reportStep(0, { kind: "none" })],
        failure: { kind: "failed", failure: { kind: "execution-error" } },
      }),
      turn(6, { steps: [emptyStep(0)] }),
    ]
    expect(turnResultsOf(turns, "deliver")).toEqual([
      "done",
      "done",
      "awaiting-answer",
      "stopped",
      "failed",
      "no-report",
    ])
  })

  it("最後の本文の終わり方で決める（前の中間レポートの終わり方は見ない）", () => {
    const turns = [
      turn(1, {
        steps: [
          reportStep(0, taskOf("awaiting-answer")),
          reportStep(1, taskOf("finished")),
          emptyStep(2),
        ],
      }),
    ]
    expect(turnResultsOf(turns, "deliver")).toEqual(["done"])
  })

  it("閉じていないいちばん新しいやり取りは、答え待ちの列の有無で答え待ちか働いている最中", () => {
    const newest = turn(2, { steps: [reportStep(0, taskOf("finished"))] })
    expect(turnResultsOf([DONE, newest], "work")).toEqual(["done", "working"])
    expect(turnResultsOf([DONE, newest], "ask")).toEqual(["done", "awaiting-answer"])
  })

  it("いちばん新しいやり取りが失敗かセッションの終わりで閉じたら、記録から導く", () => {
    const failed = turn(2, { failure: { kind: "failed", failure: { kind: "max-turns" } } })
    expect(turnResultsOf([DONE, failed], "stumble")).toEqual(["done", "failed"])
    expect(turnResultsOf([DONE, turn(2, {})], "stumble")).toEqual(["done", "no-report"])
  })
})
