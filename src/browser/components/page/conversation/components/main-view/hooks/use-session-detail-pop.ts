// 札の右隣に開くセッションの詳細の、置き場所と閉じる合図の判定とフォーカスの扱い。
// 面は札の上端にそろえて札の右に置き、幅は右端から 16px を残す。高さはビューポートに収める。
// 一覧の中の押下は外に数えない（別の行を押したら、閉じて開き直さず詳細がその行へ移る）。

import { useRef, useState, type RefObject } from "react"

import { useBeforePaintSync } from "../../../../../../hooks/use-before-paint-sync.ts"
import { useEventListener } from "../../../../../../hooks/use-event-listener.ts"

/** 面を札から離す幅。 */
const POP_LEFT_GAP = 8
/** 面とビューポートの端の間に残す幅。 */
const POP_EDGE_GAP = 16
const POP_MAX_WIDTH = 468
const POP_MAX_HEIGHT = 600

/** 面の左上（ビューポートの座標）・幅・高さの上限。 */
export type SessionDetailPlace = {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly maxHeight: number
}

export type SessionDetailPop = {
  /** 開いている行のボタン。面はこの口に結ぶ。 */
  readonly anchorRef: RefObject<HTMLButtonElement | null>
  /** セッションの一覧全体を囲む要素。 */
  readonly listRef: RefObject<HTMLDivElement | null>
  readonly place: SessionDetailPlace
  /** 面の外の押下か（一覧の中の押下は外ではない）。 */
  readonly shouldClose: () => boolean
  /** 面の中のボタンへフォーカスを移す。 */
  readonly focusDetail: () => void
}

const START_PLACE = {
  left: 0,
  top: 0,
  width: 0,
  maxHeight: 0,
} as const satisfies SessionDetailPlace

export const SESSION_DETAIL_ATTRIBUTE = "data-session-detail"

export function useSessionDetailPop(open: boolean, selectedKey: string): SessionDetailPop {
  const anchorRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const pressedInList = useRef(false)
  const [place, setPlace] = useState<SessionDetailPlace>(START_PLACE)

  const measure = (): void => {
    const nav = anchorRef.current?.closest("nav")
    if (nav === null || nav === undefined) {
      return
    }
    const rect = nav.getBoundingClientRect()
    const left = rect.right + POP_LEFT_GAP
    setPlace({
      left,
      top: rect.top,
      width: Math.min(POP_MAX_WIDTH, window.innerWidth - POP_EDGE_GAP - left),
      maxHeight: Math.min(POP_MAX_HEIGHT, window.innerHeight - rect.top - POP_EDGE_GAP),
    })
  }

  useBeforePaintSync(() => {
    if (open) {
      measure()
    }
  }, [open])

  // 詳細の行が↑↓で動いたとき、フォーカスが一覧の中にあれば行についていく。
  useBeforePaintSync(() => {
    if (open && selectedKey !== "" && listRef.current?.contains(document.activeElement) === true) {
      anchorRef.current?.focus()
    }
  }, [open, selectedKey])

  useEventListener(window, "resize", measure, { enabled: open })

  // `Popover` の外押下は document の泡の段階で聞くので、その前の捕まえの段階で押した先を控える。
  useEventListener(
    document,
    "pointerdown",
    (event) => {
      pressedInList.current =
        event.target instanceof Node && listRef.current?.contains(event.target) === true
    },
    { enabled: open, capture: true },
  )

  // Esc は押下の履歴に関係なく閉じる合図なので、`Popover` が聞く前に一覧の中の押下の控えを外す。
  useEventListener(
    document,
    "keydown",
    (event) => {
      if (event.key === "Escape") {
        pressedInList.current = false
      }
    },
    { enabled: open, capture: true },
  )

  return {
    anchorRef,
    listRef,
    place,
    shouldClose: () => !pressedInList.current,
    focusDetail: () => {
      document.querySelector<HTMLElement>(`[${SESSION_DETAIL_ATTRIBUTE}] button`)?.focus()
    },
  }
}
