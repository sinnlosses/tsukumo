// Chart.js（同梱のライブラリ）を読む口。**tsukumo 自身のサーバから配り、グラフが実際に要る
// ときだけ `<script>` で読み込む**（`docs/requirements.md` 4.2。束ねには入れない）。
//
// **読み込みと暗い配色への寄せ方はここに置く**（機能どうしは import しないので、読み手が
// 増えても置き場を動かさずに済む。`docs/design.md` 2章）。いまの読み手はレポートの ```chart
// フェンス（`features/main-view/markdown/chart-block.tsx`）だけで、**描く config は読み手が持つ。**

import { vendorAssetPath } from "../../shared/vendor-asset.ts"
import { loadVendorScript } from "./vendor-script.ts"

const CHART_SRC = vendorAssetPath("chart.umd.min.js")

/**
 * Chart.js を読み込み、暗い配色へ寄せた既定値を入れる。解決したあとは `Chart` が
 * グローバルに居るので、読み手はそのまま `new Chart(canvas, config)` を書ける。
 *
 * `element` は**色のトークンを解決するためだけ**に使う（描く先とは限らない）。
 */
export function loadChart(element: HTMLElement): Promise<void> {
  return loadVendorScript(CHART_SRC).then(() => {
    // Chart.js の既定は明るい背景向けで、目盛りの文字も目盛り線もこの配色では読めない。
    // **データ系列の色は Chart.js 内蔵の colors プラグインが割り当てる**ので、ここで寄せるのは
    // 文字と線だけ。**色は書かずにトークンの実効値を読んで渡す**（16進を持ってよいのは
    // `src/browser/styles/theme.css` だけ。docs/screen-design.md 13.2）。
    //
    // **線は `defaults.borderColor` ではなく目盛りの側（`defaults.scale`）へ書く。**
    // chart.js 4.5.0 の colors プラグインは「`defaults.borderColor` か
    // `defaults.backgroundColor` が既定から動いていたら色を配らない」判定を足したので、
    // `borderColor` へ書くと系列の色が付かないまま（`undefined`）になり、棒も線も透明で
    // 描かれる（4.4.1 と 4.5.1 を並べて実測）。
    const rule = resolveColor(element, "--rule")
    Chart.defaults.color = resolveColor(element, "--ink-quiet")
    Chart.defaults.scale.grid.color = rule
    Chart.defaults.scale.border.color = rule
  })
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
