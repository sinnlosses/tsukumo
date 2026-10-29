import { describe, expect, it } from "vitest"

import {
  type ReportCheckInput,
  type ReportChecksView,
  reportChecksView,
} from "../../../src/shared/report/report-check-view.ts"
import type { MeasuredTime } from "../../../src/shared/utils/elapsed-time.ts"

const UNMEASURED = (): MeasuredTime => ({ kind: "unknown" })

const check = (
  status: ReportCheckInput["status"],
  label: string,
  fields: Partial<Omit<ReportCheckInput, "status" | "label">> = {},
): ReportCheckInput => ({
  status,
  label,
  figure: "",
  command: "",
  detail: "",
  howToVerify: "",
  ...fields,
})

const MIXED = [
  check("unobserved", "架空の未確認", { howToVerify: "架空の確かめ方" }),
  check("ok", "架空の一（補足）", { figure: " 12 件 " }),
  check("ng", "架空の落ち", { detail: "架空の理由" }),
  check("blocked", "架空の止まり", { howToVerify: "描かない確かめ方" }),
  check("ok", "架空の二"),
]

function checksOf(view: ReportChecksView): Extract<ReportChecksView, { readonly kind: "checks" }> {
  if (view.kind === "none") {
    throw new Error("値が none")
  }
  return view
}

/** 問題の行と通った行に残った label を並べ替えたもの。 */
function labelsOf(view: Extract<ReportChecksView, { readonly kind: "checks" }>): readonly string[] {
  return [
    ...view.problems.map((row) => row.label),
    ...view.passed.map((row) => row.label),
  ].toSorted()
}

describe("reportChecksView", () => {
  it("項目が無ければ none", () => {
    expect(reportChecksView([], UNMEASURED, { kind: "none" })).toEqual({ kind: "none" })
  })

  it("問題の行は ng → blocked → unobserved、通った行は入力の順で、総括行は状態ごとの件数を総括の順に持つ", () => {
    const view = checksOf(reportChecksView(MIXED, UNMEASURED, { kind: "none" }))

    expect(view.problems.map((row) => row.status)).toEqual(["ng", "blocked", "unobserved"])
    expect(view.passed.map((row) => row.label)).toEqual(["架空の一（補足）", "架空の二"])
    expect(view.summary).toEqual({
      passedCount: 2,
      figures: ["12 件"],
      problems: [
        { status: "unobserved", count: 1 },
        { status: "blocked", count: 1 },
        { status: "ng", count: 1 },
      ],
      favor: { kind: "none" },
    })
  })

  it("入力の全項目の label が、問題の行か通った行のどちらかにちょうど1回ずつ残る", () => {
    const view = checksOf(reportChecksView(MIXED, UNMEASURED, { kind: "none" }))
    const inputLabels = MIXED.map((each) => each.label).toSorted()
    const dropped = { ...view, passed: view.passed.slice(1) }

    expect(labelsOf(view)).toEqual(inputLabels)
    expect(labelsOf(dropped)).not.toEqual(inputLabels)
  })

  it("label の頭は最初の「（」より前、確かめ方は unobserved だけに残り、バッククォートは落ちる", () => {
    const view = checksOf(
      reportChecksView([...MIXED, check("ng", "`架空の印`", { detail: "  " })], UNMEASURED, {
        kind: "none",
      }),
    )

    expect(view.passed.map((row) => row.labelHead)).toEqual(["架空の一", "架空の二"])
    expect(view.problems.map((row) => row.howToVerify)).toEqual(["", "", "", "架空の確かめ方"])
    expect(view.problems[1]).toMatchObject({ label: "架空の印", detail: "" })
  })

  it("所要時間は command が空の行では引かず、測れた行は字に、測れない行は空文字にする", () => {
    const durations: Readonly<Record<string, MeasuredTime>> = {
      架空の速い: { kind: "known", milliseconds: 62000 },
      架空の不明: { kind: "unknown" },
    }
    const view = checksOf(
      reportChecksView(
        [
          check("ok", "架空の一", { command: "架空の速い" }),
          check("ok", "架空の二", { command: "架空の不明" }),
          check("ng", "架空の三", { command: "  " }),
        ],
        (command) => {
          const duration = durations[command]
          if (duration === undefined) {
            throw new Error(`引かない command を引いた: ${command}`)
          }
          return duration
        },
        { kind: "none" },
      ),
    )

    expect(view.passed.map((row) => row.time)).toEqual(["1分02秒", ""])
    expect(view.problems.map((row) => row.time)).toEqual([""])
  })

  it("お願いの印は渡した飛び先のまま総括行に載る", () => {
    const favor = { kind: "favor", id: "favor-toolu_fictional" } as const
    const view = checksOf(reportChecksView([check("ok", "架空の一")], UNMEASURED, favor))

    expect(view.summary.favor).toEqual(favor)
  })
})
