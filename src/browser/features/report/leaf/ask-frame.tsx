// 内容部品の外枠に、指せる単位と余白の「聞く・頼む」を足す。口が渡され、節の中の内容部品のときだけ包む。
// それ以外は子をそのまま返す（包みの要素を足さない）。
// 余白は本文の右の列で、指した単位の上端の高さに「聞く・頼む」を1つ出す。余白を出さない幅では、指した単位の右に出す。
// 開いている入力欄は部品の中で1つ。部品全体の欄と行の欄は、同じ状態を取り合う。
// キーボードは部品ごとに Tab の止まり場を1つ置き（roving tabindex）、中は ↑↓ で単位を動く。フォーカスが来た単位を指し、Enter か ⌘⌥M で欄を開く。
// 字を選んで指した単位の欄は、書き始めに選んだ字の引用を入れる。

import clsx from "clsx"
import {
  createContext,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  use,
  useRef,
  useState,
} from "react"

import type { ReplyTarget } from "../../../../shared/session/reply-target.ts"
import { Button } from "../../../components/ui/button/button.tsx"
import { useBeforePaintSync } from "../../../hooks/use-before-paint-sync.ts"
import { useEventListener } from "../../../hooks/use-event-listener.ts"
import { useReplyNotes, useReplySessionKey } from "../../../stores/reply-note-list.ts"
import { useLeafAskThread } from "../ask-thread-context.ts"
import { askLeafKey, type AskPair } from "../domain/ask-thread.ts"
import { replyTargetOf } from "../domain/reply-target.ts"
import { isOpenShortcut, type ReplyUnit, replyUnitOf, UNIT_SELECTOR } from "../domain/reply-unit.ts"
import { LeafIdentityContext, SectionPointContext } from "../leaf-point-context.ts"
import { ReplyPointContext } from "../reply-point.tsx"
import { ReplyPortContext } from "../reply-port.ts"
import { AskBox, type AskMode } from "./ask-box.tsx"
import { AskThreadView } from "./ask-thread-view.tsx"
import styles from "./leaf.module.css"

/** 単位が自分の印（指した・欄を開いた・聞いた）を読む口。`none` の部品は単位の印を出さない。 */
export type RowAsk =
  | { readonly kind: "none" }
  | {
      readonly kind: "available"
      /** その行を指しているか。添字を渡さなければ部品全体を指しているか。 */
      readonly isPointed: (index?: number) => boolean
      /** その行について欄が開いているか（欄は部品の下に出し、行には印を付ける）。 */
      readonly isOpen: (index: number) => boolean
      /** その行について聞いたことがあるか（行に印の線を付ける）。 */
      readonly isAsked: (index: number) => boolean
      /** 単位の `tabIndex`。部品の中で Tab の止まり場は1つ（前に入っていた単位、無ければ部品全体の単位）で、ほかは -1。 */
      readonly tabIndexOf: (index?: number) => 0 | -1
    }

export const RowAskContext = createContext<RowAsk>({ kind: "none" })

/** 何も指していないとき、レポートで最初に指せる単位の横の余白に出す書き添え。 */
const HINT_TEXT = "字・行・案を選ぶと、ここに「聞く・頼む」が1つ出る"

/** 押しても単位を指さない要素（単位の中のボタン・リンク・入力）。 */
const INTERACTIVE_SELECTOR = "button, a, input, select, textarea, summary, label"

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
      /** 頼むに切り替えたときの書き始めの字。 */
      readonly requestText: string
    }

type RowTargetSlot =
  | { readonly kind: "none" }
  | {
      readonly kind: "available"
      readonly sessionKey: string
      /** 部品の鍵（`askLeafKey`）。 */
      readonly leafKey: string
      readonly targetOf: (row?: {
        readonly index: number
        readonly firstCell: string
      }) => ReplyTarget
    }

type MarginTops = {
  /** 指した単位の上端（外枠の上端から）。 */
  readonly pointed: number
  /** 書き添えを置く単位の上端。最初の行の単位、無ければ最初の単位。 */
  readonly hint: number
  /** この外枠がレポートで最初の外枠か。 */
  readonly first: boolean
}

