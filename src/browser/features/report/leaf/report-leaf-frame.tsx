// 内容部品を直接描く部品が共通で使う枠（題・番号・欄外注の外枠）。
// 欄（`[data-report-region]`）の直接の子として、旧い Markdown の描画と同じ class の要素を返す。包みの要素は足さない。
// 図表番号と欄外注は組み立ての段が振った値（`LeafValue`）を描くだけで、数えない。

import clsx from "clsx"
import { type ReactElement, type ReactNode, use } from "react"

import { foldInlineMarks } from "../../../../shared/report/inline-mark.ts"
import type { LeafValue } from "../../../../shared/report/report-leaf-value.ts"
import { type LeafAskSlot, useLeafAskThread } from "../ask-thread-context.ts"
import {
  CompareSwap,
  figureClassName,
  InlineCodeText,
  InlineMarkdown,
  leafFrameClassNames,
  type SwapSettings,
} from "../markdown.tsx"
import { AskFrame, RowAskContext } from "./ask-frame.tsx"
import { AskBadge } from "./ask-thread-view.tsx"
import styles from "./leaf.module.css"
import { ReplyNoteCard, useLeafNotes } from "./reply-note-card.tsx"

const CAPTION_LABELS = { figure: "図", table: "表" } as const

type ReportLeafFrameProps = {
  /** 内容部品の図表番号と欄外注。 */
  readonly value: Pick<LeafValue, "captionNumber" | "gutterNotes">
  /** 題の字。空なら番号だけを描く。番号の無い内容部品では描かない。 */
  readonly title: string
  /** 本体の幅に題の包みを縮めるか（本体が親の幅を取らない塊）。 */
  readonly fit: boolean
  /** 題の行の右端に置く子（表だけ。図の題には置かない）。 */
  readonly captionAside?: ReactNode
  /** 本体。 */
  readonly children: ReactNode
}

/**
 * 題つきの外枠（番号のある内容部品）と、欄外注の列を持つ包み（欄外注のある内容部品）。
 * 表は題が本体の上、図は本体の下。どちらも無い内容部品は本体をそのまま返す。
 */
export function ReportLeafFrame(props: ReportLeafFrameProps): ReactElement {
  return <FoldedLeafFrame {...props} fold="" swap={false} />
}

/**
 * 題の包みごと `details` で畳む枠（図の内容部品・表の内容部品。畳みの外に欄外注の列が付く）。
 * `fold` が空なら畳まない。
 * `swap` が設定なら題の包みを、並べる・切り替えの口を持つ `CompareSwap` にする（両側が画像の見比べの部品）。
 */
