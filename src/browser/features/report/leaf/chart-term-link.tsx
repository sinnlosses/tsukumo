// 同じ節の `Paragraph` の語と `Chart` の項目を結ぶ入れ物。節ごとに1つ置き、図の札を出す手続きを図の ID で預かる。

import {
  createContext,
  use,
  useRef,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SyntheticEvent,
} from "react"

import type { A2uiReportComponent } from "../../../../shared/report/a2ui-report-catalog.ts"
import type { ReevaluatedLeaf } from "../../../../shared/report/report-static-component-list.ts"
import {
  chartPartsOfSection,
  chartTermLinksOf,
  type ChartTermLinks,
  type ChartTermTarget,
} from "../domain/chart-term-link.ts"
import type { ChartTooltipControl } from "../renderer/chart-tooltip.ts"

export type ChartTermLinkInput = {
  readonly id: string
  readonly labels: readonly string[]
}

export type ChartTermLink = {
  readonly terms: ChartTermLinks
  readonly register: (chartId: string) => (control: ChartTooltipControl | null) => void
  readonly show: (chartId: string, index: number) => void
  readonly hide: (chartId: string) => void
}

/** 節の外の既定。結ぶ語が無く、手続きは何もしない。 */
const NO_CHART_TERM_LINK: ChartTermLink = {
  terms: new Map(),
  register: () => () => {},
  show: () => {},
  hide: () => {},
}

const ChartTermLinkContext = createContext<ChartTermLink>(NO_CHART_TERM_LINK)

export function ChartTermLinkScope(props: {
  readonly charts: readonly ChartTermLinkInput[]
  readonly children: ReactNode
}): ReactElement {
  const controls = useRef(new Map<string, ChartTooltipControl>())
  const link: ChartTermLink = {
    terms: chartTermLinksOf(props.charts),
    register: (chartId) => (control) => {
      if (control === null) {
        controls.current.delete(chartId)
      } else {
        controls.current.set(chartId, control)
      }
    },
    show: (chartId, index) => controls.current.get(chartId)?.show(index),
    hide: (chartId) => controls.current.get(chartId)?.hide(),
  }
  return <ChartTermLinkContext value={link}>{props.children}</ChartTermLinkContext>
}

/** 節の外（入れ物が無い）では、結ぶ語が空で何もしない値。 */
export function useChartTermLink(): ChartTermLink {
  return use(ChartTermLinkContext)
}

/** 節の子の ID の並びから、図の項目名を取り出す（式で振る値の評価後の部品を読み、図を描けなかった `Chart` は外す）。 */
export function chartLinkInputsOf(
  ids: readonly string[],
  parts: ReadonlyMap<string, A2uiReportComponent>,
  leaves: Readonly<Record<string, ReevaluatedLeaf>>,
): readonly ChartTermLinkInput[] {
  return chartPartsOfSection(ids, parts).flatMap((part) => {
    const leaf = leaves[part.id]
    const drawn = leaf === undefined ? part : leaf.kind === "drawn" ? leaf.component : undefined
    return drawn?.component === "Chart" ? [{ id: part.id, labels: drawn.labels }] : []
  })
}

/** 語の上の操作で、図の札を出し入れする `p` に付ける属性。節の外では何も付けない。 */
export function chartTermHandlers(link: ChartTermLink): HTMLAttributes<HTMLElement> {
  if (link.terms.size === 0) {
    return {}
  }
  const show = (event: SyntheticEvent): void => {
    onTerm(event, (target) => {
      link.show(target.chartId, target.index)
    })
  }
  const hide = (event: SyntheticEvent): void => {
    onTerm(event, (target) => {
      link.hide(target.chartId)
    })
  }
  return {
    onPointerOver: show,
    onPointerOut: hide,
    onFocus: show,
    onBlur: hide,
    onKeyDown: (event) => {
      if (event.key === "Escape") {
        hide(event)
      }
    },
  }
}

/** 操作の対象が結ぶ語の印（の中）なら、その図と項目の位置で `act` を呼ぶ。 */
function onTerm(event: SyntheticEvent, act: (target: ChartTermTarget) => void): void {
  const mark =
    event.target instanceof Element ? event.target.closest("[data-chart-term]") : undefined
  const chartId = mark?.getAttribute("data-chart-id")
  const index = Number(mark?.getAttribute("data-chart-index"))
  if (typeof chartId === "string" && !Number.isNaN(index)) {
    act({ chartId, index })
  }
}
