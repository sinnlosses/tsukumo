// 期間の消費の札1枚（トークン消費の画面。`presentational-token-usage.tsx` が4枚並べる）。
// 見出し・期間の合計・その数だけの小さな棒グラフを1枚に閉じる。
//
// 札ごとに縦軸が独立する。 棒の高さはその札の中の最大で割るので、桁の違う数（キャッシュ
// 読みはほかより3桁大きいことがある）を並べても互いに潰れない。札をまたいで高さを比べる
// ものではないので、いちばん高い棒に「最大 <数>」を添えて縦軸の代わりにする。
//
// Chart.js は使わない。 軸も凡例も目盛りも無い棒で、描くのに要るのは高さの割合だけ。
// 4枚を同時に出すこの画面では、canvas 4枚と読み込みが失敗した回の見せ方を抱えるより、
// 必ず描ける CSS のほうが軽い（`src/browser/components/page/conversation/components/main-view/markdown/chart.ts` は読まない）。

import { type ReactElement } from "react"

import {
  type TokenUsageTotals,
  type TokenUsageTrend,
  type TokenUsageTrendUnit,
} from "../../../../../../shared/token-usage-summary.ts"
import { formatCount } from "../../../../../utils/format-count.ts"
import { HStack } from "../../../../ui/h-stack/h-stack.tsx"
import styles from "../../token-usage.module.css"

export type PeriodUsageCardProps = {
  /** 何の数か（入力・出力・キャッシュ読み・キャッシュ作成）。 */
  readonly label: string
  /** 期間の合計（書き方は呼ぶ側が当てたあとの文字列）。 */
  readonly value: string
  /** 期間の推移（点の数と両端は期間から決まっている）。 */
  readonly trend: TokenUsageTrend
  /** 棒にする数を合計の並びから1つ選ぶ。 */
  readonly pick: (totals: TokenUsageTotals) => number
}

/** 期間の合計1つぶんの札（見出し・数・小さな棒グラフ）。 */
export function PeriodUsageCard(props: PeriodUsageCardProps): ReactElement {
  const values = props.trend.points.map((point) => props.pick(point.totals))
  const peak = Math.max(0, ...values)

  return (
    <section className={styles["usage-card"]}>
      <h3 className={styles["usage-card-label"]}>{props.label}</h3>
      <p className={styles["usage-card-value"]}>{props.value}</p>
      <p className={peakClassName(values, peak)}>{`最大 ${formatCount(peak)}`}</p>
      <div className={styles["usage-card-bars"]}>
        {props.trend.points.map((point) => (
          <span
            key={point.key}
            className={barClassName(props.pick(point.totals))}
            style={{ "--usage-bar-height": barHeight(props.pick(point.totals), peak) }}
          />
        ))}
      </div>
      <HStack
        element="p"
        name={{ kind: "none" }}
        ref={undefined}
        gap="sm"
        align="stretch"
        justify="between"
        wrap="nowrap"
        className={styles["usage-card-scale"] ?? ""}
      >
        <span>{edgeLabel(props.trend, "first")}</span>
        <span>{edgeLabel(props.trend, "last")}</span>
      </HStack>
    </section>
  )
}

/**
 * 「最大 <数>」をどちら端に寄せるか。いちばん高い棒に近い側へ寄せる（棒のちょうど真上に
 * 重ねると、端の棒が最大だった回に札の外へはみ出す）。棒が無い回は左。
 */
function peakClassName(values: readonly number[], peak: number): string {
  const index = values.indexOf(peak)
  const side = index * 2 < values.length ? "usage-card-peak-left" : "usage-card-peak-right"
  return `${styles["usage-card-peak"]} ${styles[side]}`
}

/**
 * 棒1本の綴り。記録の無い刻みは塗りを落とす（高さの印だけを残す。同じ塗りのままだと、
 * 空だった刻みと「少しだけ使った」刻みが同じに見える）。
 */
function barClassName(value: number): string {
  const zero = value === 0 ? ` ${styles["usage-card-bar-zero"]}` : ""
  return `${styles["usage-card-bar"]}${zero}`
}

/**
 * 棒1本の高さ（その札の最大に対する割合）。0 の刻みも 0% の棒として並ぶ（棒の最小の高さは
 * CSS が持つので、記録の無い日も印として見える）。最大が 0 なら全部 0%。
 */
function barHeight(value: number, peak: number): string {
  return peak === 0 ? "0%" : `${(value / peak) * 100}%`
}

/**
 * 期間の端のラベル（最初と最後だけ）。途中の刻みには付けない — 30日なら30本、今日なら
 * 24本が札の幅（狭い画面では10rem ほど）に並ぶので、全部に付けると重なって読めない。
 */
function edgeLabel(trend: TokenUsageTrend, edge: "first" | "last"): string {
  const point = edge === "first" ? trend.points.at(0) : trend.points.at(-1)
  return point === undefined ? "" : formatTrendKey(point.key, trend.unit)
}

/** 刻みの鍵を人の読む形に（日は `MM-DD`、時は `0時`）。 */
function formatTrendKey(key: string, unit: TokenUsageTrendUnit): string {
  return unit === "hour" ? `${Number(key)}時` : key.slice(5)
}
