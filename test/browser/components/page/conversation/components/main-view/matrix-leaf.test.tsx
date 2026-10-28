import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import {
  DirectLeaf,
  directLeafViewOf,
} from "../../../../../../../src/browser/components/page/conversation/components/main-view/direct-leaf-view.tsx"
import { loadMarkdown } from "../../../../../../../src/browser/components/page/conversation/components/markdown/markdown.tsx"
import type { A2uiReportComponent } from "../../../../../../../src/shared/report/a2ui-report-catalog.ts"
import type { LeafValue } from "../../../../../../../src/shared/report/report-leaf-value.ts"
import { newLeafHtml, oldLeafHtml } from "../../../../../../fixture/direct-leaf-compare.tsx"

beforeAll(async () => {
  await loadMarkdown()
})

afterEach(() => {
  cleanup()
})

type MatrixPart = Extract<A2uiReportComponent, { readonly component: "Matrix" }>

type MatrixFields = {
  title?: string
  columns?: MatrixPart["columns"]
  fold?: string
  aside?: string
}

function pair(rows: MatrixPart["rows"], fields: MatrixFields = {}) {
  const base = {
    title: fields.title ?? "",
    columns: fields.columns ?? ["甲", "乙"],
    rows,
    fold: fields.fold ?? "",
    aside: fields.aside ?? "",
  }
  const part: MatrixPart = { id: "m1", component: "Matrix", ...base }
  return { block: { kind: "matrix", ...base } as const, part }
}

function both(rows: MatrixPart["rows"], fields: MatrixFields = {}) {
  const { block, part } = pair(rows, fields)
  return { fresh: newLeafHtml(block, part), old: oldLeafHtml(block) }
}

const ALL_STATUSES: MatrixPart["rows"] = [
  { name: "架空のA", cells: ["ok", "warn"] },
  { name: "架空のB", cells: ["ng", "na"] },
]

const MANY: MatrixPart["rows"] = Array.from({ length: 12 }, (_, index) => ({
  name: `架空の行${String(index + 1)}`,
  cells: ["ok", "ng"],
}))

const PLAIN_VALUE: LeafValue = {
  captionNumber: { kind: "none" },
  tagTones: {},
  gutterNotes: [],
  mergedIntoPrevious: false,
  children: [],
}

function renderPart(part: MatrixPart) {
  const view = directLeafViewOf(part)
  if (view === undefined) {
    throw new Error("Matrix の部品が一覧に無い")
  }
  return render(
    <div data-report-region="section">
      <DirectLeaf part={part} value={PLAIN_VALUE} imageSource={{ kind: "none" }} view={view} />
    </div>,
  )
}

describe("Matrix の部品", () => {
  it.each<[string, MatrixPart["rows"], MatrixFields]>([
    ["4 種の状態がそろう格子", ALL_STATUSES, {}],
    ["ok だけの格子（凡例は ok だけ）", [{ name: "架空のA", cells: ["ok", "ok"] }], {}],
    ["題つき", ALL_STATUSES, { title: "架空の `a.ts` の対応" }],
    ["fold", ALL_STATUSES, { fold: "架空の畳み" }],
    [
      "fold と題と傍注",
      ALL_STATUSES,
      { fold: "架空の畳み", title: "架空の題", aside: "架空の傍注" },
    ],
    ["行名と列名の太字・inline code", ALL_STATUSES, { columns: ["**甲**", "`b.ts`"] }],
    ["行が 10 を超える格子", MANY, {}],
  ])("%s は旧い描き方と同じ DOM", (_, rows, fields) => {
    const { fresh, old } = both(rows, fields)

    expect(fresh).toBe(old)
  })

  it("交点の印は role=img と状態の語を持ち、数は行 × 列と一致する", () => {
    renderPart(pair(ALL_STATUSES).part)

    expect(screen.getAllByRole("img")).toHaveLength(4)
    expect(screen.getByRole("img", { name: "要注意" }).textContent).toBe("！")
    expect(screen.getByRole("img", { name: "該当なし" }).textContent).toBe("－")
  })

  it("入力の行名・列名が全部描画に残り、凡例の印は読み上げから隠す", () => {
    const { container } = renderPart(pair(ALL_STATUSES).part)
    const text = container.textContent ?? ""

    expect(["甲", "乙", "架空のA", "架空のB"].filter((word) => !text.includes(word))).toEqual([])
    expect(["存在しない字"].filter((word) => !text.includes(word))).toEqual(["存在しない字"])
    expect(container.querySelectorAll("[aria-hidden='true']")).toHaveLength(4)
  })

  it("11 行以上の格子は 10 行で切り、「ほか n 件」を押すと全行が出る", () => {
    const { container } = renderPart(pair(MANY).part)

    expect(container.querySelectorAll("tbody tr")).toHaveLength(11)
    fireEvent.click(screen.getByRole("button", { name: /ほか 2 件/ }))
    expect(container.querySelectorAll("tbody tr")).toHaveLength(12)
  })

  it("整形で落ちた格子（葉の値が無い）は何も描かない", () => {
    const { part } = pair(ALL_STATUSES)
    const view = directLeafViewOf(part)
    if (view === undefined) {
      throw new Error("Matrix の部品が一覧に無い")
    }
    const { container } = render(
      <div data-report-region="section">
        <DirectLeaf part={part} value={undefined} imageSource={{ kind: "none" }} view={view} />
      </div>,
    )

    expect(container.querySelector("table")).toBeNull()
  })
})
