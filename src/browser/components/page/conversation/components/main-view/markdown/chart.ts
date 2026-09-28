// Chart.js（同梱のライブラリ）を読む口。
// tsukumo 自身のサーバから配り、グラフが実際に要るときだけ `<script>` で読み込む（束ねには入れない）。
// 描く config は読み手が持つ。

import { vendorAssetPath } from "../../../../../../../shared/view-server/vendor-asset.ts"
import { loadVendorScript } from "./vendor-script.ts"

const CHART_SRC = vendorAssetPath("chart.umd.min.js")

/**
 * Chart.js を読み込み、暗い配色へ寄せた既定値を入れる。
 * 解決したあとは `Chart` がグローバルに居るので、読み手はそのまま `new Chart(canvas, config)` を書ける。
 *
 * `element` は色のトークンを解決するためだけに使う（描く先とは限らない）。
 */
export function loadChart(element: HTMLElement): Promise<void> {
  return loadVendorScript(CHART_SRC).then(() => {
    // Chart.js の既定は明るい背景向けで、目盛りの文字も目盛り線もこの配色では読めない。
    // データ系列の色は Chart.js 内蔵の colors プラグインが割り当てるので、ここで寄せるのは文字と線だけ。
    // 色は書かずにトークンの実効値を読んで渡す。
    //
    // 線は `defaults.borderColor` ではなく目盛りの側（`defaults.scale`）へ書く。
    // chart.js 4.5.0 以降の colors プラグインは「`defaults.borderColor` か `defaults.backgroundColor` が既定から動いていたら色を配らない」。
    // `borderColor` へ書くと系列の色が付かないまま（`undefined`）になり、棒も線も透明で描かれる（4.4.1 と 4.5.1 を並べて実測）。
    const rule = resolveColor(element, "--rule")
    Chart.defaults.color = resolveColor(element, "--ink-quiet")
    Chart.defaults.scale.grid.color = rule
    Chart.defaults.scale.border.color = rule
  })
}

/**
 * カスタムプロパティの実効値（`rgb(...)` / `rgba(...)`）。
 * `getComputedStyle` からカスタムプロパティを直接読むと `color-mix(...)` の式のまま返る（式が色になるのは色のプロパティに載ったときだけ）ので、いったん要素の `color` に載せてから読み戻す。
 * Chart.js は受け取った文字列を canvas の色として使うので、式のままでは渡せない。
 */
function resolveColor(element: HTMLElement, property: string): string {
  const before = element.style.color
  element.style.color = `var(${property})`
  const resolved = getComputedStyle(element).color
  element.style.color = before
  return resolved
}
