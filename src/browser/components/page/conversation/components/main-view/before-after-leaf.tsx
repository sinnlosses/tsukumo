// `BeforeAfter`（変更の前と後を並べる）を Markdown に戻さず直接描く。
// 側ごとに画像・コード・箇条・mermaid・svg のどれか。両側が画像のときだけ、並べる・切り替えの口を持つ包みにする。

import clsx from "clsx"
import type { ReactElement } from "react"

import type { A2uiReportComponent } from "../../../../../../shared/report/a2ui-report-catalog.ts"
import { beforeAfterImageAltOf } from "../../../../../../shared/report/report-comparison-markdown.ts"
import type { ReportImageSource } from "../../../../../../shared/report/report-image-markdown.ts"
import { formatImageRegion } from "../../../../../../shared/report/report-image.ts"
import { fencedMarkdown } from "../../../../../../shared/report/report-inline-markdown.ts"
import type { LeafValue } from "../../../../../../shared/report/report-leaf-value.ts"
import { figureClassName, InlineCodeText, Markdown, MermaidFigure } from "../markdown/markdown.tsx"
import { PictureImage } from "./picture-leaf.tsx"
import { FoldedLeafFrame } from "./report-leaf-frame.tsx"
import { SvgFigureView } from "./svg-leaf.tsx"

type BeforeAfterPart = Extract<A2uiReportComponent, { readonly component: "BeforeAfter" }>

type Side = BeforeAfterPart["before"]

const SIDE_LABELS = { before: "前", after: "後" } as const

export function BeforeAfterLeaf(props: {
  readonly part: A2uiReportComponent
  readonly value: LeafValue
  readonly imageSource: ReportImageSource
}): ReactElement {
  const { part, value, imageSource } = props
  if (part.component !== "BeforeAfter") {
    return <></>
  }
  return (
    <FoldedLeafFrame
      value={value}
      title={part.title}
      fit={false}
      fold={part.fold}
      swap={part.before.kind === "image" && part.after.kind === "image"}
    >
      <div className={figureClassName("before-after")}>
        <SideView
          position="before"
          content={part.before}
          title={part.title}
          imageSource={imageSource}
        />
        <div className={figureClassName("before-after-arrow")} aria-hidden="true">
          →
        </div>
        <SideView
          position="after"
          content={part.after}
          title={part.title}
          imageSource={imageSource}
        />
      </div>
    </FoldedLeafFrame>
  )
}

function SideView(props: {
  readonly position: keyof typeof SIDE_LABELS
  readonly content: Side
  readonly title: string
  readonly imageSource: ReportImageSource
}): ReactElement {
  const label = SIDE_LABELS[props.position]
  const labelClassName = clsx(
    figureClassName("before-after-label"),
    props.position === "after" && figureClassName("before-after-label-after"),
  )
  return (
    <div className={figureClassName("before-after-side")}>
      <div className={labelClassName}>{label}</div>
      <SideContent
        content={props.content}
        imageLabel={`${label}の画面`}
        title={props.title}
        imageSource={props.imageSource}
      />
    </div>
  )
}

function SideContent(props: {
  readonly content: Side
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
          alt={beforeAfterImageAltOf(props.imageLabel, props.title)}
          region={content.region === undefined ? undefined : formatImageRegion(content.region)}
        />
      )
    case "code":
      return <Markdown text={fencedMarkdown(content.language, content.source)} />
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
