// Chart.js（同梱のライブラリ）を読む口。
// tsukumo 自身のサーバから配り、グラフが実際に要るときだけ `<script>` で読み込む（束ねには入れない）。
// 描く config は読み手が持つ。

import { vendorAssetPath } from "../../../../../../../shared/view-server/vendor-asset.ts"
import { colorsForDataset, type ChartPalette } from "./chart-palette.ts"
import { resolveColor } from "./theme-color.ts"
import { loadVendorScript } from "./vendor-script.ts"

const CHART_SRC = vendorAssetPath("chart.umd.min.js")

const SERIES_PROPERTIES = [
  "--chart-series-1",
  "--chart-series-2",
  "--chart-series-3",
  "--chart-series-4",
  "--chart-series-5",
  "--chart-series-6",
] as const satisfies readonly string[]

let latestPalette: ChartPalette | undefined

/**
 * Chart.js を読み込み、暗い配色へ寄せた既定値を入れる。
 * 解決したあとは `Chart` がグローバルに居るので、読み手はそのまま `new Chart(canvas, config)` を書ける。
 *
 * `element` は色のトークンを解決するためだけに使う（描く先とは限らない）。
 */
export function loadChart(element: HTMLElement): Promise<void> {
  return loadVendorScript(CHART_SRC).then(() => {
    // Chart.js の既定は明るい背景向けで、目盛りの文字も目盛り線もこの配色では読めない。
    // 色は書かずにトークンの実効値を読んで渡す。
    //
    // 線は `defaults.borderColor` ではなく目盛りの側（`defaults.scale`）へ書く。
    // chart.js 4.5.0 以降の colors プラグインは「`defaults.borderColor` か `defaults.backgroundColor` が既定から動いていたら色を配らない」。
    // `borderColor` へ書くと系列の色が付かないまま（`undefined`）になり、棒も線も透明で描かれる（4.4.1 と 4.5.1 を並べて実測）。
    const rule = resolveColor(element, "--rule")
    Chart.defaults.color = resolveColor(element, "--ink-quiet")
    Chart.defaults.scale.grid.color = rule
    Chart.defaults.scale.border.color = rule
    // アスペクト比を保つ既定だと、pie は入れ物の全幅を高さにも使おうとして縦に伸びすぎる。
    // `.chart-block` の高さ（CSS）に合わせるだけにする。
    Chart.defaults.maintainAspectRatio = false

    // 系列の色は内蔵の colors プラグイン（明度がばらつく固定の並び）に任せず、自前のプラグインが配る。
    const palette = {
      series: SERIES_PROPERTIES.map((property) => resolveColor(element, property)),
      other: resolveColor(element, "--chart-series-other"),
    } satisfies ChartPalette
    Chart.defaults.plugins.colors.enabled = false
    registerSeriesPlugin(palette)
  })
}

// プラグインは1度だけ登録し、色の並びはその都度読み直した最新の値で配る。
function registerSeriesPlugin(palette: ChartPalette): void {
  const first = latestPalette === undefined
  latestPalette = palette
  if (!first) {
    return
  }
  Chart.register({
    id: "tsukumo-series",
    beforeUpdate: (chart) => {
      if (latestPalette === undefined) {
        return
      }
      const current = latestPalette
      chart.config.data?.datasets?.forEach((dataset, index) => {
        const colors = colorsForDataset(dataset, chart.config.type, index, current)
        if (colors !== undefined) {
          dataset.backgroundColor = colors.backgroundColor
          dataset.borderColor = colors.borderColor
        }
      })
    },
  })
}
