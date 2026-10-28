// レポートの Markdown の描画一式（react-markdown・highlight.js など）を、初期読み込みの束から `import()` で外して読む口。
// 使い手はここの部品を使い、描画一式のモジュールを直接 import しない（直接 import すると一式が入口の束に戻る）。
//
// 読み終わるまでは高さを持たない空の器に `aria-busy="true"` を出す。
// 読めなかったときは本文を字のまま出し、`aria-busy` を出さない。

import type { ReactElement } from "react"

import type { TIMELINE_MARK_NAMES } from "../../../../../../shared/report/timeline-markdown.ts"
import { deferredModule } from "../../../../../hooks/deferred-module.ts"
import styles from "./markdown.module.css"
import { ZoomableSvgFigure } from "./renderer/figure-zoom.tsx"
import {
  FoldedList as LongBlockFoldedList,
  type FoldedListProps,
} from "./renderer/long-block-fold.tsx"
import type { MarkdownProps, QuestionPreviewMarkdownProps } from "./renderer/markdown-renderer.tsx"
import { MermaidBlock } from "./renderer/mermaid-block.tsx"
import { NoteLabel as NoteLabelView } from "./renderer/note-label.tsx"
import { BeforeAfterSwap, ReportImage } from "./renderer/report-image.tsx"
import notationStyles from "./renderer/report-notation.module.css"

const markdownRenderer = deferredModule(() => import("./renderer/markdown-renderer.tsx"))

/** レポート本文と質問の preview の入れ物の class 名。外の部品が自分の要素に重ねて付ける。 */
export const detailBlockClassName = notationStyles["detail-block"]

/** 塊を横に並べる・枠で包む容れ物の class 名（Markdown の `block-row`・`block-row-cell`・`block-panel` と同じ見た目）。外の部品が自分の要素に付ける。 */
export const arrangedBlockClassNames = {
  row: notationStyles["report-block-row"],
  rowCell: notationStyles["report-block-row-cell"],
  panel: notationStyles["report-block-panel"],
} as const

/** 葉を直接描く部品が題・番号・傍注の包みに付ける class 名（Markdown の `captioned`・`caption`・`with-gutter`・`gutter` などと同じ見た目）。 */
export const leafFrameClassNames = {
  captioned: notationStyles["report-captioned"],
  captionedFit: notationStyles["report-captioned-fit"],
  caption: notationStyles["report-caption"],
  captionNumber: notationStyles["report-caption-number"],
  captionText: notationStyles["report-caption-text"],
  withGutter: notationStyles["report-with-gutter"],
  gutter: notationStyles["report-gutter"],
  gutterNote: notationStyles["report-gutter-note"],
  gutterNoteLabel: notationStyles["report-gutter-note-label"],
} as const

/** 葉を直接描く文字系の部品（一覧・主張）が付ける class 名（Markdown の `labeled-list`・`flow`・`cards`・`claims` などと同じ見た目）。 */
export const textLeafClassNames = {
  labeledList: notationStyles["report-labeled-list"],
  listLabel: notationStyles["report-list-label"],
  listText: notationStyles["report-list-text"],
  taskItem: notationStyles["report-task-item"],
  taskCheck: notationStyles["report-task-check"],
  taskCheckDone: notationStyles["report-task-check-done"],
  flow: notationStyles["report-flow"],
  flowRow: notationStyles["report-flow-row"],
  flowDetailed: notationStyles["report-flow-detailed"],
  flowStep: notationStyles["report-flow-step"],
  flowNumber: notationStyles["report-flow-number"],
  flowRail: notationStyles["report-flow-rail"],
  flowArrow: notationStyles["report-flow-arrow"],
  flowSource: notationStyles["report-flow-source"],
  flowBranch: notationStyles["report-flow-branch"],
  flowBranchOk: notationStyles["report-flow-branch-ok"],
  flowBranchWarn: notationStyles["report-flow-branch-warn"],
  flowBranchNg: notationStyles["report-flow-branch-ng"],
  cards: notationStyles["report-cards"],
  card: notationStyles["report-card"],
  claims: notationStyles["report-claims"],
  claim: notationStyles["report-claim"],
  claimConfirmed: notationStyles["report-claim-confirmed"],
  claimInferred: notationStyles["report-claim-inferred"],
  claimUnverified: notationStyles["report-claim-unverified"],
  claimCertainty: notationStyles["report-claim-certainty"],
  claimMark: notationStyles["report-claim-mark"],
  claimText: notationStyles["report-claim-text"],
  claimBasis: notationStyles["report-claim-basis"],
  claimHow: notationStyles["report-claim-how"],
  claimField: notationStyles["report-claim-field"],
} as const

/** 葉を直接描く注記・候補の部品が付ける class 名（Markdown の `note`・`options` などと同じ見た目）。 */
export const noteLeafClassNames = {
  note: notationStyles["report-note"],
  noteWarn: notationStyles["report-note-warn"],
  noteNg: notationStyles["report-note-ng"],
  noteAsk: notationStyles["report-note-ask"],
  options: notationStyles["report-options"],
  option: notationStyles["report-option"],
  optionAdopt: notationStyles["report-option-adopt"],
  optionConsider: notationStyles["report-option-consider"],
  optionReject: notationStyles["report-option-reject"],
  optionNumber: notationStyles["report-option-number"],
  optionVerdict: notationStyles["report-option-verdict"],
  optionBody: notationStyles["report-option-body"],
  optionName: notationStyles["report-option-name"],
  optionReason: notationStyles["report-option-reason"],
} as const

