// レポートの ```chart フェンスの中身（Chart.js の設定を JSON で書いたもの）をグラフとして描く。
// Chart.js を読み込んで暗い配色へ寄せるのは `loadChart` で、ここが持つのはフェンスの中身を config として渡すところだけ。

import clsx from "clsx"
import {
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type Ref,
  type RefCallback,
} from "react"
import { omit } from "remeda"
import { z } from "zod"

import { parseJsonWith } from "../../../../shared/utils/parse-json.ts"
import { VisuallyHidden } from "../../../components/ui/visually-hidden/visually-hidden.tsx"
import { mergeRefs } from "../../../utils/merge-ref.ts"
import { useSeenOnce } from "../hooks/use-seen-once.ts"
import { nextChartItem } from "./chart-item-key.ts"
import { tooltipControlOf, type ChartTooltipControl } from "./chart-tooltip.ts"
import { loadChart } from "./chart.ts"
import styles from "./report-notation.module.css"

type ChartBlockProps = {
  /** ```chart フェンスの中身（Chart.js の設定を JSON で書いたもの。最上位の `tsukumo` は入れ物の高さで、Chart.js へは渡さない）。 */
  readonly spec: string
  /** 外から項目の札を出す・消すための手続きの受け口。 */
  readonly controlRef?: Ref<ChartTooltipControl>
}

const heightFieldSchema = z.object({ tsukumo: z.object({ height: z.number() }) })

const labelsFieldSchema = z.object({ data: z.object({ labels: z.array(z.unknown()) }) })

const CHART_LABEL = "図。左右の矢印キー・Home・End で項目の値を読み、Esc で閉じる"

export function ChartBlock(props: ChartBlockProps): ReactElement {
  const [failed, setFailed] = useState(false)
  // 項目の移動で ChartBlock を再描画すると ref が呼び直されて図が作り直され、札が消える。
  // 今の項目は ref に、読み上げの文は `ChartAnnouncer` の中に持つ。
  const activeIndexRef = useRef<number>(undefined)
  const announceRef = useRef<(text: string) => void>(null)
  const controlRef = useRef<ChartTooltipControl>(undefined)
  const { ref: seenRef, seen } = useSeenOnce<HTMLCanvasElement>()

  const show = (index: number) => {
    activeIndexRef.current = index
    controlRef.current?.show(index)
  }
  const hide = () => {
    activeIndexRef.current = undefined
    controlRef.current?.hide()
  }
  useImperativeHandle(props.controlRef, () => ({ show, hide }))

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const move = nextChartItem(event.key, labelCountOf(props.spec), activeIndexRef.current)
    if (move.kind === "show") {
      event.preventDefault()
      show(move.index)
    } else if (move.kind === "hide") {
      event.preventDefault()
      hide()
    }
  }

  const chartRef: RefCallback<HTMLCanvasElement> = (canvas) => {
    if (canvas === null || !seen) {
      return undefined
    }
    let cancelled = false
    let chart: { readonly destroy: () => void } | undefined
    loadChart(canvas)
      .then(() => {
        if (cancelled) {
          return
        }

        const created = new Chart(canvas, omit(JSON.parse(props.spec), ["tsukumo"]))
        chart = created
        controlRef.current = tooltipControlOf(created, (text) => announceRef.current?.(text))
      })
      .catch(() => {
        // 読み込み・描画の失敗はグラフの代わりに失敗の表示にする
        if (!cancelled) {
          setFailed(true)
        }
      })
    return () => {
      cancelled = true
      controlRef.current = undefined
      chart?.destroy()
    }
  }

  return (
    <div
      className={clsx("chart-block", styles["chart-block"])}
      style={{ height: heightOf(props.spec) }}
      data-chart-failed={failed ? "yes" : undefined}
      tabIndex={0}
      role="group"
      aria-label={CHART_LABEL}
      onKeyDown={onKeyDown}
      onBlur={hide}
    >
      <canvas ref={mergeRefs(seenRef, chartRef)} />
      <ChartAnnouncer announceRef={announceRef} />
    </div>
  )
}

function ChartAnnouncer(props: {
  readonly announceRef: Ref<(text: string) => void>
}): ReactElement {
  const [text, setText] = useState("")
  useImperativeHandle(props.announceRef, () => setText)
  return (
    <VisuallyHidden element="div" role="status" aria-live="polite" aria-atomic="true">
      {text}
    </VisuallyHidden>
  )
}

function labelCountOf(spec: string): number {
  return parseJsonWith(labelsFieldSchema, spec)?.data.labels.length ?? 0
}

function heightOf(spec: string): number | undefined {
  return parseJsonWith(heightFieldSchema, spec)?.tsukumo.height
}
