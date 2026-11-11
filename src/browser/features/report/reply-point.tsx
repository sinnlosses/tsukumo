// レポートの中で「聞く・頼む」を出す先として指している単位（`ReplyUnit`）。
// 指せるのはレポートの中で1か所。単位と口の外を押すか Esc で指すのをやめる。
// 字を選び終えたときは、選んだ字を含む単位を引用つきで指す。単位の外の字なら、入力欄へ引用を入れる口を選んだ字の横に出す。

import { createContext, type ReactElement, type ReactNode, type RefObject, useState } from "react"

import { useEventListener } from "../../hooks/use-event-listener.ts"
import type { ReplyUnit } from "./domain/reply-unit.ts"
import { type SelectionOutside, useSelectionPoint } from "./hooks/use-selection-point.ts"
import { SelectionPort } from "./leaf/selection-port.tsx"

export type ReplyPoint =
  | { readonly kind: "none" }
  | {
      readonly kind: "available"
      readonly pointed?: ReplyUnit
      /** 字を選んで指したときの引用（`quoteOf` の形）。押して指したときは空。 */
      readonly quote: string
      /** このレポートで一度でも指したか。書き添えは一度も指していないあいだだけ出す。 */
      readonly touched: boolean
      readonly point: (unit: ReplyUnit) => void
      readonly clear: () => void
    }

export const ReplyPointContext = createContext<ReplyPoint>({ kind: "none" })

/** 押しても指すのをやめない所（余白の口・開いた欄）の印。JSX の属性名に定数を書けないので、置く側は同じ綴りを直に置く。 */
const REPLY_KEEP_ATTRIBUTE = "data-reply-keep"

type PointState = {
  readonly pointed?: ReplyUnit
  readonly quote: string
  readonly touched: boolean
}

export function ReplyPointScope(props: {
  /** レポートの本文の根（`data-report-body`）。この中で選んだ字だけを拾う。 */
  readonly rootRef: RefObject<HTMLElement | null>
  readonly children: ReactNode
}): ReactElement {
  const [state, setState] = useState<PointState>({ quote: "", touched: false })
  const [outside, setOutside] = useState<SelectionOutside>({ kind: "none" })
  const { pointed, touched } = state
  const clear = () => {
    setState({ quote: "", touched })
  }
  useSelectionPoint(props.rootRef, {
    onUnit: (unit, quote) => {
      setState({ pointed: unit, quote, touched: true })
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
          setState({ pointed: unit, quote: "", touched: true })
        },
        clear,
      }}
    >
      {props.children}
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
