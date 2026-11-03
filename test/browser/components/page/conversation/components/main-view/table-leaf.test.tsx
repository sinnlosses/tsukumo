import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import {
  DirectLeaf,
  directLeafViewOf,
} from "../../../../../../../src/browser/components/page/conversation/components/main-view/direct-leaf-view.tsx"
import { TableFigure } from "../../../../../../../src/browser/components/page/conversation/components/main-view/table-leaf.tsx"
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
  emphasisColumn?: number
}

function pair(rows: TablePart["rows"], fields: TableFields = {}) {
  const base = {
    title: fields.title ?? "",
    columns: fields.columns ?? ["名前", "件数"],
    rows,
    rest: fields.rest ?? "",
    fold: fields.fold ?? "",
    aside: fields.aside ?? "",
    emphasisColumn: fields.emphasisColumn,
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
    ["強調の列", SIMPLE, { emphasisColumn: 1 }],
    [
      "強調の列と強調の行が重なる",
      [{ cells: ["架空のA", "10"], emphasis: true }, ["架空のB", "5"]],
      { emphasisColumn: 0 },
    ],
    ["rest", SIMPLE, { rest: "ほか 3 件は `x.ts` に省略" }],
    ["fold", SIMPLE, { fold: "架空の畳み" }],
    ["fold と題と欄外注", SIMPLE, { fold: "架空の畳み", title: "架空の題", aside: "架空の欄外注" }],
    ["欄外注", SIMPLE, { aside: "架空の欄外注" }],
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

  it("強調の列は見出しと各データセルに印を1つずつ置き、欄を書かない表には置かない", () => {
    const marks = (html: string) => html.match(/column-emphasis-mark/g)?.length ?? 0

    expect(marks(both(SIMPLE, { emphasisColumn: 1 }).fresh)).toBe(3)
    expect(marks(both(SIMPLE).fresh)).toBe(0)
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

describe("Table の行の詳しい中身", () => {
  const DETAILED: TablePart["rows"] = [
    ["架空のA", "1"],
    { cells: ["架空のB", "2"], detail: "Bの詳しい中身" },
    ["架空のC", "3"],
    { cells: ["架空のD", "4"], emphasis: true, detail: "Dの詳しい中身" },
    ["架空のE", "5"],
  ]
  const toggles = (container: HTMLElement) =>
    [...container.querySelectorAll("button[aria-expanded]")].filter(
      (element) => element instanceof HTMLButtonElement,
    )

  it("detail のある行だけに閉じた状態の押しボタンが出て、中身はまだ出ない", () => {
    const { container } = renderPart(pair(DETAILED).part)

    expect(toggles(container).map((button) => button.getAttribute("aria-expanded"))).toEqual([
      "false",
      "false",
    ])
    expect(container.textContent).not.toContain("Bの詳しい中身")
  })

  it("押すと行の直下に全列を通した 1 行で中身が出て、もう一度押すと閉じる", () => {
    const { container } = renderPart(pair(DETAILED).part)
    const [first] = toggles(container)
    if (first === undefined) {
      throw new Error("押しボタンが無い")
    }
    fireEvent.click(first)

    const detailCell = first.closest("tr")?.nextElementSibling?.querySelector("td")
    expect(first.getAttribute("aria-expanded")).toBe("true")
    expect(detailCell?.getAttribute("colspan")).toBe("2")
    expect(detailCell?.textContent).toBe("Bの詳しい中身")
    fireEvent.click(first)
    expect(container.textContent).not.toContain("Bの詳しい中身")
  })

  it("detail を書かない表には押しボタンを出さない", () => {
    expect(toggles(renderPart(pair(SIMPLE).part).container)).toEqual([])
  })

  it("並べ替え・絞り込みで行の順が変わっても、開いた中身は元の行に付いている", () => {
    const { part } = pair(DETAILED)
    const view = (rowOrder: readonly number[]) => (
      <div data-report-region="section">
        <TableFigure part={part} value={PLAIN_VALUE} rowOrder={rowOrder} />
      </div>
    )
    const { container, rerender } = render(view([0, 1, 2, 3, 4]))
    const [, second] = toggles(container)
    if (second === undefined) {
      throw new Error("押しボタンが無い")
    }
    fireEvent.click(second)
    expect(container.textContent).toContain("Dの詳しい中身")

    rerender(view([4, 3, 1, 0]))
    const rows = [...container.querySelectorAll("tbody tr")].map((row) => row.textContent)
    expect(rows).toEqual(["架空のE5", "▾架空のD4", "Dの詳しい中身", "▸架空のB2", "架空のA1"])
    expect(toggles(container).map((button) => button.getAttribute("aria-expanded"))).toEqual([
      "true",
      "false",
    ])
  })

  it("10 行の畳みは中身の行を数えず、畳まれた行の押しボタンは「ほか n 件」のあとに出る", () => {
    const rows: TablePart["rows"] = Array.from({ length: 12 }, (_, index) =>
      index === 0 || index === 11
        ? { cells: [`架空の行${String(index + 1)}`, "1"], detail: "架空の中身" }
        : [`架空の行${String(index + 1)}`, "1"],
    )
    const { container } = renderPart(pair(rows).part)

    expect(toggles(container)).toHaveLength(1)
    fireEvent.click(toggles(container)[0] ?? container)
    expect(container.querySelectorAll("tbody tr")).toHaveLength(12)
    fireEvent.click(screen.getByRole("button", { name: /ほか 2 件/ }))
    expect(toggles(container)).toHaveLength(2)
    expect(container.querySelectorAll("tbody tr")).toHaveLength(13)
  })
})

describe("Table の濃淡と合計", () => {
  const WEEK: TablePart = {
    id: "week",
    component: "Table",
    title: "",
    columns: ["曜日", "0-6", "6-12", "12-18"],
    rows: [
      ["月", "2", "9", "6"],
      ["火", "1", "12", "8"],
      ["水", "3", "41", "22"],
    ],
    rest: "",
    fold: "",
    aside: "",
    heat: { from: 1, to: 3 },
    totals: true,
  }
  const levelOf = (cell: Element | undefined) =>
    /report-heat-(\d)/.exec(cell?.innerHTML ?? "")?.[1] ?? "なし"

  it("範囲のセルに段の印を置き、最大のセルにだけ山の印を置き、棒は出さない", () => {
    const { container } = renderPart(WEEK)
    const cells = [...container.querySelectorAll("tbody tr:nth-child(3) td")]

    expect(cells.map(levelOf)).toEqual(["なし", "0", "5", "3", "なし"])
    expect(container.querySelectorAll("[class*='report-heat-peak']")).toHaveLength(1)
    expect(container.querySelector("[class*='report-cell-bar']")).toBeNull()
    expect(container.querySelector("[class*='report-heat-legend']")?.textContent).toBe(
      "少多（最大 41 に枠）",
    )
  })

  it("見出しの右に「計」の列、本体の下に列の合計の行を出す", () => {
    const { container } = renderPart(WEEK)
    const textsOf = (selector: string) =>
      [...container.querySelectorAll(selector)].map((cell) => cell.textContent)

    expect(textsOf("thead th")).toEqual(["曜日", "0-6", "6-12", "12-18", "計"])
    expect(textsOf("tbody td:last-child")).toEqual(["17", "21", "66"])
    expect(textsOf("tfoot td")).toEqual(["計", "6", "62", "36", "104"])
  })

  it("並べ替え・絞り込みのあとも合計の行は最後に残り、見せる行だけを足す", () => {
    const { container } = render(
      <div data-report-region="section">
        <TableFigure part={WEEK} value={PLAIN_VALUE} rowOrder={[2, 0]} />
      </div>,
    )
    const rows = [...container.querySelectorAll("tr")].map((row) => row.textContent)

    expect(rows.at(-1)).toBe("計5502883")
    expect(rows.slice(1, -1)).toEqual(["水3412266", "月29617"])
  })

  it("濃淡も合計も書かない表には印も合計も出さない", () => {
    const { container } = renderPart({ ...WEEK, heat: undefined, totals: undefined })

    expect(container.querySelector("[class*='report-heat']")).toBeNull()
    expect(container.querySelector("tfoot")).toBeNull()
  })
})

const PLAIN_VALUE: LeafValue = {
  captionNumber: { kind: "none" },
  tagTones: {},
  gutterNotes: [],
  mergedIntoPrevious: false,
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
