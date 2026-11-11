import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import {
  Table,
  TableCell,
  TableFoot,
  TableHead,
  TableHeaderCell,
  TableRow,
  TableRows,
  type TableSort,
} from "../../../../../src/browser/components/ui/table/table.tsx"

afterEach(cleanup)

function renderTable(sort: TableSort): void {
  render(
    <Table>
      <TableHead>
        <TableRow className="" header>
          <TableHeaderCell align="right" sort={sort} hidden={false}>
            件数
          </TableHeaderCell>
          <TableHeaderCell align="left" sort="unspecified" hidden>
            {""}
          </TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableRows>
        <TableRow className="dummy-row" header={false}>
          <TableCell align="center" className="" hidden={false} span={2}>
            中身
          </TableCell>
        </TableRow>
      </TableRows>
      <TableFoot>
        <TableRow className="" header={false}>
          <TableCell align="left" className="" hidden={false} span={1}>
            合計
          </TableCell>
        </TableRow>
      </TableFoot>
    </Table>,
  )
}

describe("Table", () => {
  it("見出し・本体・合計を table・thead・tbody・tfoot で描く", () => {
    renderTable("unspecified")
    const table = screen.getByRole("table")
    expect(table.tagName).toBe("TABLE")
    expect(table.querySelector("thead th")?.textContent).toBe("件数")
    expect(table.querySelector("tbody td")?.textContent).toBe("中身")
    expect(table.querySelector("tfoot td")?.textContent).toBe("合計")
  })

  it("揃えは text-align に写り、左は何も付けない", () => {
    renderTable("unspecified")
    expect(screen.getByRole("columnheader", { name: "件数" }).style.textAlign).toBe("right")
    expect(screen.getByRole("cell", { name: "中身" }).style.textAlign).toBe("center")
    expect(screen.getByRole("cell", { name: "合計" }).style.textAlign).toBe("")
  })

  it("sort は aria-sort に写り、unspecified は付けない", () => {
    renderTable("ascending")
    expect(screen.getByRole("columnheader", { name: "件数" }).getAttribute("aria-sort")).toBe(
      "ascending",
    )
    cleanup()
    renderTable("unspecified")
    expect(screen.getByRole("columnheader", { name: "件数" }).hasAttribute("aria-sort")).toBe(false)
  })

  it("span は colspan、className は行に残る", () => {
    renderTable("unspecified")
    expect(screen.getByRole("cell", { name: "中身" }).getAttribute("colspan")).toBe("2")
    expect(
      screen.getByRole("cell", { name: "中身" }).parentElement?.classList.contains("dummy-row"),
    ).toBe(true)
  })
})
