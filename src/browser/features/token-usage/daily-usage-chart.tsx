// 日ごとの推移（トークン消費の画面のグラフ）。**数そのものを読ませたいところは表、大小と
// 傾きを見せたいところはグラフ**という割り振りで、ここは「どの日が重かったか」と「何が
// 膨らんだのか」を一目で見るためだけにある。
//
// **2枚に分けて描く。** 上は入力・出力・キャッシュ作成の積み上げ棒、下はキャッシュ読みの棒。
// キャッシュ読みはほかより桁が大きく、1本の縦軸に積むとほかの3つが棒の根元に潰れて読めない。
// **同じ日は上下で同じ横位置に来る** — 2枚とも同じ `byDay` の並びをラベルに使い、縦軸の幅を
// {@link Y_AXIS_WIDTH} に固定している（目盛りの桁が違うので、成り行きだと描画域の左端がずれる）。
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

/** 日ごとの推移を2枚に分けて描く（上: 入力・出力・キャッシュ作成、下: キャッシュ読み）。 */
export function DailyUsageChart(props: DailyUsageChartProps): ReactElement {
  return (
    <div className={styles["token-usage-chart-group"]}>
      <SingleDailyChart byDay={props.byDay} config={tokenChartConfig} />
      <SingleDailyChart byDay={props.byDay} config={cacheReadChartConfig} />
    </div>
  )
}

type SingleDailyChartProps = {
  readonly byDay: readonly DailyTokenUsage[]
  /** グラフ1枚ぶんの Chart.js 設定（モジュールの直下に置いた関数を渡すので、参照は安定する）。 */
  readonly config: (byDay: readonly DailyTokenUsage[]) => unknown
}

/** グラフ1枚ぶんの読み込み・描画・後始末（2枚のグラフで共通の骨組み）。 */
function SingleDailyChart(props: SingleDailyChartProps): ReactElement {
  const { byDay, config } = props
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
            drawn = new Chart(canvas, config(byDay))
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
  }, [byDay, config])

  return (
    <div className={styles["token-usage-canvas"]}>
      <canvas ref={canvasRef} />
      {failed ? <p className={styles["token-usage-note"]}>{CHART_FAILED_NOTE}</p> : null}
    </div>
  )
}

/**
 * 上のグラフ（入力・出力・キャッシュ作成の積み上げ棒）の設定。**系列の色は書かない**
 * （内蔵の colors プラグインが配る。`src/browser/lib/chart.ts` のコメント）。高さは入れ物が
 * 決めるので `maintainAspectRatio` は寝かせる（起こしたままだと幅に比例して背が伸び、横に溢れる）。
 */
function tokenChartConfig(byDay: readonly DailyTokenUsage[]): unknown {
  return {
    type: "bar",
    data: {
      labels: dailyLabels(byDay),
      datasets: [
        tokenDataset("入力", byDay, (day) => day.totals.inputTokens),
        tokenDataset("出力", byDay, (day) => day.totals.outputTokens),
        tokenDataset("キャッシュ作成", byDay, (day) => day.totals.cacheCreationInputTokens),
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        x: { stacked: true },
        y: { stacked: true, beginAtZero: true, afterFit: fixAxisWidth },
      },
    },
  }
}

/** 下のグラフ（キャッシュ読みの棒）の設定。桁がほかの3つより大きいので、自分の軸で描く。 */
function cacheReadChartConfig(byDay: readonly DailyTokenUsage[]): unknown {
  return {
    type: "bar",
    data: {
      labels: dailyLabels(byDay),
      datasets: [tokenDataset("キャッシュ読み", byDay, (day) => day.totals.cacheReadInputTokens)],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        x: { stacked: true },
        y: { beginAtZero: true, afterFit: fixAxisWidth },
      },
    },
  }
}

/** 横軸のラベル（`YYYY-MM-DD` → `MM-DD`）。**2枚とも同じ並びを使う**。 */
function dailyLabels(byDay: readonly DailyTokenUsage[]): readonly string[] {
  return byDay.map((day) => day.date.slice(5))
}

/**
 * 縦軸の幅（px）。**上下の2枚で同じ値にする**ことで描画域の左端が揃い、同じ日が同じ横位置に
 * 来る。キャッシュ読みの目盛りが9桁（`100,000,000`）まで収まる幅にしてある。
 */
const Y_AXIS_WIDTH = 84

/**
 * Chart.js の `afterFit`（目盛りの幅を測り終えた直後に呼ばれる）で、縦軸の幅を上書きする。
 * **引数を書き換えるのは Chart.js がこの口に求める作法**で、ほかに幅を決める手段が無い。
 */
function fixAxisWidth(axis: { width: number }): void {
  axis.width = Y_AXIS_WIDTH
}

/**
 * 棒1本の太さの上限（px）。**記録のある日だけを並べる**ので、使い始めや久しぶりに開いたときは
 * 1〜2本しか立たない。上限が無いと1本が描画域の幅いっぱいまで広がり、推移ではなく帯に見える。
 */
const MAX_BAR_WIDTH = 72

/** 積み上げる棒1本ぶん。 */
function tokenDataset(
  label: string,
  byDay: readonly DailyTokenUsage[],
  pick: (day: DailyTokenUsage) => number,
): unknown {
  return {
    label,
    data: byDay.map(pick),
    stack: "tokens",
    maxBarThickness: MAX_BAR_WIDTH,
  }
}
