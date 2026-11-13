import { describe, expect, it } from "vitest"

import { paperFormOf } from "../../../../../src/browser/features/report/domain/paper-form.ts"
import type { A2uiReportComponent } from "../../../../../src/shared/report/a2ui-report-catalog.ts"
import type { ChangedFilesView } from "../../../../../src/shared/report/changed-file-section.ts"
import type { ReportChecksView } from "../../../../../src/shared/report/report-check-view.ts"

const options: A2uiReportComponent = {
  id: "options-1",
  component: "Options",
  title: "架空の比べ",
  items: [
    { name: "架空の案A", verdict: "adopt", reason: "理由" },
    { name: "架空の案B", verdict: "consider", reason: "理由" },
  ],
  fold: "",
  aside: "",
}

type PaperFormInput = Parameters<typeof paperFormOf>[0]

const NONE = { kind: "none" } as const

const changed: ChangedFilesView = {
  kind: "files",
  count: 1,
  added: 1,
  removed: 0,
  mixed: false,
  rows: [],
  totals: [],
}

const checked: ReportChecksView = {
  kind: "checks",
  summary: { passedCount: 1, figures: [], problems: [], favor: NONE },
  problems: [],
  passed: [],
}

/** 変更も検証も無い、節1つの、済んだ答え。 */
const quiet: PaperFormInput = {
  progress: { verdict: "done", next: NONE },
  components: [],
  changedFiles: NONE,
  checks: NONE,
  sectionCount: 1,
}

const yours = (choices: readonly string[]): PaperFormInput["progress"] => ({
  verdict: "yours",
  next: { kind: "next", owner: "you", action: "架空の判断を選ぶ", choices },
})

describe("paperFormOf", () => {
  it.each([
    ["failed", "stopped"],
    ["stopped", "stopped"],
    ["done", "answer"],
    ["partial", "answer"],
  ] as const)("判定が %s なら %s", (verdict, form) => {
    expect(paperFormOf({ ...quiet, progress: { verdict, next: NONE } })).toBe(form)
  })

  it("失敗は、選べる答えや Options があっても止めたの形が勝つ", () => {
    expect(
      paperFormOf({
        ...quiet,
        progress: { ...yours(["架空の案A"]), verdict: "failed" },
        components: [options],
      }),
    ).toBe("stopped")
  })

  it.each([
    ["選べる答えがある", yours(["架空の案A", "架空の案B"]), [], "decide"],
    ["Options の部品がある", yours([]), [options], "decide"],
    ["どちらも無い", yours([]), [], "answer"],
  ] as const)("判定が yours で%s", (_label, progress, components, form) => {
    expect(paperFormOf({ ...quiet, progress, components })).toBe(form)
  })

  it("選べる答えがあっても、判定が yours でなければ判断を仰ぐ形にしない", () => {
    expect(paperFormOf({ ...quiet, progress: { ...yours(["架空の案A"]), verdict: "done" } })).toBe(
      "answer",
    )
  })

  it.each([
    ["節が2つ", { sectionCount: 2 }],
    ["変更がある", { changedFiles: changed }],
    ["検証がある", { checks: checked }],
  ] as const)("%sと、短い答えでなく渡すの形", (_label, overrides) => {
    expect(paperFormOf({ ...quiet, ...overrides })).toBe("deliver")
  })

  it("節が0のときも短い答え", () => {
    expect(paperFormOf({ ...quiet, sectionCount: 0 })).toBe("answer")
  })
})
