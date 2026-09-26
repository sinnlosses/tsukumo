// レポートの ```chart フェンスの中身（Chart.js の設定を JSON で書いたもの）をグラフとして描く。
// Chart.js を読み込んで暗い配色へ寄せるのは `src/browser/components/page/conversation/components/main-view/markdown/chart.ts`（トークン消費の
// 画面も同じ口を使う）で、ここが持つのはフェンスの中身を config として渡すところだけ。
//
// もとは別ファイルの処理だったものを、部品の `useEffect` に持ち替えた（移行の段6。
// docs/design.md 6.4）。

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
    const canvas = canvasRef.current

    if (canvas !== null) {
      loadChart(canvas)
        .then(() => {
          if (cancelled) {
            return
          }

          // JSON.parse の失敗もまとめて拾いたいので、あえて戻り値は使わない。
          void new Chart(canvas, JSON.parse(props.spec))
        })
        .catch(() => {
          if (!cancelled) {
            setFailed(true)
          }
        })
    }

    return () => {
      cancelled = true
    }
  }, [props.spec])

  return (
    <div className="chart-block" data-chart-failed={failed ? "yes" : undefined}>
      <canvas ref={canvasRef} />
    </div>
  )
}
