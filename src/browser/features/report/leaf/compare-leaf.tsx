// `Compare`（2つを左右に並べて見比べる）を Markdown に戻さず直接描く。
// 対等（versus）で両側が箇条なら、見出しと箇条の札（Markdown の `compare` と同じ見た目）。
// ほかは側ごとに画像・コード・箇条・mermaid・svg を並べ、前後（before-after）は札を「前」「後」にして間に矢印を置く。
// 両側が画像のときだけ見せ方の口を持つ包みにし、「重ねる」は前後でだけ出す。

import clsx from "clsx"
import type { ReactElement } from "react"

import type { A2uiReportComponent } from "../../../../shared/report/a2ui-report-catalog.ts"
import type { ReportImageSource } from "../../../../shared/report/report-image-markdown.ts"
import { formatImageRegion } from "../../../../shared/report/report-image.ts"
import { fencedMarkdown } from "../../../../shared/report/report-inline-markdown.ts"
import type { LeafValue } from "../../../../shared/report/report-leaf-value.ts"
import { comparisonImageAltOf } from "../domain/report-comparison-markdown.ts"
import {
  CodeFence,
  compareLeafClassNames,
  diffLines,
  figureClassName,
  FoldedList,
  InlineCodeText,
  Markdown,
  MermaidFigure,
  type SideLineDiff,
  sideLines,
  type SwapSettings,
  SwapSideContext,
} from "../markdown.tsx"
import { PictureImage } from "./picture-leaf.tsx"
import { FoldedLeafFrame } from "./report-leaf-frame.tsx"
import { SvgFigureView } from "./svg-leaf.tsx"

type ComparePart = Extract<A2uiReportComponent, { readonly component: "Compare" }>

type CompareSide = ComparePart["sides"][number]

type SidePosition = "before" | "after"

const POSITIONS = ["before", "after"] as const satisfies readonly SidePosition[]

const BEFORE_AFTER_LABELS = { before: "前", after: "後" } as const satisfies Record<
  SidePosition,
  string
>

/** 対等な2つで見出しが空の側の、見本と拡大の面の札。 */
const VERSUS_FALLBACK_LABELS = { before: "左", after: "右" } as const satisfies Record<
  SidePosition,
  string
>

export function CompareLeaf(props: {
  readonly part: A2uiReportComponent
  readonly value: LeafValue
  readonly imageSource: ReportImageSource
}): ReactElement {
  const part = props.part
  if (part.component !== "Compare") {
    return <></>
  }
  const [before, after] = part.sides
  if (before === undefined || after === undefined) {
    return <></>
  }
  if (part.relation === "versus" && part.sides.every((side) => side.kind === "points")) {
    return <PointsCompare part={part} value={props.value} />
  }
  const lineDiffs = lineDiffsOf(part.relation, before, after)
  const labels = POSITIONS.map((position, index) =>
    sideLabelOf(part.relation, position, part.sides[index]?.heading ?? ""),
  )
  const swap: false | SwapSettings = before.kind === "image" &&
    after.kind === "image" && {
      labels: {
        before: labels[0] || VERSUS_FALLBACK_LABELS.before,
        after: labels[1] || VERSUS_FALLBACK_LABELS.after,
      },
      overlay: part.relation === "before-after",
    }
  return (
    <FoldedLeafFrame
      value={props.value}
      title={part.title}
      fit={false}
      fold={part.fold}
      swap={swap}
    >
      <div
        className={clsx(
          figureClassName("compare-figure"),
          part.relation === "versus" && figureClassName("compare-versus"),
        )}
      >
        <SideView
          position="before"
          label={labels[0] ?? ""}
          accent={false}
          content={before}
          lineDiff={lineDiffs?.before}
          title={part.title}
          imageSource={props.imageSource}
        />
        {part.relation === "before-after" && (
          <div className={figureClassName("compare-arrow")} aria-hidden="true">
            →
          </div>
        )}
        <SideView
          position="after"
          label={labels[1] ?? ""}
          accent={part.relation === "before-after"}
          content={after}
          lineDiff={lineDiffs?.after}
          title={part.title}
          imageSource={props.imageSource}
        />
      </div>
      {lineDiffs !== undefined && <CodeDiffLegend lineDiffs={lineDiffs} />}
    </FoldedLeafFrame>
  )
}

type LineDiffPair = { readonly before: SideLineDiff; readonly after: SideLineDiff }

/** 前後の両側が code のときだけ行の差を取る。比べない（上限超え）なら `undefined`。 */
function lineDiffsOf(
  relation: ComparePart["relation"],
  before: CompareSide,
  after: CompareSide,
): LineDiffPair | undefined {
  if (relation !== "before-after" || before.kind !== "code" || after.kind !== "code") {
    return undefined
  }
  const aligned = diffLines(before.source, after.source)
  return aligned === undefined
    ? undefined
    : {
        before: { side: "before", lines: sideLines(aligned, "before") },
        after: { side: "after", lines: sideLines(aligned, "after") },
      }
}

