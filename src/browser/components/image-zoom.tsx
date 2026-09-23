// 画像を原寸で拡大して見る面（`docs/requirements.md` 4.10「画面での見え方」）。開ける場所が
// 複数にまたがる（入力欄の札・メインビューの依頼の見出し・雑談の控え）ので `components/` に置く。
// **領域固有の見た目・意味は持たない**（`select.tsx` と同じ位置づけ）。
//
// **呼び出し側が開いている状態を持ち、開いている間だけこの部品を描く**
// （`features/task-board/components/task-run-confirm.tsx` と同じ形）。画面より大きい絵は
// 面の内側に収めて縮め、面の中で横スクロールはしない。閉じ方は Esc・背景のクリック・
// 閉じるボタンの3つ。

import { type MouseEvent, type ReactElement } from "react"

import { useModalDialog } from "../hooks/use-modal-dialog.ts"
import styles from "./image-zoom.module.css"

const HEADING = "画像の拡大"
const CLOSE_LABEL = "閉じる"

export type ImageZoomProps = {
  /** 拡大して見せる原寸の data URL。 */
  readonly src: string
  readonly alt: string
  /** `×`・背景のクリック・Esc のいずれでも呼ばれる（開いているかどうかは呼び出し側が持つ）。 */
  readonly onClose: () => void
}

/** 開いた状態で組み立てられる `<dialog>`。閉じるときは呼び出し側がこの部品ごと外す。 */
export function ImageZoom(props: ImageZoomProps): ReactElement {
  const dialogRef = useModalDialog(true)

  // backdrop のクリックは `<dialog>` 自身が受け取る（`task-run-confirm.tsx` と同じ読み替え）。
  const onDialogClick = (event: MouseEvent<HTMLDialogElement>): void => {
    if (event.target === dialogRef.current) {
      props.onClose()
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className={styles["image-zoom"]}
      aria-label={HEADING}
      onClose={props.onClose}
      onClick={onDialogClick}
    >
      <img className={styles["image-zoom-image"]} src={props.src} alt={props.alt} />
      <button type="button" className={styles["image-zoom-close"]} onClick={props.onClose}>
        {CLOSE_LABEL}
      </button>
    </dialog>
  )
}
