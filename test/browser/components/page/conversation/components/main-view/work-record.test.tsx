import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { HeadRegion } from "../../../../../../../src/browser/components/page/conversation/components/main-view/report-head-region.tsx"
import { changedFilesView } from "../../../../../../../src/shared/report/changed-file-section.ts"
import type { ReportChecksView } from "../../../../../../../src/shared/report/report-check-view.ts"
import {
  type PhaseTimeRow,
  phaseTimesView,
} from "../../../../../../../src/shared/report/report-phase-time.ts"
import type { MainViewSurfaceHead } from "../../../../../../../src/shared/session/main-view-shape.ts"

afterEach(() => {
  cleanup()
})

const EMPTY_STATUS = {
  phaseTimes: { kind: "none" },
  changedFiles: { kind: "none" },
  verification: { kind: "none" },
} as const

const CHANGED = changedFilesView({
  kind: "counted",
  changed: [{ path: "src/架空/a.ts", change: "modified" }],
  files: 1,
  added: 7,
  removed: 2,
  mixed: true,
})

const TIMES = phaseTimesView([
  {
    kind: "phase",
    label: "1/2 架空の段A",
    start: { kind: "known", milliseconds: 0 },
    duration: { kind: "known", milliseconds: 20_000 },
    absence: "none",
  },
  {
    kind: "phase",
    label: "2/2 架空の段B",
    start: { kind: "known", milliseconds: 20_000 },
    duration: { kind: "known", milliseconds: 10_000 },
    absence: "none",
  },
] satisfies readonly PhaseTimeRow[])

const CHECKS: ReportChecksView = {
  kind: "checks",
  summary: {
    passedCount: 1,
    figures: [],
    problems: [{ status: "unobserved", count: 1 }],
    favor: { kind: "none" },
  },
  problems: [
    {
      status: "unobserved",
      label: "架空の画面の確認",
      figure: "",
      time: "",
      viaCommand: false,
      detail: "",
      howToVerify: "架空の画面を開く",
    },
  ],
  passed: [
    { label: "架空の検証", labelHead: "架空の検証", figure: "3件", time: "", viaCommand: false },
    {
      label: "架空のコマンドの検証",
      labelHead: "架空のコマンドの検証",
      figure: "",
      time: "",
      viaCommand: true,
    },
  ],
}

function head(overrides: Partial<MainViewSurfaceHead>): MainViewSurfaceHead {
  return {
    lead: { kind: "conclusion", text: "架空の結論。" },
    keyFigures: [],
    workDone: "",
    checks: { kind: "none" },
    status: EMPTY_STATUS,
    finalStatus: EMPTY_STATUS,
    ...overrides,
  }
}

function rowTitles(container: HTMLElement): readonly string[] {
  return [
    ...container.querySelectorAll("section[aria-label='作業の記録'] > div > div:first-child"),
  ].map((element) => element.textContent ?? "")
}

