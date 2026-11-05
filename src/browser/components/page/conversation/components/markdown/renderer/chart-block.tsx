// レポートの ```chart フェンスの中身（Chart.js の設定を JSON で書いたもの）をグラフとして描く。
// Chart.js を読み込んで暗い配色へ寄せるのは `loadChart` で、ここが持つのはフェンスの中身を config として渡すところだけ。

import clsx from "clsx"
import { useState, type ReactElement, type RefCallback } from "react"
import { omit } from "remeda"
import { z } from "zod"

import { parseJsonWith } from "../../../../../../../shared/utils/parse-json.ts"
import { mergeRefs } from "../../../domain/merge-ref.ts"
import { useSeenOnce } from "../hooks/use-seen-once.ts"
import { loadChart } from "./chart.ts"
import styles from "./report-notation.module.css"

type ChartBlockProps = {
  /** ```chart フェンスの中身（Chart.js の設定を JSON で書いたもの。最上位の `tsukumo` は入れ物の高さで、Chart.js へは渡さない）。 */
  readonly spec: string
}

const heightFieldSchema = z.object({ tsukumo: z.object({ height: z.number() }) })

export function ChartBlock(props: ChartBlockProps): ReactElement {
  const [failed, setFailed] = useState(false)
  const { ref: seenRef, seen } = useSeenOnce<HTMLCanvasElement>()

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

        chart = new Chart(canvas, omit(JSON.parse(props.spec), ["tsukumo"]))
      })
      .catch(() => {
        // 読み込み・描画の失敗はグラフの代わりに失敗の表示にする
        if (!cancelled) {
          setFailed(true)
        }
      })
    return () => {
      cancelled = true
      chart?.destroy()
    }
  }

  return (
    <div
      className={clsx("chart-block", styles["chart-block"])}
      style={{ height: heightOf(props.spec) }}
      data-chart-failed={failed ? "yes" : undefined}
    >
      <canvas ref={mergeRefs(seenRef, chartRef)} />
    </div>
  )
}

function heightOf(spec: string): number | undefined {
  return parseJsonWith(heightFieldSchema, spec)?.tsukumo.height
}
