import { DataModel } from "@a2ui/web_core/v0_9"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { chartConfigOf } from "../../../../../../../src/browser/components/page/conversation/domain/report-diagram-markdown.ts"
import { mainViewDraftOf } from "../../../../../../../src/browser/domain/main-view/a2ui-draft-view.ts"
import { reportEvents } from "../../../../../../../src/server/session-driver/core/message/sdk-report-message.ts"
import { a2uiWrittenComponentSchema } from "../../../../../../../src/shared/report/a2ui-report-catalog.ts"
import { staticReportComponents } from "../../../../../../../src/shared/report/report-static-component-list.ts"
import { mainViewEntries } from "../../../../../../../src/shared/session/main-view-entry.ts"
import type { MainViewReportRegions } from "../../../../../../../src/shared/session/main-view-shape.ts"
import { applySessionEvent } from "../../../../../../../src/shared/session/session-fold.ts"
import { INITIAL_SESSION_STATE } from "../../../../../../../src/shared/session/session-state.ts"
import { checkedToolUseId } from "../../../../../../fixture/tool-use-id.ts"

// `Markdown` 一式は重いので、塊の文字列と図の設定をそのまま出す代役に差し替える。
vi.mock(
  "../../../../../../../src/browser/components/page/conversation/components/markdown/markdown.tsx",
  () => ({
    detailBlockClassName: "detail-block",
    arrangedBlockClassNames: { row: "", rowCell: "", panel: "" },
    leafFrameClassNames: {},
    textLeafClassNames: {},
    noteLeafClassNames: {},
    statsLeafClassNames: {},
    checksClassName: () => undefined,
    tagToneClassName: () => "",
    InlineCodeText: (props: { readonly text: string }) => <>{props.text}</>,
    InlineMarkdown: (props: { readonly text: string }) => <>{props.text}</>,
    NoteLabel: (props: { readonly label: string }) => <span>{props.label}</span>,
    FigureFence: (props: { readonly spec: string }) => <pre data-figure-spec="">{props.spec}</pre>,
    Markdown: (props: { readonly text: string }) => <div>{props.text}</div>,
  }),
)

const { Report } =
  await import("../../../../../../../src/browser/components/page/conversation/components/main-view/report.tsx")

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const expr = (source: string) => ({ call: "expr", args: { source } })
const format = (template: string) => ({ call: "format", args: { template } })
const LABELS = ["甲", "乙", "丙"]

// 端の値を1つずつ振る検査は通り、件数 4 と E2E を同時に振ったときだけ評価に誤りが出る。
const PARTS = [
  {
    id: "root",
    component: "Report",
    conclusion: ["架空の結論。"],
    children: ["s1", "s2"],
    defs: { both: "e2e && n == 4", total: "n * 2" },
  },
  {
    id: "s1",
    component: "Section",
    heading: "架空の試算",
    children: ["k", "e", "st", "p", "c"],
  },
  { id: "s2", component: "Section", heading: "架空の続き", children: ["long"] },
  {
    id: "k",
    component: "ParameterSlider",
    name: "n",
    label: "架空の件数",
    min: 1,
    max: 4,
    step: 1,
    initial: 2,
  },
  { id: "e", component: "ParameterCheckBox", name: "e2e", label: "架空の E2E", initial: false },
  {
    id: "st",
    component: "Stats",
    items: [
      { label: "架空の合計", value: expr("total") },
      { label: "架空の一", value: "1" },
      { label: "架空の二", value: "2" },
    ],
  },
  { id: "p", component: "Paragraph", text: format("架空の比は ${10 / (both ? 0 : n)}") },
  {
    id: "c",
    component: "Chart",
    chartKind: "bar",
    title: "架空の図",
    labels: LABELS,
    series: [{ name: "架空の系列", values: expr("[n * 3, 5, 7]") }],
    emphasis: expr(`[at(["甲", "乙", "丙"], both ? 9 : argmin([n * 3, 5, 7]))]`),
  },
  { id: "long", component: "Paragraph", text: "架空の長い段落。".repeat(40) },
]

function regionsOf(components: readonly unknown[]): MainViewReportRegions {
  const [event] = reportEvents(checkedToolUseId("toolu_fictional"), { components }, [])
  if (event?.kind !== "report") throw new Error("report にならなかった")
  const entry = mainViewEntries(applySessionEvent(INITIAL_SESSION_STATE, event, 0)).find(
    (candidate) => candidate.kind === "report",
  )
  if (entry?.kind !== "report") throw new Error("レポートの記録が無い")
  return entry.regions
}

