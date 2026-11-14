import { cleanup, render } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import {
  DirectLeaf,
  directLeafViewOf,
} from "../../../../../src/browser/features/report/leaf/direct-leaf-view.tsx"
import {
  loadMarkdown,
  statsLeafClassNames,
} from "../../../../../src/browser/features/report/markdown.tsx"
import type { A2uiReportComponent } from "../../../../../src/shared/report/a2ui-report-catalog.ts"
import type { LeafValue } from "../../../../../src/shared/report/report-leaf-value.ts"

beforeAll(async () => {
  await loadMarkdown()
})

afterEach(() => {
  cleanup()
})

type StatsPart = Extract<A2uiReportComponent, { readonly component: "Stats" }>
type Item = StatsPart["items"][number]

function item(fields: Partial<Item> & { readonly label: string; readonly value: string }): Item {
  return {
    before: "",
    total: "",
    series: [],
    better: "",
    target: "",
    targetGap: "",
    change: "",
    ...fields,
  }
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

  it("目標のある札は達否の印を持ち、目標の無い札は目標の行を出さない", () => {
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
      "312 件架空の件数",
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

  it("差の印は増減の記号と字を出し、向きの class を better に従って付ける", () => {
    const container = renderStats([
      item({
        value: "34.5",
        before: "32.3",
        better: "up",
        label: "架空の売上",
        change: "+6.9%",
      }),
      item({
        value: "37",
        before: "42",
        better: "down",
        label: "架空の件数",
        change: "−5件（−11.9%）",
      }),
      item({ value: "9", before: "5", better: "down", label: "架空の失敗", change: "+4件" }),
      item({ value: "3件", before: "3件", better: "", label: "架空の保留", change: "変化なし" }),
    ])
    const changes = [...container.querySelectorAll("b + span")].map((node) => ({
      text: node.textContent,
      better: node.classList.contains(statsLeafClassNames.statChangeBetter ?? "?"),
      worse: node.classList.contains(statsLeafClassNames.statChangeWorse ?? "?"),
      base: node.classList.contains(statsLeafClassNames.statChange ?? "?"),
    }))

    expect(changes).toEqual([
      { text: "▲ +6.9%", better: true, worse: false, base: true },
      { text: "▼ −5件（−11.9%）", better: true, worse: false, base: true },
      { text: "▲ +4件", better: false, worse: true, base: true },
      { text: "変化なし", better: false, worse: false, base: true },
    ])
  })

  it("差の字が空なら差の印を出さない", () => {
    expect(renderStats(THREE).querySelectorAll("b + span")).toHaveLength(0)
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
