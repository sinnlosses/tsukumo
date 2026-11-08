// 内容部品の外枠に「聞く」を足す。口が渡され、節の中の内容部品のときだけ包んで右上にボタンを出す。
// それ以外は子をそのまま返す（包みの要素を足さない）。
// 開いている入力欄は部品の中で1つ。部品全体の欄と表の行の欄は、同じ状態を取り合う。

import { createContext, type ReactElement, type ReactNode, use, useState } from "react"

import type { ReplyTarget } from "../../../../shared/session/reply-target.ts"
import { Button } from "../../../components/ui/button/button.tsx"
import { useReplyNotes, useReplySessionKey } from "../../../stores/reply-note-list.ts"
import { useLeafAskThread } from "../ask-thread-context.ts"
import type { AskPair } from "../domain/ask-thread.ts"
import { replyTargetOf } from "../domain/reply-target.ts"
import { LeafIdentityContext, SectionPointContext } from "../leaf-point-context.ts"
import { ReplyPortContext } from "../reply-port.ts"
import { AskBox, type AskMode } from "./ask-box.tsx"
import { AskThreadView } from "./ask-thread-view.tsx"
import styles from "./leaf.module.css"

/** 表が行ごとに「聞く」を出すための口。`none` の表は行のボタンを出さない。 */
export type RowAsk =
  | { readonly kind: "none" }
  | {
      readonly kind: "available"
      /** 元の行の添字と1列目の字で、その行の下に欄を開く。 */
      readonly openRow: (index: number, firstCell: string) => void
      /** 同じ行について、頼む（付箋にする）の入力欄を開く。 */
      readonly openRowNote: (index: number, firstCell: string) => void
      /** その行について欄が開いているか（欄は表の下に出し、行には印を付ける）。 */
      readonly isOpen: (index: number) => boolean
      /** その行について聞いたことがあるか（行に印の線を付ける）。 */
      readonly isAsked: (index: number) => boolean
    }

export const RowAskContext = createContext<RowAsk>({ kind: "none" })

type AskScope =
  | { readonly kind: "leaf" }
  | { readonly kind: "row"; readonly index: number; readonly firstCell: string }

type OpenAsk =
  | { readonly kind: "closed" }
  | {
      readonly kind: "open"
      readonly scope: AskScope
      readonly mode: AskMode
      readonly initialText: string
    }

type RowTargetSlot =
  | { readonly kind: "none" }
  | {
      readonly kind: "available"
      readonly sessionKey: string
      readonly targetOf: (row?: {
        readonly index: number
        readonly firstCell: string
      }) => ReplyTarget
    }

/** 口・節・部品がそろうときだけ、この部品（または行）を指す `ReplyTarget` の組み方を返す。 */
export function useRowTarget(title: string): RowTargetSlot {
  const slot = use(ReplyPortContext)
  const section = use(SectionPointContext)
  const leaf = use(LeafIdentityContext)
  const sessionKey = useReplySessionKey()
  if (slot.kind === "none" || section.kind === "none" || leaf.kind === "none") {
    return { kind: "none" }
  }
  return {
    kind: "available",
    sessionKey,
    targetOf: (row) =>
      replyTargetOf({
        reportToolUseId: section.reportToolUseId,
        componentId: leaf.componentId,
        section: section.heading,
        title,
        componentKind: leaf.componentKind,
        row,
      }),
  }
}

export function AskFrame(props: {
  readonly title: string
  /** 題の行を持つ部品か。持たない部品は、答えの欄の頭にバッジを置く。 */
  readonly captioned: boolean
  readonly children: ReactNode
}): ReactElement {
  const slot = use(ReplyPortContext)
  const rowTarget = useRowTarget(props.title)
  const addNote = useReplyNotes((state) => state.addNote)
  const thread = useLeafAskThread()
  const [open, setOpen] = useState<OpenAsk>({ kind: "closed" })
  if (slot.kind === "none" || rowTarget.kind === "none") {
    return <>{props.children}</>
  }
  const { targetOf, sessionKey } = rowTarget
  const close = () => {
    setOpen({ kind: "closed" })
  }
  const openAt = (scope: AskScope, mode: AskMode, initialText: string) => {
    setOpen({ kind: "open", scope, mode, initialText })
  }
  const boxOf = (opened: Extract<OpenAsk, { readonly kind: "open" }>): ReactElement => {
    const target = targetOf(
      opened.scope.kind === "row"
        ? { index: opened.scope.index, firstCell: opened.scope.firstCell }
        : undefined,
    )
    return (
      <AskBox
        key={JSON.stringify(opened)}
        target={target}
        initialMode={opened.mode}
        initialText={opened.initialText}
        onSend={(text) => {
          slot.port.ask(target, text)
        }}
        onNote={(text) => {
          addNote(sessionKey, target, text)
        }}
        onClose={close}
      />
    )
  }
  const rowAsk: RowAsk = {
    kind: "available",
    openRow: (index, firstCell) => {
      openAt({ kind: "row", index, firstCell }, "ask", "")
    },
    openRowNote: (index, firstCell) => {
      openAt({ kind: "row", index, firstCell }, "request", "")
    },
    isOpen: (index) =>
      open.kind === "open" && open.scope.kind === "row" && open.scope.index === index,
    isAsked: (index) =>
      thread.kind === "asked" && thread.thread.pairs.some((pair) => pair.row?.index === index),
  }
  const leafBoxOpen = open.kind === "open" && open.scope.kind === "leaf"
  return (
    <RowAskContext value={rowAsk}>
      <div className={styles["ask-frame"]}>
        {props.children}
        {thread.kind === "asked" && (
          <AskThreadView
            thread={thread.thread}
            captioned={props.captioned}
            onContinue={(pair) => {
              openAt(scopeOf(pair), "ask", "")
            }}
            onRequest={(pair) => {
              openAt(
                scopeOf(pair),
                "request",
                pair.answer.kind === "answered" ? pair.answer.text : "",
              )
            }}
          />
        )}
        {!leafBoxOpen && (
          <span className={styles["ask-button-slot"]}>
            <Button
              variant="outline"
              size="label"
              pressed="none"
              disabled={false}
              disclosure={{ kind: "none" }}
              className={styles["ask-button"]}
              onClick={() => {
                openAt({ kind: "leaf" }, "ask", "")
              }}
            >
              聞く
            </Button>{" "}
            <Button
              variant="outline"
              size="label"
              pressed="none"
              disabled={false}
              disclosure={{ kind: "none" }}
              className={styles["ask-button"]}
              onClick={() => {
                openAt({ kind: "leaf" }, "request", "")
              }}
            >
              頼む
            </Button>
          </span>
        )}
        {open.kind === "open" && boxOf(open)}
      </div>
    </RowAskContext>
  )
}

function scopeOf(pair: AskPair): AskScope {
  return pair.row === undefined
    ? { kind: "leaf" }
    : { kind: "row", index: pair.row.index, firstCell: pair.row.label }
}
