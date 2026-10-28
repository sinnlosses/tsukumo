import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import {
  DirectLeaf,
  directLeafViewOf,
} from "../../../../../../../src/browser/components/page/conversation/components/main-view/direct-leaf-view.tsx"
import { loadMarkdown } from "../../../../../../../src/browser/components/page/conversation/components/markdown/markdown.tsx"
import type { A2uiReportComponent } from "../../../../../../../src/shared/report/a2ui-report-catalog.ts"
import type { LeafValue } from "../../../../../../../src/shared/report/report-leaf-value.ts"
import { tableCellTexts } from "../../../../../../../src/shared/report/table-view.ts"
import { newLeafHtml, oldLeafHtml } from "../../../../../../fixture/direct-leaf-compare.tsx"

beforeAll(async () => {
  await loadMarkdown()
})

afterEach(() => {
  cleanup()
})

type TablePart = Extract<A2uiReportComponent, { readonly component: "Table" }>

type TableFields = {
  title?: string
  columns?: TablePart["columns"]
  rest?: string
  fold?: string
  aside?: string
}

function pair(rows: TablePart["rows"], fields: TableFields = {}) {
  const base = {
    title: fields.title ?? "",
    columns: fields.columns ?? ["名前", "件数"],
    rows,
    rest: fields.rest ?? "",
    fold: fields.fold ?? "",
    aside: fields.aside ?? "",
  }
  const part: TablePart = { id: "t1", component: "Table", ...base }
  return { block: { kind: "table", ...base } as const, part }
}

function both(rows: TablePart["rows"], fields: TableFields = {}) {
  const { block, part } = pair(rows, fields)
  return { fresh: newLeafHtml(block, part), old: oldLeafHtml(block) }
}

const SIMPLE: TablePart["rows"] = [
  ["架空のA", "10"],
  ["架空のB", "5"],
]

const MANY: TablePart["rows"] = Array.from({ length: 12 }, (_, index) => [
  `架空の行${String(index + 1)}`,
  String(index + 1),
])

describe("Table の部品", () => {
  it.each<[string, TablePart["rows"], TableFields]>([
    ["素の字の表", SIMPLE, {}],
    ["題つき", SIMPLE, { title: "架空の題" }],
    ["題の inline code", SIMPLE, { title: "架空の `a.ts` の題" }],
    [
      "数だけの列と数でない列",
      [
        ["架空のA", "1,200", "約3"],
        ["架空のB", "300", "5"],
      ],
      { columns: ["名前", "件数", "備考"] },
    ],
    [
      "負の数がある列は棒を出さない",
      [
        ["架空のA", "-1"],
        ["架空のB", "5"],
      ],
      {},
    ],
    ["行が 1 つなら棒を出さない", [["架空のA", "10"]], {}],
    [
      "最大値が 0 の列は棒を出さない",
      [
        ["架空のA", "0"],
        ["架空のB", "0"],
      ],
      {},
    ],
    [
      "状態のセルと凡例",
      [
        ["架空のA", { status: "ok", text: "良好" }],
        ["架空のB", { status: "warn", text: "" }],
        ["架空のC", { status: "ng", text: "不良 `x`" }],
        ["架空のD", "状態なし"],
      ],
      { columns: ["名前", "状態"] },
    ],
    [
      "変わったセル",
      [
        ["架空のA", { from: "3", to: "5" }],
        ["架空のB", { from: "`a`", to: "**b**" }],
      ],
      {},
    ],
    [
      "札（7 種は 6 種目以降が tag-none）",
      ["a", "b", "c", "d", "e", "f", "g"].map((tag) => ["架空", { tag }]),
      {},
    ],
    ["強調の行", [{ cells: ["架空のA", "10"], emphasis: true }, ["架空のB", "5"]], {}],
    ["rest", SIMPLE, { rest: "ほか 3 件は `x.ts` に省略" }],
    ["fold", SIMPLE, { fold: "架空の畳み" }],
    ["fold と題と傍注", SIMPLE, { fold: "架空の畳み", title: "架空の題", aside: "架空の傍注" }],
    ["傍注", SIMPLE, { aside: "架空の傍注" }],
    ["行が 10 を超える表", MANY, {}],
    [
      "セルの太字・inline code・リンク",
      [
        ["**架空**の `a.ts`", "[リンク](https://example.com)"],
        ["架空のB", "5"],
      ],
      {},
    ],
  ])("%s は旧い描き方と同じ DOM", (_, rows, fields) => {
    const { fresh, old } = both(rows, fields)

    expect(fresh).toBe(old)
  })

  it("10 行を超える表は 10 行で切り、「ほか n 件」を押すと全行が出る", () => {
    const { container } = renderPart(pair(MANY).part)

    expect(container.querySelectorAll("tbody tr")).toHaveLength(11)
    fireEvent.click(screen.getByRole("button", { name: /ほか 2 件/ }))
    expect(container.querySelectorAll("tbody tr")).toHaveLength(12)
  })

  it("入力のセルの字が全部描画に残る（期待する字が欠けたら落ちる）", () => {
    const rows: TablePart["rows"] = [
      ["架空のA", { status: "ok", text: "良好" }, { from: "3", to: "5" }, { tag: "札" }],
      ["架空のB", "5", "6", "7"],
    ]
    const { part } = pair(rows, { columns: ["名前", "状態", "変化", "札"] })
    const text = textOf(part)
    const expected = rows.flatMap((row) =>
      (Array.isArray(row) ? row : row.cells).flatMap(tableCellTexts),
    )

    expect(expected.filter((word) => !text.includes(word))).toEqual([])
    expect(["存在しない字"].filter((word) => !text.includes(word))).toEqual(["存在しない字"])
  })

  it("整形で落ちた表（葉の値が無い）は何も描かない", () => {
    const { part } = pair(SIMPLE)
    const view = directLeafViewOf(part)
    if (view === undefined) {
      throw new Error("Table の部品が一覧に無い")
    }
    const { container } = render(
      <div data-report-region="section">
        <DirectLeaf part={part} value={undefined} imageSource={{ kind: "none" }} view={view} />
      </div>,
    )

    expect(container.querySelector("table")).toBeNull()
  })

  it("状態の印は role=img と状態の語を持つ", () => {
    const { part } = pair([
      ["架空のA", { status: "warn", text: "注意" }],
      ["架空のB", { status: "ng", text: "不良" }],
    ])
    renderPart(part)

    expect(screen.getByRole("img", { name: "要注意" }).textContent).toBe("！")
    expect(screen.getByRole("img", { name: "NG" }).textContent).toBe("✕")
  })
})

const PLAIN_VALUE: LeafValue = {
  captionNumber: { kind: "none" },
  tagTones: {},
  gutterNotes: [],
  mergedIntoPrevious: false,
  children: [],
}

function renderPart(part: ReturnType<typeof pair>["part"]) {
  const view = directLeafViewOf(part)
  if (view === undefined) {
    throw new Error("Table の部品が一覧に無い")
  }
  return render(
    <div data-report-region="section">
      <DirectLeaf part={part} value={PLAIN_VALUE} imageSource={{ kind: "none" }} view={view} />
    </div>,
  )
}

function textOf(part: ReturnType<typeof pair>["part"]): string {
  return renderPart(part).container.textContent ?? ""
}
