// `Stats`（数の札の並び）を Markdown に戻さず直接描く。
// 前の値の色・折れ線・帯の幅は `statLayoutOf` が決め、ここは描くだけ。

import clsx from "clsx"
import type { ReactElement } from "react"

import type { A2uiReportComponent } from "../../../../../../shared/report/a2ui-report-catalog.ts"
import { htmlInlineSegments } from "../../../../../../shared/report/report-inline-markdown.ts"
import type { LeafValue } from "../../../../../../shared/report/report-leaf-value.ts"
import {
  STAT_SPARK_HEIGHT,
  STAT_SPARK_RADIUS,
  STAT_SPARK_WIDTH,
  type StatLayout,
  statLayoutOf,
} from "../../../../../../shared/report/stat-layout.ts"
import { InlineCodeText, statsLeafClassNames } from "../markdown/markdown.tsx"
import { FoldedLeafFrame } from "./report-leaf-frame.tsx"

type StatItem = Extract<A2uiReportComponent, { readonly component: "Stats" }>["items"][number]

const BEFORE_CLASS_NAMES = {
  plain: statsLeafClassNames.statBefore,
  better: clsx(statsLeafClassNames.statBefore, statsLeafClassNames.statBetter),
  worse: clsx(statsLeafClassNames.statBefore, statsLeafClassNames.statWorse),
} as const satisfies Record<StatLayout["beforeTone"], string>

/** 項目数（3 か 4）の class。列数が項目数の全部か約数になる。 */
const COUNT_CLASS_NAMES = new Map([
  [3, statsLeafClassNames.statsOf3],
  [4, statsLeafClassNames.statsOf4],
])

export function StatsLeaf(props: {
  readonly part: A2uiReportComponent
  readonly value: LeafValue
}): ReactElement {
  const { part, value } = props
  if (part.component !== "Stats") {
    return <></>
  }
  return (
    <FoldedLeafFrame value={value} title="" fit={false} fold={part.fold} swap={false}>
      <div className={clsx(statsLeafClassNames.stats, COUNT_CLASS_NAMES.get(part.items.length))}>
        {part.items.map((item, index) => (
          <Stat key={`${String(index)}:${item.label}`} item={item} />
        ))}
      </div>
    </FoldedLeafFrame>
  )
}

function Stat(props: { readonly item: StatItem }): ReactElement {
  const { item } = props
  const layout = statLayoutOf(item)
  return (
    <div className={statsLeafClassNames.stat}>
      {item.before.trim() !== "" && (
        <span className={BEFORE_CLASS_NAMES[layout.beforeTone]}>
          <AffixedCodeText lead="" text={item.before} tail=" →" />
        </span>
      )}
      <b>
        <Spark spark={layout.spark} />
        <InlineCodeText text={item.value} />
        {item.total.trim() !== "" && (
          <span className={statsLeafClassNames.statTotal}>
            <AffixedCodeText lead=" / " text={item.total} tail="" />
          </span>
        )}
      </b>
      {layout.meter.kind === "meter" && (
        <span className={statsLeafClassNames.statMeter} aria-hidden="true">
          <span
            className={statsLeafClassNames.statMeterFill}
            style={{ width: `${String(layout.meter.percent)}%` }}
          />
        </span>
      )}
      <InlineCodeText text={item.label} />
    </div>
  )
}

/**
 * 前後に字を足した1行の字。inline code が無ければ1つの text ノードにする
 * （text ノードが割れると、字の送りが旧い描き方と半画素ずれる）。
 */
function AffixedCodeText(props: {
  readonly lead: string
  readonly text: string
  readonly tail: string
}): ReactElement {
  const [only, ...others] = htmlInlineSegments(props.text)
  if (only?.kind === "text" && others.length === 0) {
    return <>{`${props.lead}${only.value}${props.tail}`}</>
  }
  return (
    <>
      {props.lead}
      <InlineCodeText text={props.text} />
      {props.tail}
    </>
  )
}

function Spark(props: { readonly spark: StatLayout["spark"] }): ReactElement {
  const { spark } = props
  if (spark.kind === "none") {
    return <></>
  }
  return (
    <svg
      viewBox={`0 0 ${String(STAT_SPARK_WIDTH)} ${String(STAT_SPARK_HEIGHT)}`}
      aria-hidden="true"
    >
      <polyline points={spark.points.map(({ x, y }) => `${String(x)},${String(y)}`).join(" ")} />
      <circle cx={spark.last.x} cy={spark.last.y} r={STAT_SPARK_RADIUS} />
    </svg>
  )
}
