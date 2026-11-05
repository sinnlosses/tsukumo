import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import {
  DirectLeaf,
  directLeafViewOf,
} from "../../../../../../../src/browser/components/page/conversation/components/main-view/direct-leaf-view.tsx"
import { loadMarkdown } from "../../../../../../../src/browser/components/page/conversation/components/markdown/markdown.tsx"
import type { A2uiReportComponent } from "../../../../../../../src/shared/report/a2ui-report-catalog.ts"
import type { LeafValue } from "../../../../../../../src/shared/report/report-leaf-value.ts"

beforeAll(async () => {
  await loadMarkdown()
})

afterEach(() => {
  cleanup()
})

type MatrixPart = Extract<A2uiReportComponent, { readonly component: "Matrix" }>

function partOf(rows: MatrixPart["rows"]): MatrixPart {
  return {
    id: "m1",
    component: "Matrix",
    title: "",
    columns: ["甲", "乙"],
    rows,
    fold: "",
    aside: "",
  }
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
  it("交点の印は role=img と状態の語を持ち、数は行 × 列と一致する", () => {
    renderPart(partOf(ALL_STATUSES))

    expect(screen.getAllByRole("img")).toHaveLength(4)
    expect(screen.getByRole("img", { name: "要注意" }).textContent).toBe("！")
    expect(screen.getByRole("img", { name: "該当なし" }).textContent).toBe("－")
  })

  it("入力の行名・列名が全部描画に残り、凡例の印は読み上げから隠す", () => {
    const { container } = renderPart(partOf(ALL_STATUSES))
    const text = container.textContent ?? ""

    expect(["甲", "乙", "架空のA", "架空のB"].filter((word) => !text.includes(word))).toEqual([])
    expect(["存在しない字"].filter((word) => !text.includes(word))).toEqual(["存在しない字"])
    expect(container.querySelectorAll("[aria-hidden='true']")).toHaveLength(4)
  })

  it("補足のセルは印の下に補足の字を出し、読み上げの語に補足を括弧で添える", () => {
    const { container } = renderPart(
      partOf([{ name: "架空のA", cells: ["ok", { status: "warn", note: "7日まで" }] }]),
    )

    expect(screen.getByRole("img", { name: "要注意（7日まで）" }).textContent).toBe("！")
    expect(container.querySelector("[class*='matrix-note']")?.textContent).toBe("7日まで")
  })

  it("採った列は見出しに「推奨」の札を付け、見出し・セル・末尾の行のその列に印を置く", () => {
    const { container } = renderPart({
      ...partOf(ALL_STATUSES),
      emphasisColumn: 1,
      footer: [{ name: "月額", cells: ["100円", "200円"] }],
    })
    const markedTexts = Array.from(
      container.querySelectorAll("th, td"),
      (cell) => cell.querySelector("[class*='column-emphasis-mark']") !== null,
    )

    expect(container.querySelector("thead [data-tone='accent']")?.textContent).toBe("推奨")
    expect(markedTexts.filter(Boolean)).toHaveLength(4)
    expect(Array.from(container.querySelectorAll("tfoot td"), (cell) => cell.textContent)).toEqual([
      "月額",
      "100円",
      "200円",
    ])
  })

  it("補足・採った列・末尾の行の無い格子は、札・補足・tfoot を出さない", () => {
    const { container } = renderPart(partOf(ALL_STATUSES))

    expect(
      container.querySelectorAll(
        "[data-tone='accent'], [class*='matrix-note'], [class*='column-emphasis-mark'], tfoot",
      ),
    ).toHaveLength(0)
  })

  it("11 行以上の格子は 10 行で切り、「ほか n 件」を押すと全行が出る", () => {
    const { container } = renderPart(partOf(MANY))

    expect(container.querySelectorAll("tbody tr")).toHaveLength(11)
    fireEvent.click(screen.getByRole("button", { name: /ほか 2 件/ }))
    expect(container.querySelectorAll("tbody tr")).toHaveLength(12)
  })

  it("整形で落ちた格子（内容部品の値が無い）は何も描かない", () => {
    const part = partOf(ALL_STATUSES)
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
