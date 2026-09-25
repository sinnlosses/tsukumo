// ダイアログの部品（`docs/design.md` 2章「`components/ui/` の部品（variant の作法と一覧）」の
// `Dialog`）。**持つのは振る舞い（開閉・Esc・外側クリック）と背景（`backdrop`）と置き方
// （`placement`）だけ**——顔と箱（幅・余白・地・枠・角丸・影）は呼び出し側が `className` で渡す。
//
// `useModalDialog` の呼び出し・Esc の `close`・backdrop のクリックの読み替え（`event.target` が
// `<dialog>` 自身のときだけ）をここに持ち、どれも {@link DialogProps.onClose} を呼ぶ。呼び出し側は
// `onDialogClick` を自分で組み立てなくてよい。

import { type CSSProperties, type MouseEvent, type ReactElement, type ReactNode } from "react"

import { useModalDialog } from "../../../hooks/use-modal-dialog.ts"
import styles from "./dialog.module.css"

/** アクセシブルネームの付け方。見える文字列をそのまま渡すか、見出しなど別の要素の id を指すか。 */
export type DialogName =
  | { readonly kind: "label"; readonly label: string }
  | { readonly kind: "labelledby"; readonly id: string }

export type DialogBackdrop = "dim" | "deep" | "clear"

/**
 * 置き方。`auto` は部品が置き方を持たない（ブラウザ既定の中央寄せか、`className` の CSS で置く）。
 * `at` は押した位置などから決めた座標を inline で置く（`position` 自体は `className` 側が持つ）。
 */
export type DialogPlacement =
  | { readonly kind: "auto" }
  | { readonly kind: "at"; readonly top: number; readonly left: number }

export type DialogProps = {
  readonly open: boolean
  readonly name: DialogName
  readonly backdrop: DialogBackdrop
  readonly placement: DialogPlacement
  readonly onClose: () => void
  /** 顔と箱（幅・余白・地・枠・角丸・影）を渡す。 */
  readonly className: string
  readonly children: ReactNode
}

const DIALOG_BACKDROP_CLASS = {
  dim: styles["dialog-backdrop-dim"],
  deep: styles["dialog-backdrop-deep"],
  clear: styles["dialog-backdrop-clear"],
} satisfies Record<DialogBackdrop, string | undefined>

export function Dialog(props: DialogProps): ReactElement {
  const dialogRef = useModalDialog(props.open)

  // backdrop のクリックは `<dialog>` 自身が受け取る（中身は子要素が受け取るので target がずれる）。
  const handleClick = (event: MouseEvent<HTMLDialogElement>): void => {
    if (event.target === dialogRef.current) {
      props.onClose()
    }
  }

  const className = [DIALOG_BACKDROP_CLASS[props.backdrop], props.className]
    .filter((value): value is string => value !== undefined && value !== "")
    .join(" ")

  const style: CSSProperties =
    props.placement.kind === "at"
      ? { top: `${String(props.placement.top)}px`, left: `${String(props.placement.left)}px` }
      : {}

  return (
    <dialog
      ref={dialogRef}
      className={className}
      style={style}
      aria-label={props.name.kind === "label" ? props.name.label : undefined}
      aria-labelledby={props.name.kind === "labelledby" ? props.name.id : undefined}
      onClose={props.onClose}
      onClick={handleClick}
    >
      {props.children}
    </dialog>
  )
}
