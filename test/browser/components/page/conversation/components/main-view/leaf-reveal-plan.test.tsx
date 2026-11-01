import { cleanup, render } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import {
  DirectLeaf,
  directLeafViewOf,
} from "../../../../../../../src/browser/components/page/conversation/components/main-view/direct-leaf-view.tsx"
import { loadMarkdown } from "../../../../../../../src/browser/components/page/conversation/components/markdown/markdown.tsx"
import { revealTimingOf } from "../../../../../../../src/browser/domain/reveal-speed.ts"
import { planReveal } from "../../../../../../../src/browser/domain/reveal/plan.ts"
import type { A2uiReportComponent } from "../../../../../../../src/shared/report/a2ui-report-catalog.ts"
import type { ReportBlock } from "../../../../../../../src/shared/report/report-block.ts"
import { reportLeafLayoutOf } from "../../../../../../../src/shared/report/report-leaf-value.ts"
import { stubIntersectionObserver } from "../../../../../../fixture/intersection.ts"

vi.mock(
  "../../../../../../../src/browser/components/page/conversation/components/markdown/renderer/vendor-script.ts",
  () => ({ loadVendorScript: () => new Promise(() => {}), preloadVendorScript: () => {} }),
)

beforeAll(async () => {
  stubIntersectionObserver(false)
  await loadMarkdown()
})

afterEach(() => {
  cleanup()
})

const NO_IMAGES = { kind: "none" } as const

type LeafPair = {
  readonly block: ReportBlock
  readonly part: A2uiReportComponent
}

const LONG_TEXT = "架空の地の文。長めの文で、実在の会話ではない。".repeat(3)

const ADOPT_ITEMS: { name: string; verdict: "adopt" | "consider" | "reject"; reason: string }[] = [
  { name: "架空の案甲", verdict: "adopt", reason: "架空の理由甲" },
  { name: "架空の案乙", verdict: "consider", reason: "架空の理由乙" },
  { name: "架空の案丙", verdict: "adopt", reason: "架空の理由丙" },
  { name: "架空の案丁", verdict: "reject", reason: "架空の理由丁" },
]

const CHART_LABELS: string[] = ["架空1", "架空2", "架空3"]
const CHART_SERIES: { name: string; values: number[] }[] = [{ name: "架空系列", values: [3, 1, 2] }]
const CODE_MARKS: { lines: string; label: string }[] = [{ lines: "2", label: "架空の印" }]

const PAIRS = [
  {
    block: {
      kind: "code",
      language: "ts",
      path: "",
      source: "const a = 1\nconst b = 2\n",
      marks: CODE_MARKS,
      fold: "",
      aside: "",
    },
    part: {
      id: "k1",
      component: "Code",
      language: "ts",
      path: "",
      source: "const a = 1\nconst b = 2\n",
      marks: CODE_MARKS,
      fold: "",
      aside: "",
    },
  },
  {
    block: {
      kind: "mermaid",
      title: "架空の図",
      source: "sequenceDiagram\n  A->>B: 架空",
      fold: "",
      aside: "",
    },
    part: {
      id: "m1",
      component: "Mermaid",
      title: "架空の図",
      source: "sequenceDiagram\n  A->>B: 架空",
      fold: "",
      aside: "",
    },
  },
  {
    block: {
      kind: "chart",
      title: "架空のグラフ",
      chartKind: "bar",
      labels: CHART_LABELS,
      series: CHART_SERIES,
      horizontal: false,
      emphasis: [],
      fold: "",
      aside: "",
    },
    part: {
      id: "c1",
      component: "Chart",
      title: "架空のグラフ",
      chartKind: "bar",
      labels: CHART_LABELS,
      series: CHART_SERIES,
      horizontal: false,
      emphasis: [],
      fold: "",
      aside: "",
    },
  },
  {
    block: { kind: "text", text: LONG_TEXT, fold: "", aside: "" },
    part: { id: "p1", component: "Paragraph", text: LONG_TEXT, fold: "", aside: "" },
  },
  {
    block: {
      kind: "note",
      tone: "warn",
      text: "架空の注意。戻せない操作の前。",
      fold: "",
      aside: "",
    },
    part: {
      id: "n1",
      component: "Note",
      tone: "warn",
      text: "架空の注意。戻せない操作の前。",
      fold: "",
      aside: "",
    },
  },
  {
    block: { kind: "options", title: "架空の採否", items: ADOPT_ITEMS, fold: "", aside: "" },
    part: {
      id: "o1",
      component: "Options",
      title: "架空の採否",
      items: ADOPT_ITEMS,
      fold: "",
      aside: "",
    },
  },
  {
    block: { kind: "note", tone: "ng", text: "架空の異常。", fold: "", aside: "" },
    part: { id: "n2", component: "Note", tone: "ng", text: "架空の異常。", fold: "", aside: "" },
  },
  {
    block: { kind: "note", tone: "info", text: "架空の情報。", fold: "", aside: "" },
    part: { id: "n3", component: "Note", tone: "info", text: "架空の情報。", fold: "", aside: "" },
  },
] as const satisfies readonly LeafPair[]

type Plan = ReturnType<typeof planReveal>

const SECTIONS = [{ heading: "", blocks: PAIRS.map((pair) => pair.block) }] as const

function newPlan(): Plan {
  const values = reportLeafLayoutOf(SECTIONS).values[0] ?? []
  const { container } = render(
    <div>
      <div data-report-region="section" data-report-section="0">
        {PAIRS.map((pair, index) => {
          const view = directLeafViewOf(pair.part)
          return (
            view !== undefined && (
              <DirectLeaf
                key={pair.part.id}
                part={pair.part}
                value={values[index]}
                imageSource={NO_IMAGES}
                view={view}
              />
            )
          )
        })}
      </div>
    </div>,
  )
  return planOf(container)
}

function planOf(container: HTMLElement): Plan {
  const root = container.firstElementChild
  if (root === null) {
    throw new Error("本文の根が無い")
  }
  return planReveal(root, revealTimingOf("standard"))
}

function pausesOf(plan: Plan) {
  return plan.flatMap((block) => block.pauses)
}

describe("直接描いた葉の演出の計画", () => {
  it("筆を留める回数は、warn と ng の注記と「採る」の行の数に当たる", () => {
    expect(pausesOf(newPlan())).toHaveLength(4)
  })
})
