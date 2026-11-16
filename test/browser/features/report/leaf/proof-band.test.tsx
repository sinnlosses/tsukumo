import { cleanup, render, screen } from "@testing-library/react"
import type { ReactElement } from "react"
import { afterEach, describe, expect, it } from "vitest"

import { reportProofView } from "../../../../../src/browser/features/report/domain/report-proof.ts"
import { SectionProof } from "../../../../../src/browser/features/report/leaf/proof-band.tsx"
import { HeadRegion } from "../../../../../src/browser/features/report/leaf/report-head-region.tsx"
import type {
  ReportCheckPassedRow,
  ReportCheckProblemRow,
  ReportChecksView,
} from "../../../../../src/shared/report/report-check-view.ts"
import type { MainViewSurfaceHead } from "../../../../../src/shared/session/main-view-shape.ts"

afterEach(() => {
  cleanup()
})

const EMPTY_STATUS = {
  phaseTimes: { kind: "none" },
  changedFiles: { kind: "none" },
  verification: { kind: "none" },
} as const

const problem = (label: string, supports: readonly string[]): ReportCheckProblemRow => ({
  status: "ng",
  label,
  figure: "",
  time: "",
  viaCommand: false,
  recorded: false,
  runCount: 0,
  supports,
  detail: "",
  howToVerify: "",
})

const passed = (label: string, supports: readonly string[]): ReportCheckPassedRow => ({
  label,
  labelHead: label,
  figure: "",
  time: "",
  viaCommand: false,
  recorded: true,
  runCount: 1,
  supports,
})

function checksOf(
  problems: readonly ReportCheckProblemRow[],
  passedRows: readonly ReportCheckPassedRow[],
): ReportChecksView {
  return {
    kind: "checks",
    summary: {
      passedCount: passedRows.length,
      figures: ["単体 12", "E2E 3"],
      problems: problems.length === 0 ? [] : [{ status: "ng", count: problems.length }],
      favor: { kind: "none" },
    },
    problems,
    passed: passedRows,
  }
}

function head(
  checks: ReportChecksView,
  overrides: Partial<MainViewSurfaceHead> = {},
): MainViewSurfaceHead {
  return {
    lead: { kind: "conclusion", text: "架空の結論。" },
    keyFigures: [],
    workDone: "架空のしたこと",
    notDone: { kind: "omitted" },
    checks,
    status: EMPTY_STATUS,
    finalStatus: EMPTY_STATUS,
    ...overrides,
  }
}

function headRegion(given: MainViewSurfaceHead, sectionIds: readonly string[]): ReactElement {
  return <HeadRegion head={given} proof={reportProofView(given.checks, sectionIds)} />
}

describe("検証のまとめ", () => {
  it("字の1行で言い、目盛りの帯は出ない", () => {
    const checks = checksOf([problem("架空の落ち", ["a"])], [passed("架空の通過", ["b"])])
    const { container } = render(headRegion(head(checks), ["a", "b"]))

    expect(screen.queryByRole("img")).toBeNull()
    expect(container.querySelector("[data-proof]")).toBeNull()
    expect(screen.getByText("確かめたこと 2件")).toBeTruthy()
    expect(screen.getByText("通った 1・落ちた 1")).toBeTruthy()
    expect(screen.getByText("単体 12・E2E 3")).toBeTruthy()
  })

  it("節の印は、落ちたは状態の印、記録ありは回数つきの線の印になる", () => {
    const section = {
      sectionId: "a",
      mark: "recorded",
      runCount: 3,
      rows: [],
      receipts: [],
    } as const
    const { container } = render(<SectionProof section={section} />)

    const seal = container.querySelector("[data-seal]")
    expect(seal?.textContent).toBe("記録あり・3回")
    expect(seal?.getAttribute("data-seal")).toBe("outline")
  })

  it("結ばれていない行だけが帯の下に残る", () => {
    const checks = checksOf(
      [problem("架空の落ち", ["a"]), problem("架空の孤立した落ち", [])],
      [passed("架空の結ばれた通過", ["a"])],
    )
    render(headRegion(head(checks), ["a"]))

    expect(screen.getByText("架空の孤立した落ち")).toBeTruthy()
    expect(screen.queryByText("架空の落ち")).toBeNull()
    expect(screen.queryByText(/架空の結ばれた通過/)).toBeNull()
  })

  it("supports を持つ行が無いレポートは今の形のまま描かれる", () => {
    const checks = checksOf([problem("架空の落ち", [])], [])
    render(headRegion(head(checks), ["a"]))

    expect(screen.queryByRole("img")).toBeNull()
    expect(screen.getByText("架空の落ち")).toBeTruthy()
  })

  it("作業の名前を持たないレポートの検証も帯になる", () => {
    const checks = checksOf([], [passed("架空の通過", ["a"])])
    render(
      headRegion(head(checks, { lead: { kind: "conclusion-lead", text: "架空の結論。" } }), ["a"]),
    )

    expect(screen.getByText("確かめたこと 1件")).toBeTruthy()
    expect(screen.getByText("通った 1")).toBeTruthy()
  })
})
