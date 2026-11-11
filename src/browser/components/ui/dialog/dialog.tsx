// ダイアログの部品。中身は Astryx の `Dialog` で、持つのは開閉の写しと置き方（`placement`）と覆いの種類（`backdrop`）だけ。顔と箱は呼び出し側が `className` で渡す。
//
// Esc・外側のクリックはどちらも `onClose` を呼ぶ。

import { Dialog as AstryxDialog, type DialogVariant } from "@astryxdesign/core/Dialog"
import type { ReactElement, ReactNode } from "react"

import { acquireOverlay } from "../../../hooks/open-overlay.ts"
import { useExternalSync } from "../../../hooks/use-external-sync.ts"

type DialogBackdrop = "dim" | "deep" | "veil" | "sheet" | "clear"

/**
 * 置き方。`auto` は部品が置き方を持たない（中央寄せか、`className` の CSS で置く）。
 * `at` は押した位置などから決めた座標で置く。
 */
export type DialogPlacement =
  | { readonly kind: "auto" }
  | { readonly kind: "at"; readonly top: number; readonly left: number }

export type DialogProps = {
  readonly open: boolean
  readonly ariaLabel: string
  readonly backdrop: DialogBackdrop
  readonly placement: DialogPlacement
  readonly onClose: () => void
  readonly className: string
  readonly children: ReactNode
}

// 覆いの濃さだけの違い（deep・veil・sheet）は Astryx の覆いに寄せる。覆わない `clear` だけがテーマの variant。
const BACKDROP_VARIANT = {
  dim: "standard",
  deep: "standard",
  veil: "standard",
  sheet: "standard",
  clear: "clear",
} satisfies Record<DialogBackdrop, DialogVariant>

export function Dialog(props: DialogProps): ReactElement {
  useExternalSync(() => (props.open ? acquireOverlay() : undefined), [props.open])

  return (
    <AstryxDialog
      isOpen={props.open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          props.onClose()
        }
      }}
      variant={BACKDROP_VARIANT[props.backdrop]}
      style={
        props.placement.kind === "at"
          ? { top: `${String(props.placement.top)}px`, left: `${String(props.placement.left)}px` }
          : {}
      }
      padding={0}
      aria-label={props.ariaLabel}
      className={props.className}
    >
      {props.children}
    </AstryxDialog>
  )
}
