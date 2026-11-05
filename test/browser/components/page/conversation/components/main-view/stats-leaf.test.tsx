import { cleanup, render } from "@testing-library/react"
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

type StatsPart = Extract<A2uiReportComponent, { readonly component: "Stats" }>
type Item = StatsPart["items"][number]

function item(fields: Partial<Item> & { readonly label: string; readonly value: string }): Item {
  return { before: "", total: "", series: [], better: "", target: "", targetGap: "", ...fields }
}

function partOf(items: StatsPart["items"]): StatsPart {
  return { id: "s1", component: "Stats", items, fold: "", aside: "" }
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
}

function renderStats(items: StatsPart["items"]): HTMLElement {
  const part = partOf(items)
  const view = directLeafViewOf(part)
  if (view === undefined) {
    throw new Error("Stats の部品が一覧に無い")
  }
  return render(
    <div data-report-region="section">
      <DirectLeaf part={part} value={PLAIN_VALUE} imageSource={{ kind: "none" }} view={view} />
    </div>,
  ).container
}

/** 札（数の `<b>` を持つ要素）ごとの字。 */
function cardTextsOf(items: StatsPart["items"]): string[] {
  return [...renderStats(items).querySelectorAll("b")].map(
    (value) => value.parentElement?.textContent ?? "",
  )
}

describe("Stats の部品", () => {
  it("入力の項目の数だけ札が残り、ラベルの字が全部描画に残る", () => {
    const container = renderStats(THREE)
    const text = container.textContent ?? ""

    expect(container.querySelectorAll("b")).toHaveLength(THREE.length)
    expect(THREE.filter((entry) => !text.includes(entry.label))).toEqual([])
    expect(["存在しない字"].filter((word) => !text.includes(word))).toEqual(["存在しない字"])
  })

  it("前の値と全体は、inline code が無ければ1つの text ノードで描く（旧い描き方と同じ並び）", () => {
    const container = renderStats([
      item({ before: "12", value: "9", total: "48", label: "架空の落ちた件数" }),
      item({ value: "1", label: "架空の一" }),
      item({ value: "2", label: "架空の二" }),
    ])

    const nodeTexts = (selector: string) =>
      [...(container.querySelector(selector)?.childNodes ?? [])].map((node) => node.textContent)
    expect(nodeTexts("b > span")).toEqual([" / 48"])
    expect(nodeTexts("b")).toEqual(["9", " / 48"])
    expect(nodeTexts("div > span:first-child")).toEqual(["12 →"])
  })

  it("目標のある札は達否の印を、目標の無い札は「目標なし」を、札ごとの字に持つ", () => {
    const texts = cardTextsOf([
      item({
        value: "99.82%",
        label: "架空の率",
        better: "up",
        target: "99.9%",
        targetGap: "−0.08pt",
      }),
      item({ value: "420ms", label: "架空の所要", better: "down", target: "500ms" }),
      item({ value: "312 件", label: "架空の件数" }),
    ])

    expect(texts).toEqual([
      "99.82%架空の率目標 99.9% 以上✕ 未達 −0.08pt",
      "420ms架空の所要目標 500ms 以下✓ 達成",
      "312 件架空の件数目標なし",
    ])
  })

  it("比べられない目標は目標の行だけを出し、達否の印を出さない", () => {
    const texts = cardTextsOf([
      item({ value: "99.82%", label: "架空の率", target: "99.9%", targetGap: "−0.08pt" }),
      item({ value: "1", label: "架空の一" }),
      item({ value: "2", label: "架空の二" }),
    ])

    expect(texts[0]).toBe("99.82%架空の率目標 99.9%")
  })

  it("どの項目にも目標が無ければ、目標の行を出さない", () => {
    expect(cardTextsOf(THREE)).toEqual(["8架空の件数", "0架空の失敗", "12架空の秒"])
  })

  it("整形で落ちた数（内容部品の値が無い）は何も描かない", () => {
    const part = partOf(THREE)
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
