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

        // Chart.js の既定は明るい背景向けで、目盛りの文字も目盛り線もこの配色では読めない。
        // **データ系列の色は Chart.js 内蔵の colors プラグインが割り当てる**ので、ここで寄せるのは
        // 文字と線だけ。**色は書かずにトークンの実効値を読んで渡す**（16進を持ってよいのは
        // `src/browser/styles/theme.css` だけ。docs/design.md 13.2）。
        //
        // **線は `defaults.borderColor` ではなく目盛りの側（`defaults.scale`）へ書く。**
        // chart.js 4.5.0 の colors プラグインは「`defaults.borderColor` か
        // `defaults.backgroundColor` が既定から動いていたら色を配らない」判定を足したので、
        // `borderColor` へ書くと系列の色が付かないまま（`undefined`）になり、棒も線も透明で
        // 描かれる（2026-09-22 に 4.4.1 と 4.5.1 を並べて実測）。
        const rule = resolveColor(canvas, "--rule")
        Chart.defaults.color = resolveColor(canvas, "--ink-quiet")
        Chart.defaults.scale.grid.color = rule
        Chart.defaults.scale.border.color = rule

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

/**
 * カスタムプロパティの実効値（`rgb(...)` / `rgba(...)`）。**`getComputedStyle` からカスタム
 * プロパティを直接読むと `color-mix(...)` の式のまま返る**（式が色になるのは色のプロパティに
 * 載ったときだけ）ので、いったん要素の `color` に載せてから読み戻す。Chart.js は受け取った
 * 文字列を canvas の色として使うので、式のままでは渡せない。
 */
function resolveColor(element: HTMLElement, property: string): string {
  const before = element.style.color
  element.style.color = `var(${property})`
  const resolved = getComputedStyle(element).color
  element.style.color = before
  return resolved
}
