// ダイアログの部品。持つのは振る舞い（開閉・Esc・外側クリック）と背景（`backdrop`）と置き方（`placement`）だけで、顔と箱は呼び出し側が `className` で渡す。
//
// Esc の `close`・backdrop のクリックの読み替え（`event.target` が `<dialog>` 自身のときだけ）はどれも `onClose` を呼ぶ。

import clsx from "clsx"
import type { CSSProperties, MouseEvent, ReactElement, ReactNode } from "react"

import { useModalDialog } from "../../../hooks/use-modal-dialog.ts"
import styles from "./dialog.module.css"

export type DialogBackdrop = "dim" | "deep" | "veil" | "clear"

/**
 * 置き方。`auto` は部品が置き方を持たない（ブラウザ既定の中央寄せか、`className` の CSS で置く）。
 * `at` は押した位置などから決めた座標を inline で置く（`position` 自体は `className` 側が持つ）。
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

const DIALOG_BACKDROP_CLASS = {
  dim: styles["dialog-backdrop-dim"],
  deep: styles["dialog-backdrop-deep"],
  veil: styles["dialog-backdrop-veil"],
  clear: styles["dialog-backdrop-clear"],
} satisfies Record<DialogBackdrop, string>

export function Dialog(props: DialogProps): ReactElement {
  const dialogRef = useModalDialog(props.open)

  // backdrop のクリックは `<dialog>` 自身が受け取る（中身は子要素が受け取るので target がずれる）。
  const handleClick = (event: MouseEvent<HTMLDialogElement>): void => {
    if (event.target === dialogRef.current) {
      props.onClose()
    }
  }

  const className = clsx(DIALOG_BACKDROP_CLASS[props.backdrop], props.className)

  const style: CSSProperties =
    props.placement.kind === "at"
      ? { top: `${String(props.placement.top)}px`, left: `${String(props.placement.left)}px` }
      : {}

  return (
    <dialog
      ref={dialogRef}
      className={className}
      style={style}
      aria-label={props.ariaLabel}
      onClose={props.onClose}
      onClick={handleClick}
    >
      {props.children}
    </dialog>
  )
}
