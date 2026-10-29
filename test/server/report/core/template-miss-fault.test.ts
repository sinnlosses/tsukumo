import { describe, expect, it } from "vitest"

import { reportRejectionText } from "../../../../src/server/report/core/report-rejection.ts"
import { reportViolations } from "../../../../src/server/report/core/report-violation-check.ts"
import type { ReportDraft } from "../../../../src/server/report/core/report-violation.ts"
import type { ReportGenre } from "../../../../src/shared/report/report-task.ts"
import { type ReportDraftInput, reportDraft } from "../../../fixture/report-event.ts"

const taskOf = (genre: ReportGenre | "unspecified"): ReportDraft["task"] => ({
  kind: "task",
  id: "T-1",
  name: "架空の作業",
  outcome: "finished",
  genre,
})

const missesOf = (overrides: ReportDraftInput) =>
  reportViolations(reportDraft(overrides)).filter((violation) => violation.kind === "template-miss")

describe("依頼の型の雛形", () => {
  it("結論に数が 3 つあるのに数の帯が無い診断は key-figures として数える", () => {
    expect(
      missesOf({ conclusion: "架空の 3 件が 2 層で 5 分遅い", task: taskOf("diagnosis") }),
    ).toEqual([{ kind: "template-miss", count: 1, misses: ["key-figures"] }])
  })

  it("インラインコードの中の数と、桁区切り・小数は 1 つとして数える", () => {
    expect(
      missesOf({ conclusion: "`a1` と `b2` が 1,234 件で 1.5 倍", task: taskOf("diagnosis") }),
    ).toEqual([])
  })

  it("数の帯があれば key-figures は数えない", () => {
    expect(
      missesOf({
        conclusion: "架空の 3 件が 2 層で 5 分遅い",
        keyFigures: [
          { value: "3", label: "件", before: "", total: "", series: [], better: "" },
          { value: "2", label: "層", before: "", total: "", series: [], better: "" },
          { value: "5", label: "分", before: "", total: "", series: [], better: "" },
        ],
        task: taskOf("diagnosis"),
      }),
    ).toEqual([])
  })

  it("数の帯を求めない型は数が多くても数えない", () => {
    expect(
      missesOf({ conclusion: "架空の 3 件が 2 層で 5 分遅い", task: taskOf("screen") }),
    ).toEqual([])
  })

  it("図 1 が第一候補の種類でなければ figure として数え、図を置かない申告は数えない", () => {
    const figure = {
      kind: "timeline",
      title: "架空の経過",
      rows: [{ name: "甲", lane: "", start: 0, end: 3, extra: [] }],
      events: [],
      emphasis: [],
      aside: "",
      fold: "",
    } as const
    expect(missesOf({ task: taskOf("decision"), figure })).toEqual([
      { kind: "template-miss", count: 1, misses: ["figure"] },
    ])
    expect(
      missesOf({ task: taskOf("decision"), figure: { kind: "none", reason: "no-shape" } }),
    ).toEqual([])
  })

  it("型を申告していなければ何も数えない", () => {
    expect(missesOf({ conclusion: "架空の 3 件が 2 層で 5 分遅い" })).toEqual([])
    expect(
      missesOf({ conclusion: "架空の 3 件が 2 層で 5 分遅い", task: taskOf("unspecified") }),
    ).toEqual([])
  })

  it("文面は外れた点の名前を並べる", () => {
    expect(
      reportRejectionText([{ kind: "template-miss", count: 1, misses: ["key-figures", "figure"] }]),
    ).toContain("key-figures・figure")
  })
})
