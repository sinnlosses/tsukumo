import { cleanup, fireEvent, render } from "@testing-library/react"
import { useImperativeHandle, type ReactNode, type Ref } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { ChartTooltipControl } from "../../../../src/browser/features/report/renderer/chart-tooltip.ts"
import { reportEvents } from "../../../../src/server/session-driver/core/message/sdk-report-message.ts"
import { mainViewEntries } from "../../../../src/shared/session/main-view-entry.ts"
import type { MainViewReportRegions } from "../../../../src/shared/session/main-view-shape.ts"
import { applySessionEvent } from "../../../../src/shared/session/session-fold.ts"
import { INITIAL_SESSION_STATE } from "../../../../src/shared/session/session-state.ts"
import { checkedToolUseId } from "../../../fixture/tool-use-id.ts"

const figureControl = vi.hoisted(() => ({
  show: vi.fn<(index: number) => void>(),
  hide: vi.fn<() => void>(),
}))

// `Markdown` と図は代役にする。図の代役は、渡された controlRef に偽の札の手続きを登録する。
// 地の文の代役は、結ぶ語の対応が渡されたら語ごとに印の span を後ろへ足す（本物の包み方は rehype-chart-term のテストが見る）。
vi.mock("../../../../src/browser/features/report/markdown.tsx", () => ({
  detailBlockClassName: "detail-block",
  arrangedBlockClassNames: { row: "", rowCell: "", panel: "" },
  leafFrameClassNames: {},
  textLeafClassNames: {},
  noteLeafClassNames: {},
  tableLeafClassNames: {},
  matrixLeafClassNames: {},
  compareLeafClassNames: {},
  statsLeafClassNames: {},
  checksClassName: () => undefined,
  tagToneClassName: () => "",
  FoldedTableBody: (props: { readonly children: ReactNode }) => <tbody>{props.children}</tbody>,
  InlineCodeText: (props: { readonly text: string }) => <>{props.text}</>,
  NoteLabel: (props: { readonly label: string }) => <span>{props.label}</span>,
  Markdown: (props: { readonly text: string }) => <div>{props.text}</div>,
  FigureFence: (props: { readonly controlRef?: Ref<ChartTooltipControl> }) => {
    useImperativeHandle(props.controlRef, () => figureControl)
    return <div data-figure-stub="yes" />
  },
  InlineMarkdown: (props: {
    readonly text: string
    readonly chartTerms?: ReadonlyMap<string, { readonly chartId: string; readonly index: number }>
  }) => (
    <>
      {props.text}
      {[...(props.chartTerms ?? [])].map(([term, target]) => (
        <span
          key={term}
          data-chart-term={term}
          data-chart-id={target.chartId}
          data-chart-index={String(target.index)}
          tabIndex={0}
        >
          {term}
        </span>
      ))}
    </>
  ),
}))

vi.mock("../../../../src/browser/stores/browser-error-report.ts", () => ({
  reportBrowserError: vi.fn<(route: string, error: unknown) => void>(),
}))

const { Report } = await import("../../../../src/browser/features/report/report.tsx")

const NO_CLASS_NAMES = { className: "", revealClassName: "", blockClassName: "" }

const CHART = {
  id: "c1",
  component: "Chart",
  chartKind: "bar",
  title: "架空の図",
  labels: ["架空1月", "架空2月"],
  series: [{ name: "架空系列", values: [3, 1] }],
  horizontal: false,
  emphasis: [],
  fold: "",
  aside: "",
} as const

const BODY = regionsOf({
  components: [
    { id: "root", component: "Report", conclusion: ["架空の結論。"], children: ["s1", "s2"] },
    { id: "s1", component: "Section", heading: "架空の一", children: ["c1", "p1"] },
    CHART,
    { id: "p1", component: "Paragraph", text: "架空1月は多い。", fold: "", aside: "" },
    { id: "s2", component: "Section", heading: "架空の二", children: ["p2"] },
    { id: "p2", component: "Paragraph", text: "架空2月は少ない。", fold: "", aside: "" },
  ],
})

beforeEach(() => {
  figureControl.show.mockClear()
  figureControl.hide.mockClear()
})

afterEach(() => {
  cleanup()
})

describe("地の文の語と同じ節の図を結ぶ", () => {
  const renderReport = () =>
    render(<Report reveal={false} turnId={1} {...NO_CLASS_NAMES} body={BODY} />)

  it("同じ節の語に重ねると項目の位置で札を出し、離れる・フォーカスが外れる・Esc で消す", () => {
    const { container } = renderReport()
    const mark = container.querySelector<HTMLElement>("[data-chart-term]")
    if (mark === null) {
      throw new Error("結ぶ語の印が無い")
    }

    fireEvent.pointerOver(mark)
    expect(figureControl.show).toHaveBeenLastCalledWith(0)

    fireEvent.pointerOut(mark)
    fireEvent.blur(mark)
    fireEvent.keyDown(mark, { key: "Escape" })
    expect(figureControl.hide).toHaveBeenCalledTimes(3)

    fireEvent.focus(mark)
    expect(figureControl.show).toHaveBeenCalledTimes(2)
  })

  it("図の無い節の語は結ばれず、札も出ない", () => {
    const { container } = renderReport()
    const sections = container.querySelectorAll('[data-report-region="section"]')

    expect(sections[0]?.querySelectorAll("[data-chart-term]")).toHaveLength(2)
    expect(sections[1]?.querySelectorAll("[data-chart-term]")).toHaveLength(0)
    expect(figureControl.show).not.toHaveBeenCalled()
  })
})

function regionsOf(input: Readonly<Record<string, unknown>>): MainViewReportRegions {
  const [event] = reportEvents(checkedToolUseId("toolu_fictional"), input, [])
  if (event?.kind !== "report") throw new Error("report にならなかった")
  const entry = mainViewEntries(applySessionEvent(INITIAL_SESSION_STATE, event, 0)).find(
    (candidate) => candidate.kind === "report",
  )
  if (entry?.kind !== "report") throw new Error("レポートの記録が無い")
  return entry.regions
}
