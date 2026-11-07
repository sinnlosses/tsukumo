// `Stats`（数のカードの並び）を Markdown に戻さず直接描く。
// 前の値の色・折れ線・帯の幅・目標の達否は `statLayoutOf` が決め、ここは描くだけ。

import clsx from "clsx"
import type { ReactElement } from "react"

import type { A2uiReportComponent } from "../../../../shared/report/a2ui-report-catalog.ts"
import { htmlInlineSegments } from "../../../../shared/report/report-inline-markdown.ts"
import type { LeafValue } from "../../../../shared/report/report-leaf-value.ts"
import type { MainViewKeyFigure } from "../../../../shared/session/main-view-shape.ts"
import {
  STAT_SPARK_HEIGHT,
  STAT_SPARK_RADIUS,
  STAT_SPARK_WIDTH,
  type StatLayout,
  statLayoutOf,
} from "../domain/stat-layout.ts"
import { InlineCodeText, statsLeafClassNames } from "../markdown.tsx"
import { FoldedLeafFrame } from "./report-leaf-frame.tsx"

type StatItem = MainViewKeyFigure

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
      <StatCards items={part.items} />
    </FoldedLeafFrame>
  )
}

export function StatCards(props: { readonly items: readonly StatItem[] }): ReactElement {
  const targeted = props.items.some((item) => item.target.trim() !== "")
  return (
    <div className={clsx(statsLeafClassNames.stats, COUNT_CLASS_NAMES.get(props.items.length))}>
      {props.items.map((item, index) => (
        <Stat key={`${String(index)}:${item.label}`} item={item} targeted={targeted} />
      ))}
    </div>
  )
}

function Stat(props: { readonly item: StatItem; readonly targeted: boolean }): ReactElement {
  const { item } = props
  const layout = statLayoutOf(item)
  const missed = layout.target.kind === "target" && layout.target.verdict === "missed"
  const before = item.before.trim() !== "" && (
    <span className={BEFORE_CLASS_NAMES[layout.beforeTone]}>
      <AffixedCodeText lead="" text={item.before} tail=" →" />
    </span>
  )
  return (
    <div className={clsx(statsLeafClassNames.stat, missed && statsLeafClassNames.statMissed)}>
      {layout.spark.kind === "none" ? (
        before
      ) : (
        <span className={statsLeafClassNames.statTrend}>
          {before}
          <Spark spark={layout.spark} />
        </span>
      )}
      <b>
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
      {props.targeted && <TargetLine item={item} target={layout.target} />}
    </div>
  )
}

const TARGET_DIRECTION_WORDS = {
  up: " 以上",
  down: " 以下",
  "": "",
} as const satisfies Record<StatItem["better"], string>

const VERDICT_MARKS = {
  met: { lead: "✓ 達成", className: statsLeafClassNames.statVerdictMet },
  missed: { lead: "✕ 未達", className: statsLeafClassNames.statVerdictMissed },
} as const

/** label の下の目標の行と、比べられたときの達否の印。目標の無い札は「目標なし」。 */
function TargetLine(props: {
  readonly item: StatItem
  readonly target: StatLayout["target"]
}): ReactElement {
  const { item, target } = props
  if (target.kind === "none") {
    return <div className={statsLeafClassNames.statTarget}>目標なし</div>
  }
  const { verdict } = target
  return (
    <div className={statsLeafClassNames.statTarget}>
      <AffixedCodeText lead="目標 " text={item.target} tail={TARGET_DIRECTION_WORDS[item.better]} />
      {verdict !== "unknown" && <Verdict verdict={verdict} gap={item.targetGap} />}
    </div>
  )
}

function Verdict(props: {
  readonly verdict: keyof typeof VERDICT_MARKS
  readonly gap: string
}): ReactElement {
  const { lead, className } = VERDICT_MARKS[props.verdict]
  return (
    <span className={clsx(statsLeafClassNames.statVerdict, className)}>
      {props.gap.trim() === "" ? lead : `${lead} ${props.gap}`}
    </span>
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
