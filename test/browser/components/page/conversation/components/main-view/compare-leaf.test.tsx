import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import {
  DirectLeaf,
  directLeafViewOf,
} from "../../../../../../../src/browser/components/page/conversation/components/main-view/direct-leaf-view.tsx"
import { loadMarkdown } from "../../../../../../../src/browser/features/report/markdown.tsx"
import type { A2uiReportComponent } from "../../../../../../../src/shared/report/a2ui-report-catalog.ts"
import type { LeafValue } from "../../../../../../../src/shared/report/report-leaf-value.ts"
import { newLeafHtml, oldLeafHtml } from "../../../../../../fixture/direct-leaf-compare.tsx"

beforeAll(async () => {
  await loadMarkdown()
})

afterEach(() => {
  cleanup()
})

type ComparePart = Extract<A2uiReportComponent, { readonly component: "Compare" }>

type CompareFields = { title?: string; fold?: string; aside?: string }

type PointsSide = { kind: "points"; heading: string; points: string[] }

function pair(sides: PointsSide[], fields: CompareFields = {}) {
  const base = {
    title: fields.title ?? "",
    relation: "versus",
    sides,
    fold: fields.fold ?? "",
    aside: fields.aside ?? "",
  } as const
  const part: ComparePart = { id: "c1", component: "Compare", ...base }
  return { block: { kind: "compare", ...base } as const, part }
}

function both(sides: PointsSide[], fields: CompareFields = {}) {
  const { block, part } = pair(sides, fields)
  return { fresh: newLeafHtml(block, part), old: oldLeafHtml(block) }
}

const SIDES: PointsSide[] = [
  { kind: "points", heading: "架空の案A", points: ["架空の利点", "架空の `a.ts` の欠点"] },
  { kind: "points", heading: "架空の案B", points: ["架空の別の点"] },
]

const [FIRST_SIDE = { kind: "points", heading: "", points: [] }] = SIDES

const MANY_POINTS: PointsSide[] = [
  {
    kind: "points",
    heading: "架空の案A",
    points: Array.from({ length: 12 }, (_, index) => `架空の点${String(index + 1)}`),
  },
  { kind: "points", heading: "架空の案B", points: ["架空の別の点"] },
]

const PLAIN_VALUE: LeafValue = {
  captionNumber: { kind: "none" },
  tagTones: {},
  gutterNotes: [],
  mergedIntoPrevious: false,
}

type CodeSide = Extract<ComparePart["sides"][number], { readonly kind: "code" }>

function codePart(
  relation: ComparePart["relation"],
  before: ComparePart["sides"][number],
  after: ComparePart["sides"][number],
): ComparePart {
  return {
    id: "c1",
    component: "Compare",
    title: "",
    relation,
    sides: [before, after],
    fold: "",
    aside: "",
  }
}

function renderPart(part: ComparePart) {
  const view = directLeafViewOf(part)
  if (view === undefined) {
    throw new Error("Compare の部品が一覧に無い")
  }
  return render(
    <div data-report-region="section">
      <DirectLeaf part={part} value={PLAIN_VALUE} imageSource={{ kind: "none" }} view={view} />
    </div>,
  )
}

