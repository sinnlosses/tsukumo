// 内容部品の外枠に、指せる単位と余白の「聞く・頼む」・余白の札を足す。口が渡され、節の中の内容部品のときだけ包む。
// それ以外は子をそのまま返す（包みの要素を足さない）。
// 指した単位の上端の高さに「聞く・頼む」を1つ出す。聞いた対・付箋・開いた入力欄は、単位ごとの札にして本文の右の列（余白）に出す。
// 余白の列を空けるのは札のある部品だけ（`data-reply-margin`）。札の無い部品は本文の幅いっぱいに描き、口は外枠の右端に重ねる。
// 開いている入力欄はレポートで1つ（`ReplyPoint` が持つ）。部品全体の欄と行の欄は、同じ状態を取り合う。
// キーボードは部品ごとに Tab の止まり場を1つ置き（roving tabindex）、中は ↑↓ で単位を動く。Enter か ⌘⌥M で欄を開く。
// 字を選んで指した単位の欄は、書き始めに選んだ字の引用を入れる。

import { type KeyboardEvent, type ReactElement, type ReactNode, use, useRef, useState } from "react"

import type { ReplyTarget } from "../../../../shared/session/reply-target.ts"
import { useBeforePaintSync } from "../../../hooks/use-before-paint-sync.ts"
import { useEventListener } from "../../../hooks/use-event-listener.ts"
import { useReplyNotes, useReplySessionKey } from "../../../stores/reply-note-list.ts"
import { useLeafAskThread } from "../ask-thread-context.ts"
import { type AskPair, askLeafKey } from "../domain/ask-thread.ts"
import { replyTargetOf } from "../domain/reply-target.ts"
import { isOpenShortcut, type ReplyUnit, replyUnitOf, UNIT_SELECTOR } from "../domain/reply-unit.ts"
import {
  LeafIdentityContext,
  NarrowCellContext,
  SectionPointContext,
} from "../leaf-point-context.ts"
import { type OpenAsk, ReplyPointContext } from "../reply-point.tsx"
import { ReplyPortContext } from "../reply-port.ts"
import { AskBox, type AskMode } from "./ask-box.tsx"
import styles from "./leaf.module.css"
import {
  MarginCardBody,
  MarginCards,
  marginCardsOf,
  pairScopeOf,
  ReplyPortButton,
} from "./margin-card-list.tsx"
import { useLeafNotes } from "./reply-note-card.tsx"
import { ReplySheet } from "./reply-sheet.tsx"
import {
  type AskScope,
  type MarginTops,
  marginTopsOf,
  pointAt,
  scopeKeyOf,
  scopeSelectorOf,
  unitScopeOf,
  unitSelectorOf,
} from "./reply-unit-dom.ts"
import { type RowAsk, RowAskContext, ReplyUnitMark } from "./reply-unit-row.tsx"

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