/** 図の葉が使う印の名前（Markdown の描画が同じ名前に当てる class と同じ見た目）。 */
type FigureMarkName =
  | "svg-figure"
  | "svg-legend"
  | "svg-legend-item"
  | "before-after"
  | "before-after-side"
  | "before-after-label"
  | "before-after-label-after"
  | "before-after-arrow"
  | "before-after-swap"
  | "image-notes"
  | "image-note-list"
  | "image-note-number"
  | "image-note-text"
  | (typeof TIMELINE_MARK_NAMES)[number]
  | "card-chain"
  | "card-chain-card"
  | "card-chain-name"
  | "card-chain-note"
  | "card-chain-tone"
  | `card-chain-tone-${"a" | "b" | "c" | "d" | "e"}`
  | "card-chain-added"
  | "card-chain-removed"
  | "card-chain-changed"
  | "card-chain-arrow"
  | "card-chain-edge"
  | "graph-legend"
  | "graph-legend-item"
  | "graph-legend-swatch"
  | "graph-legend-added"
  | "graph-legend-removed"
  | "graph-legend-changed"
  | "graph-legend-return"
  | `graph-legend-tone-${"a" | "b" | "c" | "d" | "e"}`
  | "graph-legend-shape"
  | `graph-legend-shape-${"round" | "box" | "decision"}`

/** 図の葉の要素に付ける class 名。 */
export function figureClassName(name: FigureMarkName): string | undefined {
  return notationStyles[`report-${name}`]
}

export { ZoomableSvgFigure }

export { BeforeAfterSwap, ReportImage }

/**
 * mermaid のソースを図に描く。
 * フェンスから読んだ code は末尾に改行が付き、図の枠の高さの見積もりがその行を数えるので、同じ形にして渡す。
 */
export function MermaidFigure(props: { readonly source: string }): ReactElement {
  return <MermaidBlock key={props.source} code={`${props.source.replace(/\n$/, "")}\n`} />
}

/** `note` の種別のラベル。 */
export function NoteLabel(props: {
  readonly kindName: string
  readonly label: string
}): ReactElement {
  return <NoteLabelView kindName={props.kindName} label={props.label} />
}

/** 10 件を超える一覧を 10 件で切り、残りを「ほか n 件」を押すと出す。 */
export function FoldedList(props: FoldedListProps): ReactElement {
  return <LongBlockFoldedList {...props} />
}

/** 描画一式を読み込む。何度呼んでも読み込みは1回で、済めば待っている部品が描き直る。 */
export const loadMarkdown = markdownRenderer.load

/** レポート1件分（または塊1つ）の Markdown。 */
export function Markdown(props: MarkdownProps): ReactElement {
  const state = markdownRenderer.useLoadState()
  switch (state.kind) {
    case "loading":
      return <PendingMarkdown />
    case "failed":
      return <PlainText text={props.text} />
    case "ready":
      return <state.module.Markdown text={props.text} />
  }
}

/** 1行の字の行内の記法（太字・inline code・リンク・`{{…}}`）。段落の `p` は付けない。読み込み中は空の `span` に `aria-busy` を出す。 */
export function InlineMarkdown(props: MarkdownProps): ReactElement {
  const state = markdownRenderer.useLoadState()
  switch (state.kind) {
    case "loading":
      return <PendingInline />
    case "failed":
      return <>{props.text}</>
    case "ready":
      return <state.module.InlineMarkdown text={props.text} />
  }
}

/** 1行の字の inline code だけを `code` にして描く（太字やリンクの記法は効かせない）。読み込み中は空の `span` に `aria-busy` を出す。 */
export function InlineCodeText(props: MarkdownProps): ReactElement {
  const state = markdownRenderer.useLoadState()
  switch (state.kind) {
    case "loading":
      return <PendingInline />
    case "failed":
      return <>{props.text}</>
    case "ready":
      return <state.module.InlineCodeText text={props.text} />
  }
}

/** 質問の選択肢の `preview` の Markdown。 */
export function QuestionPreviewMarkdown(props: QuestionPreviewMarkdownProps): ReactElement {
  const state = markdownRenderer.useLoadState()
  switch (state.kind) {
    case "loading":
      return <PendingMarkdown />
    case "failed":
      return <PlainText text={props.text} />
    case "ready":
      return <state.module.QuestionPreviewMarkdown text={props.text} toolUseId={props.toolUseId} />
  }
}

function PendingInline(): ReactElement {
  return <span aria-busy="true" />
}

function PendingMarkdown(): ReactElement {
  return <div aria-busy="true" />
}

function PlainText(props: { readonly text: string }): ReactElement {
  return <p className={styles["plain-text"]}>{props.text}</p>
}