describe("作業の記録", () => {
  it("task のあるレポートは、値のある行だけを見本の順に並べる", () => {
    const all = head({
      workDone: "架空の `file.ts` を直した。",
      checks: CHECKS,
      status: { ...EMPTY_STATUS, phaseTimes: TIMES, changedFiles: CHANGED },
    })
    const cases: readonly (readonly [string, MainViewSurfaceHead, readonly string[]])[] = [
      ["4行とも", all, ["したこと", "変えたファイル", "確かめたこと", "かかった時間"]],
      [
        "したこと無し",
        { ...all, workDone: "" },
        ["変えたファイル", "確かめたこと", "かかった時間"],
      ],
      [
        "確かめたこと無し",
        { ...all, checks: { kind: "none" } },
        ["したこと", "変えたファイル", "かかった時間"],
      ],
      ["時間と変更無し", { ...all, status: EMPTY_STATUS }, ["したこと", "確かめたこと"]],
      ["何も無い", head({}), []],
    ]
    for (const [name, given, expected] of cases) {
      const { container } = render(<HeadRegion head={given} />)

      expect(rowTitles(container), name).toEqual(expected)
      cleanup()
    }
  })

  it("変えたファイルの題に n ファイル +a −b と注記、かかった時間の頭に合計とフェーズの数が出る", () => {
    const { container } = render(
      <HeadRegion
        head={head({ status: { ...EMPTY_STATUS, phaseTimes: TIMES, changedFiles: CHANGED } })}
      />,
    )

    expect(container.textContent).toContain("1 ファイル+7−2※他の変更を含みうる")
    expect(container.textContent).toContain("計 30秒2 フェーズ")
    expect(container.textContent).not.toContain("フェーズごとの時間")
  })

  it("確かめたことは通った・確かめていない（確かめ方つき）を1行ずつ並べる", () => {
    render(<HeadRegion head={head({ checks: CHECKS })} />)

    expect(screen.getByText("架空の検証（3件）")).toBeTruthy()
    expect(screen.getByText("架空の画面の確認")).toBeTruthy()
    expect(screen.getByText("確かめ方: 架空の画面を開く")).toBeTruthy()
  })

  it("段が届いたレポートは札を表示名と件数で並べ、コマンドの検証の行は重ねて出さない", () => {
    const { container } = render(
      <HeadRegion
        head={head({
          checks: CHECKS,
          status: {
            ...EMPTY_STATUS,
            verification: {
              kind: "checked",
              stages: [
                { name: "typecheck", result: "passed", count: { kind: "none" } },
                { name: "format:check", result: "carried", count: { kind: "none" } },
                { name: "test", result: "passed", count: { kind: "counted", tests: 3152 } },
                { name: "架空の段", result: "failed", count: { kind: "none" } },
                { name: "test:e2e", result: "passed", count: { kind: "counted", tests: 71 } },
              ],
            },
          },
        })}
      />,
    )

    const tags = [...container.querySelectorAll("ul > li")].map((li) => li.textContent)
    expect(tags).toEqual(["型検査", "整形", "単体3,152", "架空の段", "E2E71"])
    expect(screen.getByText("架空の検証（3件）")).toBeTruthy()
    expect(screen.queryByText("架空のコマンドの検証")).toBeNull()
  })

  it("段が届いても、落ちた・確かめていないコマンドの検証の行は隠さない", () => {
    const checks: ReportChecksView = {
      kind: "checks",
      summary: {
        passedCount: 0,
        figures: [],
        problems: [{ status: "ng", count: 1 }],
        favor: { kind: "none" },
      },
      passed: [],
      problems: [
        {
          status: "ng",
          label: "架空の別コマンド",
          figure: "",
          time: "",
          viaCommand: true,
          detail: "",
          howToVerify: "",
        },
      ],
    }
    render(
      <HeadRegion
        head={head({
          checks,
          status: {
            ...EMPTY_STATUS,
            verification: {
              kind: "checked",
              stages: [{ name: "typecheck", result: "passed", count: { kind: "none" } }],
            },
          },
        })}
      />,
    )

    expect(screen.getByText("架空の別コマンド")).toBeTruthy()
  })

  it("段が届かないレポートはコマンドの検証の行も今のまま出す", () => {
    const { container } = render(<HeadRegion head={head({ checks: CHECKS })} />)

    expect(container.querySelector("ul")).toBeNull()
    expect(screen.getByText("架空のコマンドの検証")).toBeTruthy()
  })

  it("task の無いレポートは記録を組まず、今の頭のまま", () => {
    const { container } = render(
      <HeadRegion
        head={head({
          lead: { kind: "conclusion-lead", text: "架空の結論。" },
          workDone: "架空のしたこと",
          checks: CHECKS,
          status: { ...EMPTY_STATUS, phaseTimes: TIMES, changedFiles: CHANGED },
        })}
      />,
    )

    expect(container.querySelector("section[aria-label='作業の記録']")).toBeNull()
    expect(container.textContent).not.toContain("架空のしたこと")
    expect(container.textContent).toContain("1 ファイル")
  })
})
