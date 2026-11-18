import { describe, expect, it } from "vitest"

import { reportProofView } from "../../../../../src/browser/features/report/domain/report-proof.ts"
import {
  type ReportCheckInput,
  reportChecksView,
} from "../../../../../src/shared/report/report-check-view.ts"
import type { MeasuredTime } from "../../../../../src/shared/utils/elapsed-time.ts"

// command が "照合" で始まる行だけ、同じやり取りの記録と照らせた扱いにする
const duration = (command: string): MeasuredTime =>
  command.startsWith("照合") ? { kind: "known", milliseconds: 3000 } : { kind: "unknown" }

const check = (
  status: ReportCheckInput["status"],
  label: string,
  supports: readonly string[],
  recorded = false,
): ReportCheckInput => ({
  status,
  label,
  figure: "",
  command: recorded ? "照合 架空のコマンド" : "",
  detail: "",
  howToVerify: "",
  supports,
})

const proofOf = (
  checks: readonly ReportCheckInput[],
  sectionIds: readonly string[] = ["a", "b", "c"],
) =>
  reportProofView(
    reportChecksView(checks, duration, { kind: "none" }, () => 1),
    sectionIds,
  )

function bandOf(view: ReturnType<typeof proofOf>) {
  if (view.kind === "plain") {
    throw new Error("値が plain")
  }
  return view
}

describe("reportProofView", () => {
  it("全部が ok で全部照らせた節は記録あり", () => {
    const view = bandOf(
      proofOf([check("ok", "架空の一", ["a"], true), check("ok", "架空の二", ["b"], true)]),
    )
    expect(view.sections.map((section) => section.mark)).toEqual(["recorded", "recorded"])
    expect(view.sections[0]?.receipts).toHaveLength(1)
  })

  it("目盛りの帯のための値（ticks・counts・claimCount）は持たない", () => {
    const view = bandOf(proofOf([check("ok", "架空の一", ["a"], true)]))
    expect(Object.keys(view).toSorted()).toEqual([
      "kind",
      "sections",
      "unboundPassed",
      "unboundProblems",
    ])
  })

  it("節の打った回数は、控えの行の回数の合計", () => {
    const view = bandOf(
      proofOf([check("ok", "架空の一", ["a"], true), check("ok", "架空の二", ["a"], true)]),
    )
    expect(view.sections[0]?.runCount).toBe(2)
  })

  it("照らせない ok がある節は declared", () => {
    const view = bandOf(proofOf([check("ok", "架空の一", ["a"], false)]))
    expect(view.sections[0]?.mark).toBe("declared")
    expect(view.sections[0]?.receipts).toEqual([])
  })

  it("declared と記録ありが混ざると、節ごとの印は節の並びのまま持つ", () => {
    const view = bandOf(
      proofOf([check("ok", "架空の一", ["a"], true), check("ok", "架空の二", ["b"], false)]),
    )
    expect(view.sections.map((section) => section.mark)).toEqual(["recorded", "declared"])
  })

  it("ng を含む節は落ちた", () => {
    const view = bandOf(
      proofOf([check("ok", "架空の一", ["a"], true), check("ng", "架空の落ち", ["b"])]),
    )
    expect(view.sections.map((section) => section.mark)).toEqual(["recorded", "ng"])
  })

  it("unobserved だけ・blocked だけの節は declared", () => {
    const view = bandOf(
      proofOf([
        check("unobserved", "架空の未確認", ["a"]),
        check("blocked", "架空の止まり", ["b"]),
      ]),
    )
    expect(view.sections.map((section) => section.mark)).toEqual(["declared", "declared"])
  })

  it("1つの節に複数の行が結ばれ1つが ng なら落ちた", () => {
    const view = bandOf(
      proofOf([check("ok", "架空の一", ["a"], true), check("ng", "架空の落ち", ["a"])]),
    )
    expect(view.sections).toHaveLength(1)
    expect(view.sections[0]?.mark).toBe("ng")
  })

  it("1つの行が複数の節に結ばれると、どちらの控えにも載る", () => {
    const view = bandOf(proofOf([check("ok", "架空の一", ["a", "b"], true)]))
    expect(view.sections.map((section) => section.receipts.length)).toEqual([1, 1])
  })

  it("supports が空・当たらない id の行は結ばれていない行に残り、当たる行が無ければ plain", () => {
    const view = bandOf(
      proofOf([
        check("ok", "架空の一", ["a"], true),
        check("ok", "架空の二", [], true),
        check("ng", "架空の落ち", ["zzz"]),
      ]),
    )
    expect(view.unboundPassed.map((row) => row.label)).toEqual(["架空の二"])
    expect(view.unboundProblems.map((row) => row.label)).toEqual(["架空の落ち"])
    expect(proofOf([check("ok", "架空の二", [], true)]).kind).toBe("plain")
    expect(proofOf([check("ok", "架空の二", ["zzz"], true)]).kind).toBe("plain")
  })

  it("結ばれた行は、どれかの節の行か結ばれていない行に必ず現れる", () => {
    const checks = [
      check("ok", "架空の一", ["a"], true),
      check("ng", "架空の落ち", ["b"]),
      check("ok", "架空の二", [], true),
      check("unobserved", "架空の未確認", ["zzz"]),
    ]
    const view = bandOf(proofOf(checks))
    const seen = [
      ...view.sections.flatMap((section) => section.rows.map((row) => row.label)),
      ...view.unboundProblems.map((row) => row.label),
      ...view.unboundPassed.map((row) => row.label),
    ]
    for (const input of checks) {
      expect(seen).toContain(input.label)
    }
  })
})
