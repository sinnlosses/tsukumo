// レポートの ```chart フェンスの中身（Chart.js の設定を JSON で書いたもの）をグラフとして描く。
// Chart.js を読み込んで暗い配色へ寄せるのは `loadChart` で、ここが持つのはフェンスの中身を config として渡すところだけ。

import clsx from "clsx"
import { useEffect, useRef, useState, type ReactElement } from "react"
import { omit } from "remeda"
import { z } from "zod"

import { loadChart } from "./chart.ts"
import { useSeenOnce } from "./hooks/use-seen-once.ts"
import styles from "./report-notation.module.css"

type ChartBlockProps = {
  /** ```chart フェンスの中身（Chart.js の設定を JSON で書いたもの。最上位の `tsukumo` は入れ物の高さで、Chart.js へは渡さない）。 */
  readonly spec: string
}

const heightFieldSchema = z.object({ tsukumo: z.object({ height: z.number() }) })

export function ChartBlock(props: ChartBlockProps): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [failed, setFailed] = useState(false)
  const seen = useSeenOnce(canvasRef)

  useEffect(() => {
    let cancelled = false
    let chart: { readonly destroy: () => void } | undefined
    const canvas = canvasRef.current

    if (seen && canvas !== null) {
      loadChart(canvas)
        .then(() => {
          if (cancelled) {
            return
          }

          chart = new Chart(canvas, omit(JSON.parse(props.spec), ["tsukumo"]))
        })
        .catch(() => {
          if (!cancelled) {
            setFailed(true)
          }
        })
    }

    return () => {
      cancelled = true
      chart?.destroy()
    }
  }, [props.spec, seen])

  return (
    <div
      className={clsx("chart-block", styles["chart-block"])}
      style={{ height: heightOf(props.spec) }}
      data-chart-failed={failed ? "yes" : undefined}
    >
      <canvas ref={canvasRef} />
    </div>
  )
}

function heightOf(spec: string): number | undefined {
  try {
    const parsed = heightFieldSchema.safeParse(JSON.parse(spec))
    return parsed.success ? parsed.data.tsukumo.height : undefined
  } catch {
    return undefined
  }
}
