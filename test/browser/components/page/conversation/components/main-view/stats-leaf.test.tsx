import { cleanup, render } from "@testing-library/react"
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

type StatsPart = Extract<A2uiReportComponent, { readonly component: "Stats" }>
type Item = StatsPart["items"][number]

type StatsFields = { fold?: string; aside?: string }

function item(fields: Partial<Item> & { readonly label: string; readonly value: string }): Item {
  return { before: "", total: "", series: [], better: "", ...fields }
}

function pair(items: StatsPart["items"], fields: StatsFields = {}) {
  const base = { items, fold: fields.fold ?? "", aside: fields.aside ?? "" }
  const part: StatsPart = { id: "s1", component: "Stats", ...base }
  return { block: { kind: "stats", ...base } as const, part }
}

function both(items: StatsPart["items"], fields: StatsFields = {}) {
  const { block, part } = pair(items, fields)
  return { fresh: newLeafHtml(block, part), old: oldLeafHtml(block) }
}

const THREE: StatsPart["items"] = [
  item({ value: "8", label: "架空の件数" }),
  item({ value: "0", label: "架空の失敗" }),
  item({ value: "12", label: "架空の秒" }),
]

const PLAIN_VALUE: LeafValue = {
  captionNumber: { kind: "none" },
  tagTones: {},
  gutterNotes: [],
  mergedIntoPrevious: false,
  children: [],
}

describe("Stats の部品", () => {
  it.each<[string, StatsPart["items"], StatsFields]>([
    ["3 項目", THREE, {}],
    ["4 項目", [...THREE, item({ value: "1", label: "架空の四つ目" })], {}],
    [
      "before の増減（better が up / down / 無し × 良くなった・悪くなった・同じ・数でない）",
      [
        item({ before: "5", value: "8", better: "up", label: "架空の甲" }),
        item({ before: "8", value: "5", better: "up", label: "架空の乙" }),
        item({ before: "8", value: "5", better: "down", label: "架空の丙" }),
        item({ before: "5", value: "5", better: "up", label: "架空の丁" }),
      ],
      {},
    ],
    [
      "before の増減（残り）",
      [
        item({ before: "約5", value: "8", better: "up", label: "架空の戊" }),
        item({ before: "5", value: "8", label: "架空の己" }),
        item({ before: "8", value: "5", better: "down", label: "架空の丙" }),
      ],
      {},
    ],
    [
      "total と帯（収まる・超える・0）",
      [
        item({ value: "3", total: "12", label: "架空の収まる" }),
        item({ value: "13", total: "12", label: "架空の超える" }),
        item({ value: "3", total: "0", label: "架空のゼロ" }),
      ],
      {},
    ],
    [
      "series（2 点・3 点以上・全部同じ）",
      [
        item({ value: "3", series: [1, 2], label: "架空の二点" }),
        item({ value: "3", series: [1, 5, 2, 8], label: "架空の推移" }),
        item({ value: "3", series: [4, 4, 4], label: "架空の平ら" }),
      ],
      {},
    ],
    [
      "値・全体・ラベルの inline code",
      [
        item({ value: "`3`", total: "`9`", label: "架空の `a<b` 件" }),
        item({ value: "0", label: "架空の失敗" }),
        item({ value: "1", label: "架空の一" }),
      ],
      {},
    ],
    ["fold", THREE, { fold: "架空の畳み" }],
    ["fold と傍注", THREE, { fold: "架空の畳み", aside: "架空の傍注" }],
  ])("%s は旧い描き方と同じ DOM", (_, items, fields) => {
    const { fresh, old } = both(items, fields)

    expect(fresh).toBe(old)
  })

  it("入力の項目の数だけ札が残り、ラベルの字が全部描画に残る", () => {
    const { part } = pair(THREE)
    const view = directLeafViewOf(part)
    if (view === undefined) {
      throw new Error("Stats の部品が一覧に無い")
    }
    const { container } = render(
      <div data-report-region="section">
        <DirectLeaf part={part} value={PLAIN_VALUE} imageSource={{ kind: "none" }} view={view} />
      </div>,
    )
    const text = container.textContent ?? ""

    expect(container.querySelectorAll("b")).toHaveLength(THREE.length)
    expect(THREE.filter((entry) => !text.includes(entry.label))).toEqual([])
    expect(["存在しない字"].filter((word) => !text.includes(word))).toEqual(["存在しない字"])
  })

  it("前の値と全体は、inline code が無ければ1つの text ノードで描く（旧い描き方と同じ並び）", () => {
    const { part } = pair([
      item({ before: "12", value: "9", total: "48", label: "架空の落ちた件数" }),
      item({ value: "1", label: "架空の一" }),
      item({ value: "2", label: "架空の二" }),
    ])
    const view = directLeafViewOf(part)
    if (view === undefined) {
      throw new Error("Stats の部品が一覧に無い")
    }
    const { container } = render(
      <div data-report-region="section">
        <DirectLeaf part={part} value={PLAIN_VALUE} imageSource={{ kind: "none" }} view={view} />
      </div>,
    )

    const nodeTexts = (selector: string) =>
      [...(container.querySelector(selector)?.childNodes ?? [])].map((node) => node.textContent)
    expect(nodeTexts("b > span")).toEqual([" / 48"])
    expect(nodeTexts("b")).toEqual(["9", " / 48"])
    expect(nodeTexts("div > span:first-child")).toEqual(["12 →"])
  })

  it("整形で落ちた数（葉の値が無い）は何も描かない", () => {
    const { part } = pair(THREE)
    const view = directLeafViewOf(part)
    if (view === undefined) {
      throw new Error("Stats の部品が一覧に無い")
    }
    const { container } = render(
      <div data-report-region="section">
        <DirectLeaf part={part} value={undefined} imageSource={{ kind: "none" }} view={view} />
      </div>,
    )

    expect(container.querySelector("b")).toBeNull()
  })
})
