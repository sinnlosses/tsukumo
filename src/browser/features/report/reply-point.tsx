// レポートの中で「聞く・頼む」を出す先として指している単位（`ReplyUnit`）。
// 指せるのはレポートの中で1か所。単位と口の外を押すか Esc で指すのをやめる。
// 字を選び終えたときは、選んだ字を含む単位を引用つきで指す。単位の外の字なら、入力欄へ引用を入れる口を選んだ字の横に出す。

import {
  createContext,
  type ReactElement,
  type ReactNode,
  type RefObject,
  useRef,
  useState,
} from "react"

import { useEventListener } from "../../hooks/use-event-listener.ts"
import { useFirstNoteSeen } from "../../stores/first-note-seen.ts"
import type { ReplyUnit } from "./domain/reply-unit.ts"
import { useMarginCardStack } from "./hooks/use-margin-card-stack.ts"
import { useNarrowReport } from "./hooks/use-narrow-report.ts"
import { type SelectionOutside, useSelectionPoint } from "./hooks/use-selection-point.ts"
import type { AskMode } from "./leaf/ask-box.tsx"
import type { AskScope } from "./leaf/reply-unit-dom.ts"
import { SelectionPort } from "./leaf/selection-port.tsx"

/** 開いている入力欄。レポートで1つだけ開く。 */
export type OpenAsk = {
  /** 部品の鍵（`askLeafKey`）。 */
  readonly leafKey: string
  readonly scope: AskScope
  readonly mode: AskMode
  readonly initialText: string
  /** 頼むに切り替えたときの書き始めの字。 */
  readonly requestText: string
}

export type ReplyPoint =
  | { readonly kind: "none" }
  | {
      readonly kind: "available"
      readonly pointed?: ReplyUnit
      /** 字を選んで指したときの引用（`quoteOf` の形）。押して指したときは空。 */
      readonly quote: string
      readonly point: (unit: ReplyUnit) => void
      readonly clear: () => void
      readonly open?: OpenAsk
      /** 別の部品で開いていた欄は閉じる。狭い幅では、その単位の札をシートに出す。 */
      readonly openAsk: (ask: OpenAsk) => void
      /** 欄だけ閉じる。狭い幅のシートは残る（答えが返れば、同じシートに出る）。 */
      readonly closeAsk: () => void
      /** 余白の札（`data-margin-card`）ごとの、重ならないよう下へずらす量。 */
      readonly cardShifts: Readonly<Record<string, number>>
      /** 本文が余白の列を出せないほど狭いか。狭いと札は余白に並べず、1枚だけをシートに出す。 */
      readonly narrow: boolean
      /** 狭い幅でシートに出している札の単位。 */
      readonly sheet?: SheetTarget
      /** 狭い幅で、その単位の札をシートに出し直す（欄は開かない）。 */
      readonly openSheet: (target: SheetTarget) => void
      /** シートを閉じる。開いている欄も閉じる。 */
      readonly closeSheet: () => void
    }

/** シートに出す札の単位。 */
export type SheetTarget = {
  /** 部品の鍵（`askLeafKey`）。 */
  readonly leafKey: string
  readonly scope: AskScope
}

export const ReplyPointContext = createContext<ReplyPoint>({ kind: "none" })

/** 押しても指すのをやめない所（余白の口・開いた欄）の印。JSX の属性名に定数を書けないので、置く側は同じ綴りを直に置く。 */
const REPLY_KEEP_ATTRIBUTE = "data-reply-keep"

type PointState = {
  readonly pointed?: ReplyUnit
  readonly quote: string
}

export function ReplyPointScope(props: {
  /** レポートの本文の根（`data-report-body`）。この中で選んだ字だけを拾う。 */
  readonly rootRef: RefObject<HTMLElement | null>
  readonly children: ReactNode
}): ReactElement {
  const [state, setState] = useState<PointState>({ quote: "" })
  const markSeen = useFirstNoteSeen((store) => store.markSeen)
  const [outside, setOutside] = useState<SelectionOutside>({ kind: "none" })
  const [opened, setOpened] = useState<{ readonly ask?: OpenAsk; readonly sheet?: SheetTarget }>({})
  const tailRef = useRef<HTMLDivElement>(null)
  const cardStack = useMarginCardStack(props.rootRef, tailRef)
  const narrow = useNarrowReport(props.rootRef)
  const { pointed } = state
  const clear = () => {
    setState({ quote: "" })
  }
  useSelectionPoint(props.rootRef, {
    onUnit: (unit, quote) => {
      setState({ pointed: unit, quote })
      markSeen("reply-margin")
      setOutside({ kind: "none" })
    },
    onOutside: (shown) => {
      clear()
      setOutside(shown)
    },
    onLeave: () => {
      // スクロール・選択の変化のたびに呼ばれるので、口が出ていなければ状態を変えず描き直さない
      setOutside((current) => (current.kind === "none" ? current : { kind: "none" }))
    },
  })
  useEventListener(
    document,
    "pointerdown",
    (event) => {
      if (
        !(event.target instanceof Element) ||
        event.target.closest(`[data-reply-unit], [${REPLY_KEEP_ATTRIBUTE}]`) === null
      ) {
        clear()
      }
    },
    { enabled: pointed !== undefined },
  )
  useEventListener(
    document,
    "keydown",
    (event) => {
      if (event.key === "Escape") {
        clear()
      }
    },
    { enabled: pointed !== undefined },
  )
  return (
    <ReplyPointContext
      value={{
        kind: "available",
        ...state,
        point: (unit) => {
          setState({ pointed: unit, quote: "" })
          markSeen("reply-margin")
        },
        clear,
        ...(opened.ask === undefined ? {} : { open: opened.ask }),
        openAsk: (ask) => {
          setOpened({ ask, sheet: { leafKey: ask.leafKey, scope: ask.scope } })
        },
        closeAsk: () => {
          setOpened((current) => (current.sheet === undefined ? {} : { sheet: current.sheet }))
        },
        cardShifts: cardStack.shifts,
        narrow,
        ...(opened.sheet === undefined ? {} : { sheet: opened.sheet }),
        openSheet: (target) => {
          setOpened({ sheet: target })
        },
        closeSheet: () => {
          setOpened({})
        },
      }}
    >
      {props.children}
      {cardStack.tail > 0 && (
        <div ref={tailRef} aria-hidden="true" style={{ height: cardStack.tail }} />
      )}
      {outside.kind === "shown" && (
        <SelectionPort
          shown={outside}
          onDone={() => {
            setOutside({ kind: "none" })
          }}
        />
      )}
    </ReplyPointContext>
  )
}