export function FoldedLeafFrame(
  props: ReportLeafFrameProps & { readonly fold: string; readonly swap: false | SwapSettings },
): ReactElement {
  const { captionNumber, gutterNotes } = props.value
  const askThread = useLeafAskThread()
  const replyNotes = useLeafNotes()
  const hasCaption = captionNumber.kind !== "none"
  // 題の行が畳みの外にあるときだけ、題の行が部品全体を指す単位になる。畳むと題の行ごと隠れるので、本体の全体を単位にする。
  const unit = hasCaption && props.fold.trim() === "" ? "caption" : "body"
  const caption =
    captionNumber.kind === "none" ? undefined : (
      <LeafCaption
        label={`${CAPTION_LABELS[captionNumber.kind]} ${String(captionNumber.ordinal)}`}
        title={props.title}
        unit={unit === "caption"}
        aside={captionAsideOf(
          captionNumber.kind === "table" ? props.captionAside : undefined,
          askThread,
        )}
      />
    )
  const captionedClassName = clsx(
    leafFrameClassNames.captioned,
    props.fit && leafFrameClassNames.captionedFit,
    captionNumber.kind === "table" && leafFrameClassNames.captionedTable,
    props.swap !== false && figureClassName("compare-swap"),
  )
  const captioned = (
    <LeafFold fold={props.fold} empty={false}>
      {captionNumber.kind === "none" ? (
        props.children
      ) : (
        <CaptionedBox className={captionedClassName} swap={props.swap}>
          {captionNumber.kind === "table" && caption}
          {props.children}
          {captionNumber.kind === "figure" && caption}
        </CaptionedBox>
      )}
    </LeafFold>
  )
  if (gutterNotes.length === 0 && replyNotes.length === 0) {
    return (
      <AskFrame title={props.title} captioned={hasCaption} unit={unit}>
        {captioned}
      </AskFrame>
    )
  }
  return (
    <AskFrame title={props.title} captioned={hasCaption} unit={unit}>
      <div className={leafFrameClassNames.withGutter}>
        {captioned}
        <div className={leafFrameClassNames.gutter}>
          {gutterNotes.map((note, index) => (
            <aside key={`${String(index)}:${note.text}`} className={leafFrameClassNames.gutterNote}>
              <p>
                {note.label !== "" && (
                  <span className={leafFrameClassNames.gutterNoteLabel}>{note.label}</span>
                )}
                <InlineMarkdown text={note.text} />
              </p>
            </aside>
          ))}
          {replyNotes.map((numbered) => (
            <ReplyNoteCard key={numbered.note.id} numbered={numbered} />
          ))}
        </div>
      </div>
    </AskFrame>
  )
}

/**
 * `fold` が空でなければ本体を `details` で畳む。本体が空なら畳まない。
 * `summary` の字は `{{…}}` の印を素の字に畳んだもの。
 */
export function LeafFold(props: {
  readonly fold: string
  readonly empty: boolean
  readonly children: ReactNode
}): ReactElement {
  if (props.fold.trim() === "" || props.empty) {
    return <>{props.children}</>
  }
  return (
    <details>
      <summary>{foldInlineMarks(props.fold).replace(/\s+/g, " ").trim()}</summary>
      {props.children}
    </details>
  )
}

function CaptionedBox(props: {
  readonly className: string
  readonly swap: false | SwapSettings
  readonly children: ReactNode
}): ReactElement {
  return props.swap !== false ? (
    <CompareSwap className={props.className} settings={props.swap}>
      {props.children}
    </CompareSwap>
  ) : (
    <div className={props.className}>{props.children}</div>
  )
}

function captionAsideOf(aside: ReactNode, askThread: LeafAskSlot): ReactNode {
  if (askThread.kind === "none") {
    return aside
  }
  return (
    <span className={styles["ask-caption-aside"]}>
      {aside}
      <AskBadge thread={askThread.thread} />
    </span>
  )
}

function LeafCaption(props: {
  readonly label: string
  readonly title: string
  /** 題の行が部品全体を指す単位か。 */
  readonly unit: boolean
  readonly aside?: ReactNode
}): ReactElement {
  const rowAsk = use(RowAskContext)
  const unit = props.unit && rowAsk.kind === "available"
  const unitAttributes = {
    "data-reply-unit": unit ? "leaf" : undefined,
    "data-pointed": unit && rowAsk.isPointed() ? "" : undefined,
    tabIndex: unit ? rowAsk.tabIndexOf() : undefined,
  }
  const heading = (
    <>
      <span className={leafFrameClassNames.captionNumber}>{props.label}</span>
      {props.title !== "" && (
        <span className={leafFrameClassNames.captionText}>
          <InlineCodeText text={props.title} />
        </span>
      )}
    </>
  )
  if (props.aside === undefined) {
    return (
      <div
        className={clsx(leafFrameClassNames.caption, unit && styles["reply-unit"])}
        {...unitAttributes}
      >
        {heading}
      </div>
    )
  }
  return (
    <div
      className={clsx(
        leafFrameClassNames.caption,
        styles["caption-with-aside"],
        unit && styles["reply-unit"],
      )}
      {...unitAttributes}
    >
      <span>{heading}</span>
      {props.aside}
    </div>
  )
}
