import { cleanup, render } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import { TableFigure } from "../../../../../src/browser/features/report/leaf/table-leaf.tsx"
import { loadMarkdown } from "../../../../../src/browser/features/report/markdown.tsx"
import type { A2uiReportComponent } from "../../../../../src/shared/report/a2ui-report-catalog.ts"
import type { LeafValue } from "../../../../../src/shared/report/report-leaf-value.ts"
import { newLeafHtml, oldLeafHtml } from "../../../../fixture/direct-leaf-compare.tsx"

beforeAll(async () => {
  await loadMarkdown()
})

afterEach(() => {
  cleanup()
})

type TablePart = Extract<A2uiReportComponent, { readonly component: "Table" }>

const PLAIN_VALUE: LeafValue = {
  captionNumber: { kind: "none" },
  tagTones: {},
  gutterNotes: [],
  mergedIntoPrevious: false,
}

function pair(rows: TablePart["rows"]) {
  const base = {
    title: "",
    columns: ["機種", "値段", "重さ"],
    rows,
    rest: "",
    fold: "",
    aside: "",
    emphasisColumn: 1,
  }
  const part: TablePart = { id: "t1", component: "Table", ...base }
  return { block: { kind: "table", ...base } as const, part }
}

const marks = (html: string) => html.match(/cell-best-mark/g)?.length ?? 0

describe("Table の行の best の印", () => {
  it("best の列のセルに印が1つずつ付き、直接の描画と Markdown 戻しで同じ数になる", () => {
    const { block, part } = pair([
      { cells: ["架空のA", "10", "3"], best: 1 },
      { cells: ["架空のB", "20", "2"], best: 2 },
      ["架空のC", "30", "1"],
    ])

    expect(marks(newLeafHtml(block, part))).toBe(2)
    expect(marks(oldLeafHtml(block))).toBe(2)
  })

  it("best の無い表と columns の外の位置を持つ行には印が出ない", () => {
    const none = pair([["架空のA", "10", "3"]])
    const outside = pair([{ cells: ["架空のA", "10", "3"], best: 3 }])

    expect(marks(newLeafHtml(none.block, none.part))).toBe(0)
    expect(marks(newLeafHtml(outside.block, outside.part))).toBe(0)
    expect(marks(oldLeafHtml(outside.block))).toBe(0)
  })

  it("行の順が入れ替わっても印は同じ行に付いて回る", () => {
    const { part } = pair([
      { cells: ["架空のA", "10", "3"], best: 1 },
      { cells: ["架空のB", "20", "2"], best: 2 },
    ])
    const { container } = render(
      <div data-report-region="section">
        <TableFigure part={part} value={PLAIN_VALUE} rowOrder={[1, 0]} />
      </div>,
    )
    const rows = [...container.querySelectorAll("tbody tr")].map((row) => [
      row.querySelectorAll("td")[0]?.textContent,
      row.querySelectorAll("td")[1]?.querySelector('[role="img"]') !== null,
      row.querySelectorAll("td")[2]?.querySelector('[role="img"]') !== null,
    ])

    expect(rows).toEqual([
      ["架空のB", false, true],
      ["架空のA", true, false],
    ])
  })
})