export function AskFrame(props: {
  readonly title: string
  /** 題の行を持つ部品か。持たない部品は、答えの欄の頭にバッジを置く。 */
  readonly captioned: boolean
  /** 部品全体を指す単位。`caption` は題の行（呼び出し側が印を置く）、`body` は本体の全体。 */
  readonly unit: "caption" | "body"
  readonly children: ReactNode
}): ReactElement {
  const slot = use(ReplyPortContext)
  const point = use(ReplyPointContext)
  const rowTarget = useRowTarget(props.title)
  const addNote = useReplyNotes((state) => state.addNote)
  const thread = useLeafAskThread()
  const [open, setOpen] = useState<OpenAsk>({ kind: "closed" })
  const frameRef = useRef<HTMLDivElement>(null)
  const [tops, setTops] = useState<MarginTops>({ pointed: 0, hint: 0, first: false })
  const [tabStop, setTabStop] = useState<{ readonly row?: number }>({})
  const pointed =
    point.kind === "available" &&
    rowTarget.kind === "available" &&
    point.pointed?.leafKey === rowTarget.leafKey
      ? point.pointed
      : undefined
  const touched = point.kind === "available" && point.touched
  const quote = point.kind === "available" ? point.quote : ""
  const pointedSelector = pointed === undefined ? undefined : unitSelectorOf(pointed)
  useBeforePaintSync(() => {
    const frame = frameRef.current
    if (frame === null) {
      return
    }
    const next = marginTopsOf(frame, touched, pointedSelector)
    setTops((current) =>
      current.pointed === next.pointed && current.hint === next.hint && current.first === next.first
        ? current
        : next,
    )
  }, [pointedSelector, touched])
  useEventListener(
    document,
    "keydown",
    (event) => {
      if (pointed !== undefined && !isOpenAt(open, pointed) && isOpenShortcut(event)) {
        event.preventDefault()
        setOpen(openedOf(pointed, quote))
      }
    },
    { enabled: pointed !== undefined },
  )
  if (slot.kind === "none" || rowTarget.kind === "none" || point.kind === "none") {
    return <>{props.children}</>
  }
  const { targetOf, sessionKey, leafKey } = rowTarget
  const closeAt = (scope: AskScope) => {
    setOpen({ kind: "closed" })
    frameRef.current?.querySelector<HTMLElement>(scopeSelectorOf(scope))?.focus()
  }
  const openAt = (scope: AskScope, mode: AskMode, initialText: string) => {
    setOpen({ kind: "open", scope, mode, initialText, requestText: "" })
  }
  const openUnit = (unit: ReplyUnit) => {
    setOpen(openedOf(unit, pointed === unit ? quote : ""))
  }
  const onUnitKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const unitElement = event.target
    const frame = frameRef.current
    if (
      !(unitElement instanceof HTMLElement) ||
      !unitElement.matches(UNIT_SELECTOR) ||
      frame === null
    ) {
      return
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const units = [...frame.querySelectorAll<HTMLElement>(UNIT_SELECTOR)]
      const next = units[units.indexOf(unitElement) + (event.key === "ArrowDown" ? 1 : -1)]
      if (next !== undefined) {
        event.preventDefault()
        next.focus()
      }
    } else if (event.key === "Enter") {
      event.preventDefault()
      const unit = replyUnitOf(unitElement, leafKey)
      point.point(unit)
      openUnit(unit)
    }
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
        requestText={opened.requestText}
        onSend={(text) => {
          slot.port.ask(target, text)
        }}
        onNote={(text) => {
          addNote(sessionKey, target, text)
        }}
        onClose={() => {
          closeAt(opened.scope)
        }}
      />
    )
  }
  const rowAsk: RowAsk = {
    kind: "available",
    isPointed: (index) =>
      pointed !== undefined &&
      (index === undefined ? pointed.row === undefined : pointed.row?.index === index),
    isOpen: (index) =>
      open.kind === "open" && open.scope.kind === "row" && open.scope.index === index,
    isAsked: (index) =>
      thread.kind === "asked" && thread.thread.pairs.some((pair) => pair.row?.index === index),
    tabIndexOf: (index) => (index === tabStop.row ? 0 : -1),
  }
  const hinted = !touched && tops.first
  return (
    <RowAskContext value={rowAsk}>
      <div
        ref={frameRef}
        className={styles["ask-frame"]}
        data-reply-frame={leafKey}
        style={{
          "--reply-unit-top": `${String(tops.pointed)}px`,
          "--reply-hint-top": `${String(tops.hint)}px`,
        }}
      >
        <div className={styles["ask-main"]}>
          <div
            className={styles["ask-body"]}
            data-reply-unit={props.unit === "body" ? "leaf" : undefined}
            data-pointed={props.unit === "body" && rowAsk.isPointed() ? "" : undefined}
            tabIndex={props.unit === "body" ? rowAsk.tabIndexOf() : undefined}
            onClick={(event) => {
              // 字を選び終えた押下は、選んだ字の側（ReplyPointScope）が引用つきで指している。
              if (document.getSelection()?.isCollapsed === false) {
                return
              }
              pointAt(event.target, event.currentTarget, leafKey, point.point)
            }}
            onFocus={(event) => {
              if (event.target.matches(UNIT_SELECTOR)) {
                const unit = replyUnitOf(event.target, leafKey)
                point.point(unit)
                setTabStop(unit.row === undefined ? {} : { row: unit.row.index })
              }
            }}
            onKeyDown={onUnitKeyDown}
          >
            {props.children}
          </div>
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
          {open.kind === "open" && <div data-reply-keep="">{boxOf(open)}</div>}
        </div>
        <div className={styles["ask-margin"]} data-reply-keep="">
          {pointed !== undefined && !isOpenAt(open, pointed) && (
            <Button
              variant="outline-accent"
              size="label"
              pressed="none"
              disabled={false}
              disclosure={{ kind: "none" }}
              className={styles["reply-port"]}
              onClick={() => {
                openUnit(pointed)
              }}
            >
              聞く・頼む
            </Button>
          )}
          {hinted && (
            <p className={styles["reply-hint"]} aria-hidden="true">
              {HINT_TEXT}
            </p>
          )}
        </div>
      </div>
    </RowAskContext>
  )
}

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
      {props.children}
    </div>
  )
}

