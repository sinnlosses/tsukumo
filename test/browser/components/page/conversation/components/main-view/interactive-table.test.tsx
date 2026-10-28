import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import { Report } from "../../../../../../../src/browser/components/page/conversation/components/main-view/report.tsx"
import { loadMarkdown } from "../../../../../../../src/browser/components/page/conversation/components/markdown/markdown.tsx"
import { reportEvents } from "../../../../../../../src/server/session-driver/core/sdk-report-message.ts"
import { mainViewEntries } from "../../../../../../../src/shared/session/main-view-entry.ts"
import type { MainViewReportRegions } from "../../../../../../../src/shared/session/main-view-shape.ts"
import { applySessionEvent } from "../../../../../../../src/shared/session/session-fold.ts"
import { INITIAL_SESSION_STATE } from "../../../../../../../src/shared/session/session-state.ts"

beforeAll(async () => {
  await loadMarkdown()
})

afterEach(() => {
  cleanup()
})

const ROWS = [
  ["ぼ", "甲", "10"],
  ["あ", "乙", "9"],
  ["ん", "甲", "100"],
]

function reportParts(table: Readonly<Record<string, unknown>>, withPicker = true) {
  return [
    { id: "root", component: "Report", conclusion: ["架空の結論。"], children: ["s1"] },
    {
      id: "s1",
      component: "Section",
      heading: "架空の操作",
      children: withPicker ? ["pick", "t1"] : ["t1"],
    },
    {
      id: "pick",
      component: "ChoicePicker",
      label: "架空の種別",
      options: [
        { label: "甲", value: "甲" },
        { label: "乙", value: "乙" },
        { label: "丙", value: "丙" },
      ],
      value: { path: "/view/t1/filter" },
    },
    {
      id: "t1",
      component: "Table",
      title: "架空の表",
      columns: ["架空の名", "架空の種別", "架空の数"],
      rows: ROWS,
      ...table,
    },
  ]
}

const INTERACTIVE = { sortable: true, filterable: true }

function regionsOf(components: readonly unknown[]): MainViewReportRegions {
  const [event] = reportEvents("toolu_fictional", { components }, [])
  if (event?.kind !== "report") throw new Error("report にならなかった")
  const entry = mainViewEntries(applySessionEvent(INITIAL_SESSION_STATE, event, 0)).find(
    (candidate) => candidate.kind === "report",
  )
  if (entry?.kind !== "report") throw new Error("レポートの記録が無い")
  return entry.regions
}

function renderRegions(body: MainViewReportRegions) {
  return render(<Report reveal={false} turnId={1} className="" body={body} />)
}

function names(container: HTMLElement): readonly string[] {
  return [...container.querySelectorAll("tbody tr")].map(
    (row) => row.firstElementChild?.textContent ?? "",
  )
}

describe("操作できる Table", () => {
  it("全行を見せているときの表は、操作できない Table と同じ DOM", () => {
    const interactive = renderRegions(regionsOf(reportParts(INTERACTIVE, false)))
    const shown = interactive.container.querySelector(
      "[data-report-region] .table-scroll",
    )?.outerHTML
    cleanup()
    const plain = renderRegions(regionsOf(reportParts({}, false)))

    expect(shown).toBeDefined()
    expect(shown).toBe(
      plain.container.querySelector("[data-report-region] .table-scroll")?.outerHTML,
    )
  })

  it("見出しを押すと昇順 → 降順 → 元の順に並ぶ", () => {
    const { container } = renderRegions(regionsOf(reportParts(INTERACTIVE)))
    expect(names(container)).toEqual(["ぼ", "あ", "ん"])

    fireEvent.click(screen.getByRole("button", { name: "架空の数" }))
    expect(names(container)).toEqual(["あ", "ぼ", "ん"])

    fireEvent.click(screen.getByRole("button", { name: /架空の数/ }))
    expect(names(container)).toEqual(["ん", "ぼ", "あ"])

    fireEvent.click(screen.getByRole("button", { name: /架空の数/ }))
    expect(names(container)).toEqual(["ぼ", "あ", "ん"])
  })

  it("絞り込んでも、数の棒は全行の最大値に照らしたまま", () => {
    const { container } = renderRegions(regionsOf(reportParts(INTERACTIVE)))

    fireEvent.click(screen.getByRole("button", { name: "乙" }))

    expect(names(container)).toEqual(["あ"])
    expect(container.querySelector("tbody [style*='width']")?.getAttribute("style")).toContain("9%")
  })

  it("どの行にも当たらなければ、見出しの行だけの表と「該当する行はありません」が出る", () => {
    const { container } = renderRegions(regionsOf(reportParts(INTERACTIVE)))

    fireEvent.click(screen.getByRole("button", { name: "丙" }))

    expect(container.querySelector("tbody")).toBeNull()
    expect([...container.querySelectorAll("thead th")].map((cell) => cell.textContent)).toEqual([
      "架空の名",
      "架空の種別",
      "架空の数",
    ])
    expect(screen.getByText("該当する行はありません")).toBeTruthy()
  })

  it("10 行を超える表で「ほか n 件」を押したあとに並べ替えても、展開は保たれる", () => {
    const many = Array.from({ length: 12 }, (_, index) => [
      `行${String(index + 1)}`,
      "甲",
      String(index + 1),
    ])
    const { container } = renderRegions(regionsOf(reportParts({ ...INTERACTIVE, rows: many })))
    expect(names(container)).toHaveLength(11)

    fireEvent.click(screen.getByRole("button", { name: /ほか 2 件/ }))
    fireEvent.click(screen.getByRole("button", { name: "架空の数" }))

    expect(names(container)).toHaveLength(12)
  })

  it("view の tables が空でも描ける（行の文字列を割る経路に頼らない）", () => {
    const body = regionsOf(reportParts(INTERACTIVE))
    if (body.a2ui.kind !== "surface") {
      throw new Error("部品の一覧の面にならなかった")
    }
    const withoutTables: MainViewReportRegions = {
      ...body,
      a2ui: { ...body.a2ui, tables: {} },
    }
    const { container } = renderRegions(withoutTables)

    expect(names(container)).toEqual(["ぼ", "あ", "ん"])
    expect(screen.getByRole("group", { name: "並べ替え" })).toBeTruthy()
  })
})