export function AskFrame(props: {
  readonly title: string
  /** 部品全体を指す単位。`caption` は題の行（呼び出し側が印を置く）、`body` は本体の全体。 */
  readonly unit: "caption" | "body"
  readonly children: ReactNode
}): ReactElement {
  const slot = use(ReplyPortContext)
  const point = use(ReplyPointContext)
  const rowTarget = useRowTarget(props.title)
  const addNote = useReplyNotes((state) => state.addNote)
  const thread = useLeafAskThread()
  const notes = useLeafNotes()
  const frameRef = useRef<HTMLDivElement>(null)
  const [tops, setTops] = useState<MarginTops>({ pointed: 0, cards: {} })
  const [tabStop, setTabStop] = useState<{ readonly row?: number }>({})
  const leafKey = rowTarget.kind === "available" ? rowTarget.leafKey : ""
  const pointed =
    point.kind === "available" && point.pointed?.leafKey === leafKey ? point.pointed : undefined
  const open =
    point.kind === "available" && point.open?.leafKey === leafKey ? point.open : undefined
  const quote = point.kind === "available" ? point.quote : ""
  const pointedSelector = pointed === undefined ? undefined : unitSelectorOf(pointed)
  const narrowCell = use(NarrowCellContext)
  const narrow = point.kind === "available" && (point.narrow || narrowCell)
  const sheet =
    point.kind === "available" && narrow && point.sheet?.leafKey === leafKey
      ? point.sheet
      : undefined
  const cards = marginCardsOf(
    thread.kind === "asked" ? thread.thread.pairs : [],
    notes,
    open?.scope,
    sheet?.scope,
  )
  const shownCards = narrow ? [] : cards
  const margined =
    shownCards.length > 0 ||
    (!narrow && point.kind === "available" && point.sending.includes(leafKey))
  // 余白の列を出し入れすると本体が組み直されるので、そのあとも測り直す。札の上端が要るのは、余白に札を出しているあいだだけ。
  useBeforePaintSync(() => {
    const frame = frameRef.current
    if (frame === null) {
      return
    }
    const next = marginTopsOf(
      frame,
      margined ? cards.map((card) => card.scope) : [],
      pointedSelector,
    )
    setTops((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next))
  }, [pointedSelector, cards, margined])
  useEventListener(
    document,
    "keydown",
    (event) => {
      if (
        point.kind === "available" &&
        pointed !== undefined &&
        !isOpenAt(pointed, open) &&
        isOpenShortcut(event)
      ) {
        event.preventDefault()
        point.openAsk(openedOf(leafKey, pointed, quote))
      }
    },
    { enabled: pointed !== undefined },
  )
  if (slot.kind === "none" || rowTarget.kind === "none" || point.kind === "none") {
    return <>{props.children}</>
  }
  const { targetOf, sessionKey } = rowTarget
  const closeAt = (scope: AskScope) => {
    point.closeAsk()
    frameRef.current?.querySelector<HTMLElement>(scopeSelectorOf(scope))?.focus()
  }
  const openAt = (scope: AskScope, mode: AskMode, initialText: string) => {
    point.openAsk({ leafKey, scope, mode, initialText, requestText: "" })
  }
  const openUnit = (unit: ReplyUnit) => {
    point.openAsk(openedOf(leafKey, unit, pointed === unit ? quote : ""))
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
  const boxOf = (opened: OpenAsk): ReactElement => {
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
          point.holdMargin(leafKey, slot.port.ask(target, text))
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
    isOpen: (index) => open?.scope.kind === "row" && open.scope.index === index,
    marksOf: (index) => {
      const key = index === undefined ? "leaf" : `row:${String(index)}`
      const card = cards.find((candidate) => candidate.key === key)
      return { asked: card?.pairs.length ?? 0, requested: card?.notes.length ?? 0 }
    },
    showUnit: (frame, index) => {
      const element = frame.querySelector<HTMLElement>(
        scopeSelectorOf(
          index === undefined ? { kind: "leaf" } : { kind: "row", index, firstCell: "" },
        ),
      )
      if (element === null) {
        return
      }
      const unit = replyUnitOf(element, leafKey)
      point.point(unit)
      if (narrow) {
        point.openSheet({ leafKey, scope: unitScopeOf(unit) })
      }
    },
    tabIndexOf: (index) => (index === tabStop.row ? 0 : -1),
  }
  const pointedKey = pointed === undefined ? undefined : scopeKeyOf(unitScopeOf(pointed))
  const portShown = pointed !== undefined && !isOpenAt(pointed, open)
  const sheetCard =
    sheet === undefined ? undefined : cards.find((card) => card.key === scopeKeyOf(sheet.scope))
  const actions = {
    renderBox: () => (open === undefined ? <></> : boxOf(open)),
    onPort: () => {
      if (pointed !== undefined) {
        openUnit(pointed)
      }
    },
    onContinue: (pair: AskPair) => {
      openAt(pairScopeOf(pair), "ask", "")
    },
    onRequest: (pair: AskPair) => {
      openAt(pairScopeOf(pair), "request", pair.answer.kind === "answered" ? pair.answer.text : "")
    },
  }
  return (
    <RowAskContext value={rowAsk}>
      <div
        ref={frameRef}
        className={styles["ask-frame"]}
        data-reply-frame={leafKey}
        data-reply-margin={margined ? "" : undefined}
        style={{
          "--reply-unit-top": `${String(tops.pointed)}px`,
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
            {props.unit === "body" && <ReplyUnitMark corner />}
            {props.children}
          </div>
        </div>
        <div className={styles["ask-margin"]} data-reply-keep="">
          <MarginCards
            leafKey={leafKey}
            cards={shownCards}
            tops={tops.cards}
            shifts={point.cardShifts}
            {...(portShown && pointedKey !== undefined ? { pointedKey } : {})}
            {...actions}
          />
          {sheetCard !== undefined && (
            <ReplySheet onClose={point.closeSheet}>
              <MarginCardBody
                card={sheetCard}
                withPort
                {...actions}
                onPort={() => {
                  openAt(sheetCard.scope, "ask", "")
                }}
              />
            </ReplySheet>
          )}
          {portShown && !shownCards.some((card) => card.key === pointedKey) && (
            <div className={styles["reply-port-float"]}>
              <ReplyPortButton
                onClick={() => {
                  openUnit(pointed)
                }}
              />
            </div>
          )}
        </div>
      </div>
    </RowAskContext>
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

/** 指した単位について、聞くの欄を開く。字を選んで指したなら、書き始めに引用を入れる。 */
function openedOf(leafKey: string, unit: ReplyUnit, quote: string): OpenAsk {
  return {
    leafKey,
    scope: unitScopeOf(unit),
    mode: "ask",
    initialText: quote === "" ? "" : `${quote}\n\n`,
    requestText: unit.row?.requestText ?? "",
  }
}

/** 指した単位について欄が開いているか（開いていれば「聞く・頼む」は出さない）。 */
function isOpenAt(unit: ReplyUnit, open?: OpenAsk): boolean {
  if (open === undefined) {
    return false
  }
  return open.scope.kind === "row" ? open.scope.index === unit.row?.index : unit.row === undefined
}
