// 葉を直接描く部品が共通で使う枠（題・番号・傍注の包み）。
// 欄（`[data-report-region]`）の直接の子として、旧い Markdown の描画と同じ class の要素を返す。包みの要素は足さない。
// 図表番号と傍注は組み立ての段が振った値（`LeafValue`）を描くだけで、数えない。

import clsx from "clsx"
import type { ReactElement, ReactNode } from "react"

import { foldInlineMarks } from "../../../../../../shared/report/inline-mark.ts"
import type { LeafValue } from "../../../../../../shared/report/report-leaf-value.ts"
import { PAUSE_POINT_CLASS_NAME } from "../../../../../../shared/report/report-pause-point.ts"
import {
  BeforeAfterSwap,
  figureClassName,
  InlineCodeText,
  InlineMarkdown,
  leafFrameClassNames,
} from "../markdown/markdown.tsx"

/** 書き上げる演出（`planReveal`）が題の行・傍注の柱を見分ける印の属性。 */
const REVEAL_CAPTION_ATTRIBUTE = "data-reveal-caption"
const REVEAL_GUTTER_ATTRIBUTE = "data-reveal-gutter"

const CAPTION_LABELS = { figure: "図", table: "表" } as const

type ReportLeafFrameProps = {
  /** 葉の図表番号と傍注。 */
  readonly value: Pick<LeafValue, "captionNumber" | "gutterNotes">
  /** 題の字。空なら番号だけを描く。番号の無い葉では描かない。 */
  readonly title: string
  /** 本体の幅に題の包みを縮めるか（本体が親の幅を取らない塊）。 */
  readonly fit: boolean
  /** 本体。 */
  readonly children: ReactNode
}

/**
 * 題つきの包み（番号のある葉）と、傍注の柱を持つ包み（傍注のある葉）。
 * 表は題が本体の上、図は本体の下。どちらも無い葉は本体をそのまま返す。
 */
export function ReportLeafFrame(props: ReportLeafFrameProps): ReactElement {
  return <FoldedLeafFrame {...props} fold="" swap={false} />
}

/**
 * 題の包みごと `details` で畳む枠（図の葉・表の葉。畳みの外に傍注の柱が付く）。
 * `fold` が空なら畳まない。
 * `swap` が真なら題の包みを、並べる・切り替えの口を持つ `BeforeAfterSwap` にする（両側が画像の前後の塊）。
 */
export function FoldedLeafFrame(
  props: ReportLeafFrameProps & { readonly fold: string; readonly swap: boolean },
): ReactElement {
  const { captionNumber, gutterNotes } = props.value
  const caption =
    captionNumber.kind === "none" ? undefined : (
      <LeafCaption
        label={`${CAPTION_LABELS[captionNumber.kind]} ${String(captionNumber.ordinal)}`}
        title={props.title}
      />
    )
  const captionedClassName = clsx(
    leafFrameClassNames.captioned,
    props.fit && leafFrameClassNames.captionedFit,
    props.swap && figureClassName("before-after-swap"),
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
  if (gutterNotes.length === 0) {
    return <>{captioned}</>
  }
  return (
    <div className={leafFrameClassNames.withGutter}>
      {captioned}
      <div className={leafFrameClassNames.gutter} {...{ [REVEAL_GUTTER_ATTRIBUTE]: "" }}>
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
      </div>
    </div>
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

/**
 * 筆を留める印（`report-pause-point`）を付ける入れ物。
 * `className` は葉が持つ class で、印はその要素に足す。
 */
export function ReportPausePoint(props: {
  readonly className: string
  readonly children: ReactNode
}): ReactElement {
  return <div className={clsx(props.className, PAUSE_POINT_CLASS_NAME)}>{props.children}</div>
}

function CaptionedBox(props: {
  readonly className: string
  readonly swap: boolean
  readonly children: ReactNode
}): ReactElement {
  return props.swap ? (
    <BeforeAfterSwap className={props.className}>{props.children}</BeforeAfterSwap>
  ) : (
    <div className={props.className}>{props.children}</div>
  )
}

function LeafCaption(props: { readonly label: string; readonly title: string }): ReactElement {
  return (
    <div className={leafFrameClassNames.caption} {...{ [REVEAL_CAPTION_ATTRIBUTE]: "" }}>
      <span className={leafFrameClassNames.captionNumber}>{props.label}</span>
      {props.title !== "" && (
        <span className={leafFrameClassNames.captionText}>
          <InlineCodeText text={props.title} />
        </span>
      )}
    </div>
  )
}