/** 口・節・部品がそろうときだけ、この部品（または行）を指す `ReplyTarget` の組み方を返す。 */
function useRowTarget(title: string): RowTargetSlot {
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
    leafKey: askLeafKey(section.reportToolUseId, leaf.componentId),
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

/** 押した要素を含む外枠の中の単位を指す。単位の中のボタンなどを押したときと、単位の外を押したときは指さない。 */
function pointAt(
  target: EventTarget,
  frame: Element,
  leafKey: string,
  point: (unit: ReplyUnit) => void,
): void {
  if (!(target instanceof Element) || target.closest(INTERACTIVE_SELECTOR) !== null) {
    return
  }
  const unit = target.closest(UNIT_SELECTOR)
  if (unit !== null && frame.contains(unit)) {
    point(replyUnitOf(unit, leafKey))
  }
}

/** 指した単位について、聞くの欄を開く。字を選んで指したなら、書き始めに引用を入れる。 */
function openedOf(unit: ReplyUnit, quote: string): OpenAsk {
  return {
    kind: "open",
    scope: unitScopeOf(unit),
    mode: "ask",
    initialText: quote === "" ? "" : `${quote}\n\n`,
    requestText: unit.row?.requestText ?? "",
  }
}

/** 単位の要素を外枠の中から引く選択子。 */
function scopeSelectorOf(scope: AskScope): string {
  return scope.kind === "leaf"
    ? '[data-reply-unit="leaf"]'
    : `[data-reply-row="${String(scope.index)}"]`
}

function unitSelectorOf(unit: ReplyUnit): string {
  return scopeSelectorOf(unitScopeOf(unit))
}

/** 書き添えは、一度も指していないあいだ、レポートで最初の外枠の最初の行（無ければ最初の単位）の高さに置く。 */
function marginTopsOf(frame: HTMLElement, touched: boolean, pointedSelector?: string): MarginTops {
  const base = frame.getBoundingClientRect().top
  const topOf = (element?: Element) =>
    element === undefined ? 0 : Math.round(element.getBoundingClientRect().top - base)
  const firstUnit = touched
    ? undefined
    : (frame.querySelector('[data-reply-unit="row"]') ??
      frame.querySelector(UNIT_SELECTOR) ??
      undefined)
  return {
    pointed:
      pointedSelector === undefined ? 0 : topOf(frame.querySelector(pointedSelector) ?? undefined),
    hint: topOf(firstUnit),
    first:
      firstUnit !== undefined &&
      frame.closest("[data-report-body]")?.querySelector("[data-reply-frame]") === frame,
  }
}

/** 指した単位について欄が開いているか（開いていれば「聞く・頼む」は出さない）。 */
function isOpenAt(open: OpenAsk, unit: ReplyUnit): boolean {
  if (open.kind === "closed") {
    return false
  }
  return open.scope.kind === "row" ? open.scope.index === unit.row?.index : unit.row === undefined
}

function unitScopeOf(unit: ReplyUnit): AskScope {
  return unit.row === undefined
    ? { kind: "leaf" }
    : { kind: "row", index: unit.row.index, firstCell: unit.row.firstCell }
}

function scopeOf(pair: AskPair): AskScope {
  return pair.row === undefined
    ? { kind: "leaf" }
    : { kind: "row", index: pair.row.index, firstCell: pair.row.label }
}
