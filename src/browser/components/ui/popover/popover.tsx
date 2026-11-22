// 口に結んで重ねる面の部品。中身は Astryx の `Popover` で、持つのは開閉の写し・口・幅・置き方・読み上げの名前だけ。
//
// 開くのは呼び出し側（口の `onClick` で開閉の値を替える）で、Astryx には口の押下を拾わせない。
// 閉じる合図は、口と面の外での `pointerdown` と、Esc と、面の中の隠れた「閉じる」で、どれも `onClose` を呼ぶ。
// 口を押したときは外に数えないので、口の `onClick` が閉じる（ブラウザの light dismiss に任せると、閉じた直後の押下で開き直す）。

import { Popover as AstryxPopover } from "@astryxdesign/core/Popover"
import { type ReactElement, type ReactNode, type RefObject, useRef, useState } from "react"

import { acquireOverlay } from "../../../hooks/open-overlay.ts"
import { useBeforePaintSync } from "../../../hooks/use-before-paint-sync.ts"
import { useEventListener } from "../../../hooks/use-event-listener.ts"
import { useExternalSync } from "../../../hooks/use-external-sync.ts"
import { useResizeObservedRef } from "../../../hooks/use-observed-ref.ts"
import styles from "./popover.module.css"

/** 面を結ぶ口。開く前に読むので、`ref` が指すのは開く時点の口でよい。 */
type PopoverAnchor =
  | { readonly kind: "none" }
  | { readonly kind: "element"; readonly element: HTMLElement }

const NO_ANCHOR = { kind: "none" } as const satisfies PopoverAnchor

/**
 * 置き方。`below` は口の下に置き、`alignment` で口のどちらの端にそろえるかを決める。
 * `at` は面の左上をビューポートの座標で置く（口の下に置いてから、測った差だけずらす。口と一緒に動く）。
 */
export type PopoverPlacement =
  | { readonly kind: "below"; readonly alignment: "start" | "center" | "end" }
  | { readonly kind: "at"; readonly left: number; readonly top: number }

export type PopoverProps = {
  readonly open: boolean
  /** 面を結ぶ口。button か `role="button"` の要素。 */
  readonly anchorRef: RefObject<HTMLElement | null>
  readonly ariaLabel: string
  /** 面の幅（px）。 */
  readonly width: number
  readonly placement: PopoverPlacement
  readonly onClose: () => void
  /** 面の箱（余白・高さの上限・字）を渡す。 */
  readonly className: string
  readonly children: ReactNode
}

type Nudge = { readonly x: number; readonly y: number }

const NO_NUDGE = { x: 0, y: 0 } as const satisfies Nudge

export function Popover(props: PopoverProps): ReactElement {
  const { open, anchorRef, placement, onClose } = props
  const bodyRef = useRef<HTMLDivElement>(undefined)
  // Astryx の層は口の要素が無いと描けないので、ref が指す口を描いたあとに写し取る。一度結んだ口は開き直すまで残す。
  const [anchor, setAnchor] = useState<PopoverAnchor>(NO_ANCHOR)
  const [nudge, setNudge] = useState<Nudge>(NO_NUDGE)
  const atLeft = placement.kind === "at" ? placement.left : 0
  const atTop = placement.kind === "at" ? placement.top : 0

  useExternalSync(() => (open ? acquireOverlay() : undefined), [open])

  const nudges = open && placement.kind === "at"

  useBeforePaintSync(() => {
    const element = anchorRef.current
    if (open && element !== null && (anchor.kind === "none" || anchor.element !== element)) {
      setAnchor({ kind: "element", element })
      return
    }
    const layer = bodyRef.current?.closest("[popover]")
    if (!nudges || layer === null || layer === undefined) {
      setNudge(NO_NUDGE)
      return
    }
    setNudge(nudgeToward(layer, atLeft, atTop))
  }, [open, anchorRef, anchor, nudges, atLeft, atTop])

  // Astryx は層を描く場所が決まってから層を描くので、中身が付いたときと寸法が付いたときにも測る。
  const bodyObservedRef = useResizeObservedRef<HTMLDivElement>(
    (element) => {
      bodyRef.current = element
      const layer = element.closest("[popover]")
      if (nudges && layer !== null) {
        setNudge(nudgeToward(layer, atLeft, atTop))
      }
    },
    () => {
      bodyRef.current = undefined
    },
  )

  useEventListener(
    document,
    "pointerdown",
    (event) => {
      const target = event.target
      if (!(target instanceof Node)) {
        return
      }
      // 層は `popover` 属性を付けて最上層に出るが、DOM の上では中身を包んでいる。
      const layer = bodyRef.current?.closest("[popover]")
      if (anchorRef.current?.contains(target) === true || layer?.contains(target) === true) {
        return
      }
      onClose()
    },
    { enabled: open },
  )

  return (
    <>
      {anchor.kind === "element" && (
        <AstryxPopover
          anchorRef={{ current: anchor.element }}
          isOpen={open}
          onOpenChange={(isOpen) => {
            // 開いたまま Astryx が閉じるのは Esc と隠れた「閉じる」で、どちらもフォーカスを口へ戻す。
            // 押した口へフォーカスが移らない環境（Safari）でも戻るよう、Astryx の戻し先に任せない。
            if (!isOpen && open) {
              anchorRef.current?.focus()
              onClose()
            }
          }}
          isEnabled={false}
          hasLightDismiss={false}
          hasEscapeDismiss={true}
          hasAutoFocus={false}
          isModal={false}
          closeButtonLabel="閉じる"
          placement="below"
          alignment={placement.kind === "below" ? placement.alignment : "start"}
          width={props.width}
          padding={0}
          label={props.ariaLabel}
          className={styles["popover"]}
          style={{ left: `${String(nudge.x)}px`, top: `${String(nudge.y)}px` }}
          content={
            <div ref={bodyObservedRef} className={props.className}>
              {open && props.children}
            </div>
          }
        />
      )}
    </>
  )
}

/**
 * 層の左上を `left`・`top` へ運ぶずれ。ずらすのは中の面だけで層は口の下に残るので、層の矩形が口の下の位置を言う。
 * 層が最上層に出る前（箱が無い）は前のずれを残し、出て寸法が付いたときの観測で測り直す。
 */
function nudgeToward(layer: Element, left: number, top: number): (previous: Nudge) => Nudge {
  const rect = layer.getBoundingClientRect()
  return (previous) => {
    if (rect.width === 0) {
      return previous
    }
    const x = left - rect.left
    const y = top - rect.top
    return previous.x === x && previous.y === y ? previous : { x, y }
  }
}
