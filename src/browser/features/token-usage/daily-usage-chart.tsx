// 日ごとの推移（トークン消費の画面の唯一のグラフ）。**数そのものを読ませたいところは表、
// 大小と傾きを見せたいところはグラフ**という割り振りで、ここは「どの日が重かったか」と
// 「何が膨らんだのか」を一目で見るためだけにある。
//
// **積み上げの棒がトークン（左の軸）、線が費用（右の軸）。** 費用だけでは「キャッシュ読みで
// 膨らんだのか、出力が多かったのか」が分からず、トークンだけでは高い日が分からない。
//
// **Chart.js は開いたときだけ取りに行く**（`src/browser/lib/chart.ts`。束ねには入れない）。
// 読み込みに失敗した回はグラフを諦めて一言だけ出す（表は出たままなので画面は使える）。

import { useEffect, useRef, useState, type ReactElement } from "react"

import { type DailyTokenUsage } from "../../../shared/token-usage-summary.ts"
import { loadChart } from "../../lib/chart.ts"
import styles from "./token-usage.module.css"

/** グラフが描けなかったときの一言（表は出たままなので、画面ごと諦めない）。 */
const CHART_FAILED_NOTE = "グラフを描けなかった"

export type DailyUsageChartProps = {
  /** 日ごとの合計（古い→新しい順）。**空のときはこの部品を出さない**のは呼ぶ側の役目。 */
  readonly byDay: readonly DailyTokenUsage[]
}

export function DailyUsageChart(props: DailyUsageChartProps): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    // **描いたものは React の外の資源**なので、可変の入れ物で持って後始末で捨てる
    // （同じ `<canvas>` に描き直す前に `destroy()` を呼ばないと Chart.js が例外を投げる）。
    let drawn: { readonly destroy: () => void } | undefined
    let cancelled = false

    if (canvas !== null) {
      loadChart(canvas)
        .then(() => {
          if (!cancelled) {
            drawn = new Chart(canvas, dailyUsageChartConfig(props.byDay))
          }
        })
        .catch(() => {
          if (!cancelled) {
            setFailed(true)
          }
        })
    }

    return () => {
      cancelled = true
      drawn?.destroy()
    }
  }, [props.byDay])

  return (
    <div className={styles["token-usage-chart"]}>
      <canvas ref={canvasRef} />
      {failed ? <p className={styles["token-usage-note"]}>{CHART_FAILED_NOTE}</p> : null}
    </div>
  )
}

/**
 * Chart.js に渡す設定。**系列の色は書かない**（内蔵の colors プラグインが配る。
 * `src/browser/lib/chart.ts` のコメント）。高さは入れ物が決めるので
 * `maintainAspectRatio` は寝かせる（起こしたままだと幅に比例して背が伸び、横に溢れる）。
 */
function dailyUsageChartConfig(byDay: readonly DailyTokenUsage[]): unknown {
  return {
    type: "bar",
    data: {
      labels: byDay.map((day) => day.date.slice(5)),
      datasets: [
        tokenDataset("入力", byDay, (day) => day.totals.inputTokens),
        tokenDataset("出力", byDay, (day) => day.totals.outputTokens),
        tokenDataset("キャッシュ読み", byDay, (day) => day.totals.cacheReadInputTokens),
        tokenDataset("キャッシュ作成", byDay, (day) => day.totals.cacheCreationInputTokens),
        {
          type: "line",
          label: "費用",
          data: byDay.map((day) => day.totals.costUsd),
          yAxisID: "cost",
          tension: 0.2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        x: { stacked: true },
        tokens: { stacked: true, position: "left", beginAtZero: true },
        // 右の軸は目盛り線を引かない（左と交差して読みにくくなる）。
        cost: { position: "right", beginAtZero: true, grid: { drawOnChartArea: false } },
      },
    },
  }
}

/**
 * 棒1本の太さの上限（px）。**記録のある日だけを並べる**ので、使い始めや久しぶりに開いたときは
 * 1〜2本しか立たない。上限が無いと1本が描画域の幅いっぱいまで広がり、推移ではなく帯に見える。
 */
const MAX_BAR_WIDTH = 72

/** 積み上げる棒1本ぶん（トークンの軸）。 */
function tokenDataset(
  label: string,
  byDay: readonly DailyTokenUsage[],
  pick: (day: DailyTokenUsage) => number,
): unknown {
  return {
    label,
    data: byDay.map(pick),
    yAxisID: "tokens",
    stack: "tokens",
    maxBarThickness: MAX_BAR_WIDTH,
  }
}
