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

type ComparePart = Extract<A2uiReportComponent, { readonly component: "Compare" }>

type CompareFields = { title?: string; fold?: string; aside?: string }

function pair(sides: ComparePart["sides"], fields: CompareFields = {}) {
  const base = {
    title: fields.title ?? "",
    sides,
    fold: fields.fold ?? "",
    aside: fields.aside ?? "",
  }
  const part: ComparePart = { id: "c1", component: "Compare", ...base }
  return { block: { kind: "compare", ...base } as const, part }
}

function both(sides: ComparePart["sides"], fields: CompareFields = {}) {
  const { block, part } = pair(sides, fields)
  return { fresh: newLeafHtml(block, part), old: oldLeafHtml(block) }
}

const SIDES: ComparePart["sides"] = [
  { heading: "架空の案A", points: ["架空の利点", "架空の `a.ts` の欠点"] },
  { heading: "架空の案B", points: ["架空の別の点"] },
]

const MANY_POINTS: ComparePart["sides"] = [
  {
    heading: "架空の案A",
    points: Array.from({ length: 12 }, (_, index) => `架空の点${String(index + 1)}`),
  },
  { heading: "架空の案B", points: ["架空の別の点"] },
]

const PLAIN_VALUE: LeafValue = {
  captionNumber: { kind: "none" },
  tagTones: {},
  gutterNotes: [],
  mergedIntoPrevious: false,
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
  it.each<[string, ComparePart["sides"], CompareFields]>([
    ["2 つの側", SIDES, {}],
    ["題つき", SIDES, { title: "架空の `b.ts` の見比べ" }],
    ["見出しの inline code", [{ heading: "`x`", points: ["架空"] }, SIDES[1] ?? SIDES[0]!], {}],
    ["fold", SIDES, { fold: "架空の畳み" }],
    ["fold と題と傍注", SIDES, { fold: "架空の畳み", title: "架空の題", aside: "架空の傍注" }],
    ["箇条が 12 項目の側", MANY_POINTS, {}],
    [
      "太字の記号は効かせず字のまま",
      [{ heading: "**A**", points: ["**x**"] }, SIDES[1] ?? SIDES[0]!],
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

  it("整形で落ちた見比べ（葉の値が無い）は何も描かない", () => {
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
