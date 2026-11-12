// 内容部品の中の単位（行・案・主張）が、自分の印を読む口と、押して指せる行の部品、単位の横の「聞 n」「頼 n」の印。

import clsx from "clsx"
import { createContext, type ReactElement, type ReactNode, use, useRef } from "react"

import { Button } from "../../../components/ui/button/button.tsx"
import styles from "./leaf.module.css"

/** 単位について聞いた対の数と、頼んだ付箋の数。 */
export type UnitMarks = {
  readonly asked: number
  readonly requested: number
}

/** 単位が自分の印（指した・欄を開いた・聞いた）を読む口。`none` の部品は単位の印を出さない。 */
export type RowAsk =
  | { readonly kind: "none" }
  | {
      readonly kind: "available"
      /** その行を指しているか。添字を渡さなければ部品全体を指しているか。 */
      readonly isPointed: (index?: number) => boolean
      /** その行について欄が開いているか（欄は余白の札に出し、行には印を付ける）。 */
      readonly isOpen: (index: number) => boolean
      /** その単位について聞いた数と頼んだ数（添字を渡さなければ部品全体）。 */
      readonly marksOf: (index?: number) => UnitMarks
      /** 印を押したとき。広い幅ではその単位を指し、狭い幅ではその単位の札をシートに出す。 */
      readonly showUnit: (frame: Element, index?: number) => void
      /** 単位の `tabIndex`。部品の中で Tab の止まり場は1つ（前に入っていた単位、無ければ部品全体の単位）で、ほかは -1。 */
      readonly tabIndexOf: (index?: number) => 0 | -1
    }

export const RowAskContext = createContext<RowAsk>({ kind: "none" })

/** 案・主張の行。単位の口があれば押して指せる行にし、指した印を付ける。 */
export function ReplyUnitRow(props: {
  /** 書いた並びの添字。 */
  readonly index: number
  /** 指した所の行の字。 */
  readonly label: string
  /** 頼むの欄の書き始めの字。 */
  readonly requestText: string
  readonly className: string
  readonly children: ReactNode
}): ReactElement {
  const rowAsk = use(RowAskContext)
  if (rowAsk.kind === "none") {
    return <div className={props.className}>{props.children}</div>
  }
  return (
    <div
      className={clsx(props.className, styles["reply-unit"])}
      data-reply-unit="row"
      data-reply-row={props.index}
      data-reply-label={props.label}
      data-reply-request={props.requestText}
      data-pointed={rowAsk.isPointed(props.index) ? "" : undefined}
      tabIndex={rowAsk.tabIndexOf(props.index)}
    >
      <ReplyUnitMark index={props.index} corner />
      {props.children}
    </div>
  )
}

/** 単位の横の「聞 n」「頼 n」。聞いた・頼んだ数が 0 なら何も出さない。`corner` は単位の右上に置く。 */
export function ReplyUnitMark(props: {
  readonly index?: number
  readonly corner?: boolean
}): ReactElement {
  const rowAsk = use(RowAskContext)
  const markRef = useRef<HTMLSpanElement>(null)
  if (rowAsk.kind === "none") {
    return <></>
  }
  const { asked, requested } = rowAsk.marksOf(props.index)
  const show = () => {
    const frame = markRef.current?.closest("[data-reply-frame]")
    if (frame !== null && frame !== undefined) {
      rowAsk.showUnit(frame, props.index)
    }
  }
  return (
    <>
      {asked + requested > 0 && (
        <span
          ref={markRef}
          className={clsx(
            styles["reply-mark"],
            props.corner === true && styles["reply-mark-corner"],
          )}
        >
          {asked > 0 && <MarkButton label={`聞 ${String(asked)}`} onClick={show} />}
          {requested > 0 && <MarkButton label={`頼 ${String(requested)}`} onClick={show} />}
        </span>
      )}
    </>
  )
}

function MarkButton(props: { readonly label: string; readonly onClick: () => void }): ReactElement {
  return (
    <Button
      variant="ghost"
      size="label"
      pressed="none"
      disabled={false}
      disclosure={{ kind: "none" }}
      className={styles["reply-mark-button"]}
      onClick={props.onClick}
    >
      {props.label}
    </Button>
  )
}
