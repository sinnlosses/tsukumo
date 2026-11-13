import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import {
  DirectLeaf,
  directLeafViewOf,
} from "../../../../../src/browser/features/report/leaf/direct-leaf-view.tsx"
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

    function codeRows(container: HTMLElement): string[] {
      return Array.from(container.querySelectorAll("pre code > span")).map(
        (row) => row.textContent ?? "",
      )
    }

    it("前後なら、1つの diff に重ねて、前の行に - と後の行に + の印が付く", () => {
      const { container } = renderPart(codePart("before-after", BEFORE_YAML, AFTER_YAML))

      expect(codeRows(container)).toEqual([
        " retry:",
        "-  max: 3",
        "+  max: 5",
        "   backoff: 200ms",
        "+  jitter: true",
        " timeout: 5s",
      ])
    })

    it("対等な2つなら重ねず、側ごとにそのまま描く", () => {
      const { container } = renderPart(codePart("versus", BEFORE_YAML, AFTER_YAML))

      expect(
        container.querySelectorAll('[data-side="before"] pre, [data-side="after"] pre'),
      ).toHaveLength(2)
      expect(container.textContent).not.toContain("+  max: 5")
    })

    it("前後で片側だけが code なら重ねない", () => {
      const points: ComparePart["sides"][number] = {
        kind: "points",
        heading: "",
        points: ["架空の点"],
      }
      const { container } = renderPart(codePart("before-after", points, AFTER_YAML))

      expect(container.textContent).not.toContain("+  max: 5")
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