const LEGEND_CHANGE_WORDS = {
  before: { changed: "変えた", other: "消した", position: "前" },
  after: { changed: "変えた", other: "足した", position: "後" },
} as const satisfies Record<
  SidePosition,
  { readonly changed: string; readonly other: string; readonly position: string }
>

/** 印の付いた種別だけを語にする。印の行が1つも無い側は項目を出さない。 */
function CodeDiffLegend(props: { readonly lineDiffs: LineDiffPair }): ReactElement {
  const items = POSITIONS.flatMap((position) => {
    const changes = new Set(
      props.lineDiffs[position].lines.flatMap((line) =>
        line.kind === "line" && line.change !== "same" ? [line.change] : [],
      ),
    )
    const words = LEGEND_CHANGE_WORDS[position]
    const named = [
      ...(changes.has("changed") ? [words.changed] : []),
      ...(changes.has("removed") || changes.has("added") ? [words.other] : []),
    ]
    return named.length === 0
      ? []
      : [{ position, text: `${named.join("・")}行（${words.position}）` }]
  })
  if (items.length === 0) {
    return <></>
  }
  return (
    <div className={compareLeafClassNames.codeLegend}>
      {items.map((item) => (
        <span key={item.position} className={compareLeafClassNames.codeLegendItem}>
          <span
            className={
              item.position === "before"
                ? compareLeafClassNames.codeLegendBefore
                : compareLeafClassNames.codeLegendAfter
            }
            aria-hidden="true"
          />
          {item.text}
        </span>
      ))}
    </div>
  )
}

/** 前後の札は「前」「後」で、見出しがあれば括弧で添える。対等な2つの札は見出しそのもの。 */
function sideLabelOf(
  relation: ComparePart["relation"],
  position: SidePosition,
  heading: string,
): string {
  if (relation === "versus") {
    return heading.trim()
  }
  const label = BEFORE_AFTER_LABELS[position]
  return heading.trim() === "" ? label : `${label}（${heading.trim()}）`
}

function PointsCompare(props: {
  readonly part: ComparePart
  readonly value: LeafValue
}): ReactElement {
  const { part } = props
  return (
    <FoldedLeafFrame
      value={props.value}
      title={part.title}
      fit={false}
      fold={part.fold}
      swap={false}
    >
      <div className={compareLeafClassNames.compare}>
        {part.sides.map(
          (side, index) =>
            side.kind === "points" && (
              <div
                key={`${String(index)}:${side.heading}`}
                className={compareLeafClassNames.compareSide}
              >
                <div className={compareLeafClassNames.compareHeading}>
                  <InlineCodeText text={side.heading} />
                </div>
                <FoldedList renderList={(items) => <ul>{items}</ul>}>
                  {side.points.map((point, pointIndex) => (
                    <li key={`${String(pointIndex)}:${point}`}>
                      <InlineCodeText text={point} />
                    </li>
                  ))}
                </FoldedList>
              </div>
            ),
        )}
      </div>
    </FoldedLeafFrame>
  )
}

function SideView(props: {
  readonly position: SidePosition
  readonly label: string
  readonly accent: boolean
  readonly content: CompareSide
  /** 前後の両側が code のときの、この側の行の並び。 */
  readonly lineDiff?: SideLineDiff
  readonly title: string
  readonly imageSource: ReportImageSource
}): ReactElement {
  const labelClassName = clsx(
    figureClassName("compare-label"),
    props.accent && figureClassName("compare-label-after"),
  )
  return (
    <SwapSideContext value={props.position}>
      <div className={figureClassName("compare-figure-side")} data-side={props.position}>
        {props.label !== "" && (
          <div className={labelClassName}>
            <InlineCodeText text={props.label} />
          </div>
        )}
        <SideContent
          content={props.content}
          lineDiff={props.lineDiff}
          imageLabel={`${props.label || VERSUS_FALLBACK_LABELS[props.position]}の画面`}
          title={props.title}
          imageSource={props.imageSource}
        />
      </div>
    </SwapSideContext>
  )
}

function SideContent(props: {
  readonly content: CompareSide
  readonly lineDiff?: SideLineDiff
  readonly imageLabel: string
  readonly title: string
  readonly imageSource: ReportImageSource
}): ReactElement {
  const { content } = props
  switch (content.kind) {
    case "image":
      return (
        <PictureImage
          imageSource={props.imageSource}
          path={content.path}
          alt={comparisonImageAltOf(props.imageLabel, props.title)}
          region={content.region === undefined ? undefined : formatImageRegion(content.region)}
        />
      )
    case "code":
      return props.lineDiff === undefined ? (
        <Markdown text={fencedMarkdown(content.language, content.source)} />
      ) : (
        <CodeFence
          language={content.language}
          path=""
          marks={[]}
          source={content.source}
          lineDiff={props.lineDiff}
        />
      )
    case "points":
      return (
        <ul>
          {content.points.map((point, index) => (
            <li key={`${String(index)}:${point}`}>
              <InlineCodeText text={point} />
            </li>
          ))}
        </ul>
      )
    case "mermaid":
      return <MermaidFigure source={content.source} />
    case "svg":
      return <SvgFigureView figure={content} />
  }
}
