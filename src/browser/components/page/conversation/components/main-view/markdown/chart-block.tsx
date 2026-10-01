// レポートの ```chart フェンスの中身（Chart.js の設定を JSON で書いたもの）をグラフとして描く。
// Chart.js を読み込んで暗い配色へ寄せるのは `loadChart` で、ここが持つのはフェンスの中身を config として渡すところだけ。

import { useEffect, useRef, useState, type ReactElement } from "react"

import { loadChart } from "./chart.ts"

export type ChartBlockProps = {
  /** ```chart フェンスの中身（Chart.js の設定を JSON で書いたもの）。 */
  readonly spec: string
}

export function ChartBlock(props: ChartBlockProps): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    let chart: { readonly destroy: () => void } | undefined
    const canvas = canvasRef.current

    if (canvas !== null) {
      loadChart(canvas)
        .then(() => {
          if (cancelled) {
            return
          }

          chart = new Chart(canvas, JSON.parse(props.spec))
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
  }, [props.spec])

  return (
    <div className="chart-block" data-chart-failed={failed ? "yes" : undefined}>
      <canvas ref={canvasRef} />
    </div>
  )
}
