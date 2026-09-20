// レポートの ```chart フェンスの中身（Chart.js の設定を JSON で書いたもの）をグラフとして描く。
// **Chart.js は tsukumo 自身のサーバから配り、その記法が実際に出てきたときだけ `<script>` で
// 読み込む**（`docs/requirements.md` 4.2）。
//
// もとは別ファイルの処理だったものを、部品の `useEffect` に持ち替えた（移行の段6。
// docs/design.md 6.4）。

import { useEffect, useRef, useState, type ReactElement } from "react"

import { vendorAssetPath } from "../../../../shared/vendor-asset.ts"
import { loadVendorScript } from "./vendor-script.ts"

const CHART_SRC = vendorAssetPath("chart.umd.min.js")

export type ChartBlockProps = {
  /** ```chart フェンスの中身（Chart.js の設定を JSON で書いたもの）。 */
  readonly spec: string
}

export function ChartBlock(props: ChartBlockProps): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false

    loadVendorScript(CHART_SRC)
      .then(() => {
        const canvas = canvasRef.current
        if (cancelled || canvas === null) {
          return
        }

        // Chart.js の既定は明るい背景向けで、目盛りの文字（`#666`）と線
        // （`rgba(0,0,0,0.1)`）がこの配色では読めない。**データ系列の色は Chart.js 内蔵の
        // colors プラグインが割り当てる**ので、ここで寄せるのは文字と線だけ（値は
        // `main-view.module.css` に合わせてある）。
        Chart.defaults.color = "#b9c0d0"
        Chart.defaults.borderColor = "#3a4256"

        // JSON.parse の失敗もまとめて拾いたいので、あえて戻り値は使わない。
        void new Chart(canvas, JSON.parse(props.spec))
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true)
        }
      })

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