function draftRegionsOf(components: readonly unknown[]): MainViewReportRegions {
  const written = components.map((part) => a2uiWrittenComponentSchema.parse(part))
  const draft = mainViewDraftOf(
    "toolu_drafted",
    staticReportComponents(written).components,
    written,
  )
  if (draft === undefined) throw new Error("根のある一覧から草稿が作れなかった")
  return draft.regions
}

function renderReport(body: MainViewReportRegions, reveal = false) {
  return render(<Report reveal={reveal} turnId={1} className="" body={body} />)
}

const slider = () => screen.getByRole("slider", { name: "架空の件数" })
const checkbox = () => screen.getByRole("checkbox", { name: "架空の E2E" })
const statValue = () => screen.getByText("架空の合計").parentElement?.textContent ?? ""
const chartSpec = () => document.querySelector("[data-figure-spec]")?.textContent ?? ""

function chartSpecOf(values: readonly number[], emphasis: readonly string[]): string {
  return JSON.stringify(
    chartConfigOf({
      kind: "chart",
      chartKind: "bar",
      title: "架空の図",
      labels: LABELS,
      series: [{ name: "架空の系列", values: [...values] }],
      horizontal: false,
      emphasis: [...emphasis],
      fold: "",
      aside: "",
    }),
  )
}

describe("つまみ（ParameterSlider・ParameterCheckBox）", () => {
  it("つまみが初期値で描かれ、振った値は /view/<ID>/value に置かれ、通信はしない", () => {
    const set = vi.spyOn(DataModel.prototype, "set")
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    renderReport(regionsOf(PARTS))

    expect(slider()).toHaveProperty("value", "2")
    expect(checkbox()).toHaveProperty("checked", false)

    fireEvent.change(slider(), { target: { value: "3" } })
    fireEvent.click(checkbox())

    expect(set).toHaveBeenCalledWith("/view/k/value", 3)
    expect(set).toHaveBeenCalledWith("/view/e/value", true)
    expect(slider()).toHaveProperty("value", "3")
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("描き直す（部品を作り直す）と初期値に戻る", () => {
    const body = regionsOf(PARTS)
    const { unmount } = renderReport(body)
    fireEvent.change(slider(), { target: { value: "4" } })
    expect(slider()).toHaveProperty("value", "4")

    unmount()
    renderReport(body)

    expect(slider()).toHaveProperty("value", "2")
    expect(statValue()).toContain("4")
  })

  it("振ると Stats・Paragraph・Chart（強調を含む）が描き替わる", () => {
    renderReport(regionsOf(PARTS))
    expect(statValue()).toContain("4")
    expect(screen.getByText("架空の比は 5")).toBeTruthy()
    expect(chartSpec()).toBe(chartSpecOf([6, 5, 7], ["乙"]))

    fireEvent.change(slider(), { target: { value: "1" } })

    expect(statValue()).toContain("2")
    expect(screen.getByText("架空の比は 10")).toBeTruthy()
    expect(chartSpec()).toBe(chartSpecOf([3, 5, 7], ["甲"]))
  })

  it("評価に誤りが出た値は「—」になり、ほかの部品は計算し直される", () => {
    renderReport(regionsOf(PARTS))

    fireEvent.change(slider(), { target: { value: "4" } })
    fireEvent.click(checkbox())

    expect(screen.queryByText(/^架空の比は/)).toBeNull()
    expect(screen.getAllByText("—")).toHaveLength(2)
    expect(document.querySelector("[data-chart-failed]")?.textContent).toBe("—")
    expect(chartSpec()).toBe("")
    expect(statValue()).toContain("8")
  })

  it("演出の最中は操作できず、演出は初期値の DOM に掛かり、出し切ると操作できる", () => {
    renderReport(regionsOf(PARTS), true)

    expect(document.querySelector("[data-revealing]")).not.toBeNull()
    expect(slider()).toHaveProperty("disabled", true)
    expect(checkbox()).toHaveProperty("disabled", true)
    expect(statValue()).toContain("4")

    act(() => {
      fireEvent.keyDown(window)
    })

    expect(slider()).toHaveProperty("disabled", false)
    expect(checkbox()).toHaveProperty("disabled", false)
  })

  it("草稿ではつまみを操作できない", () => {
    renderReport(draftRegionsOf(PARTS))

    expect(slider()).toHaveProperty("disabled", true)
    expect(checkbox()).toHaveProperty("disabled", true)
  })
})
