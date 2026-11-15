import { cleanup, render, screen } from "@testing-library/react"
import type { ReactElement } from "react"
import { afterEach, describe, expect, it } from "vitest"

import { reportProofView } from "../../../../../src/browser/features/report/domain/report-proof.ts"
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
  supports,
})

function checksOf(
  problems: readonly ReportCheckProblemRow[],
  passedRows: readonly ReportCheckPassedRow[],
): ReportChecksView {
  return {
    kind: "checks",
    summary: { passedCount: passedRows.length, figures: [], problems: [], favor: { kind: "none" } },
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
  return (
    <HeadRegion head={given} proof={reportProofView(given.checks, sectionIds, given.notDone)} />
  )
}

describe("裏づけの帯", () => {
  it("帯の名前が数を言い、色以外の形の差が出る", () => {
    const checks = checksOf([problem("架空の落ち", ["a"])], [passed("架空の通過", ["b"])])
    const { container } = render(
      headRegion(head(checks, { notDone: { kind: "listed", items: ["架空の見送り"] } }), [
        "a",
        "b",
      ]),
    )

    const band = screen.getByRole("img")
    expect(band.getAttribute("aria-label")).toBe("主張 2件: 落ちた 1・記録あり 1・やっていない 1")
    expect(
      [...container.querySelectorAll("[data-proof]")].map((el) => el.getAttribute("data-proof")),
    ).toEqual(["ng", "recorded", "not-done"])
    expect(container.textContent).toContain("✕ 落ちた 1")
    expect(container.textContent).toContain("✓ 記録あり 1")
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

    expect(screen.getByRole("img").getAttribute("aria-label")).toBe("主張 1件: 記録あり 1")
  })
})