describe("Compare の部品", () => {
  it.each<[string, PointsSide[], CompareFields]>([
    ["2 つの側", SIDES, {}],
    ["題つき", SIDES, { title: "架空の `b.ts` の見比べ" }],
    [
      "見出しの inline code",
      [{ kind: "points", heading: "`x`", points: ["架空"] }, SIDES[1] ?? FIRST_SIDE],
      {},
    ],
    ["fold", SIDES, { fold: "架空の畳み" }],
    ["fold と題と欄外注", SIDES, { fold: "架空の畳み", title: "架空の題", aside: "架空の欄外注" }],
    ["箇条が 12 項目の側", MANY_POINTS, {}],
    [
      "太字の記号は効かせず字のまま",
      [{ kind: "points", heading: "**A**", points: ["**x**"] }, SIDES[1] ?? FIRST_SIDE],
      {},
    ],
  ])("%s は旧い描き方と同じ DOM", (_, sides, fields) => {
    const { fresh, old } = both(sides, fields)

    expect(fresh).toBe(old)
  })

  it("12 項目の箇条は 10 項目で切り、「ほか 2 件」を押すと全部出る", () => {
    const { container } = renderPart(pair(MANY_POINTS).part)

    expect(container.querySelectorAll("li")).toHaveLength(12 - 2 + 1 + 1)
    fireEvent.click(screen.getByRole("button", { name: /ほか 2 件/ }))
    expect(container.querySelectorAll("li")).toHaveLength(12 + 1)
  })

  it("入力の見出しと箇条の字が全部描画に残る（期待する字が欠けたら落ちる）", () => {
    const { container } = renderPart(pair(SIDES).part)
    const text = container.textContent ?? ""
    const expected = SIDES.flatMap((side) => [
      side.heading,
      ...side.points.map((p) => p.replaceAll("`", "")),
    ])

    expect(expected.filter((word) => !text.includes(word))).toEqual([])
    expect(["存在しない字"].filter((word) => !text.includes(word))).toEqual(["存在しない字"])
  })

  describe("両側が code", () => {
    const BEFORE_YAML: CodeSide = {
      kind: "code",
      heading: "",
      language: "yaml",
      source: "retry:\n  max: 3\n  backoff: 200ms\ntimeout: 5s\n",
    }
    const AFTER_YAML: CodeSide = {
      kind: "code",
      heading: "",
      language: "yaml",
      source: "retry:\n  max: 5\n  backoff: 200ms\n  jitter: true\ntimeout: 5s\n",
    }

    const LEGEND_BEFORE = "変えた行（前）"

    function sideRows(container: HTMLElement, side: "before" | "after"): Element[] {
      return Array.from(container.querySelectorAll(`[data-side="${side}"] pre code > span`))
    }

    it("前後なら、変えた行・足した行に印、向かいに空の行、足した行に「新設」の札、図の下に凡例が出る", () => {
      const { container } = renderPart(codePart("before-after", BEFORE_YAML, AFTER_YAML))

      expect(sideRows(container, "before").map((row) => row.getAttribute("data-compare"))).toEqual([
        null,
        "before",
        null,
        "gap",
        null,
      ])
      expect(sideRows(container, "after").map((row) => row.getAttribute("data-compare"))).toEqual([
        null,
        "after",
        null,
        "added",
        null,
      ])
      expect(screen.getAllByText("新設")).toHaveLength(1)
      expect(sideRows(container, "after")[3]?.textContent).toBe("  jitter: true新設")
      expect(screen.getByText(LEGEND_BEFORE)).toBeTruthy()
      expect(screen.getByText("変えた・足した行（後）")).toBeTruthy()
    })

    it("対等な2つなら印も凡例も無い", () => {
      const { container } = renderPart(codePart("versus", BEFORE_YAML, AFTER_YAML))

      expect(container.querySelector("[data-compare]")).toBeNull()
      expect(screen.queryByText(LEGEND_BEFORE)).toBeNull()
    })

    it("前後で片側だけが code なら印も凡例も無い", () => {
      const points: ComparePart["sides"][number] = {
        kind: "points",
        heading: "",
        points: ["架空の点"],
      }
      const { container } = renderPart(codePart("before-after", points, AFTER_YAML))

      expect(container.querySelector("[data-compare]")).toBeNull()
      expect(screen.queryByText(/行（後）/)).toBeNull()
    })

    it("前後で全部同じなら凡例を出さない", () => {
      renderPart(codePart("before-after", BEFORE_YAML, BEFORE_YAML))

      expect(screen.queryByText(/行（[前後]）/)).toBeNull()
    })
  })

  it("整形で落ちた見比べ（内容部品の値が無い）は何も描かない", () => {
    const { part } = pair(SIDES)
    const view = directLeafViewOf(part)
    if (view === undefined) {
      throw new Error("Compare の部品が一覧に無い")
    }
    const { container } = render(
      <div data-report-region="section">
        <DirectLeaf part={part} value={undefined} imageSource={{ kind: "none" }} view={view} />
      </div>,
    )

    expect(container.querySelector("ul")).toBeNull()
  })
})
