// 画像を原寸で拡大して見る面（`docs/requirements.md` 4.10「画面での見え方」）。開ける場所が
// 複数にまたがる（入力欄の札・メインビューの依頼の見出し・雑談の控え）ので `components/ui/` に置く。
// **領域固有の見た目・意味は持たない**（`select.tsx` と同じ位置づけ）。
//
// **呼び出し側が開いている状態を持ち、開いている間だけこの部品を描く**
// （`features/task-board/components/task-run-confirm.tsx` と同じ形）。画面より大きい絵は
// 面の内側に収めて縮め、面の中で横スクロールはしない。閉じ方は Esc・背景のクリック・
// 閉じるボタンの3つ。
//
// **絵が読めなかったとき（`<img>` の `error`）に何を出すかは呼び出し側が渡す**
// （{@link ImageZoomFallback}）。この部品は代わりの絵と1行を出し分けるだけで、なぜ読めないかは
// 知らない。

import { type MouseEvent, type ReactElement, useState } from "react"

import { useModalDialog } from "../../../hooks/use-modal-dialog.ts"
import { Button } from "../button/button.tsx"
import styles from "./image-zoom.module.css"

const HEADING = "画像の拡大"
const CLOSE_LABEL = "閉じる"

/**
 * 絵が読めなかったときに代わりに出すもの。
 *
 * - `none`: 代わりは無い（読めないことが起きない。原寸がブラウザのメモリにある札など）
 * - `substitute`: 代わりの絵（`src`）と、なぜ代わりなのかを伝える1行（`note`）
 */
export type ImageZoomFallback =
  | { readonly kind: "none" }
  | { readonly kind: "substitute"; readonly src: string; readonly note: string }

export type ImageZoomProps = {
  /** 拡大して見せる原寸（data URL か、原寸を配る経路の URL）。 */
  readonly src: string
  readonly alt: string
  /** {@link src} が読めなかったときに代わりに出すもの。 */
  readonly fallback: ImageZoomFallback
  /** `×`・背景のクリック・Esc のいずれでも呼ばれる（開いているかどうかは呼び出し側が持つ）。 */
  readonly onClose: () => void
}

/** 開いた状態で組み立てられる `<dialog>`。閉じるときは呼び出し側がこの部品ごと外す。 */
export function ImageZoom(props: ImageZoomProps): ReactElement {
  const dialogRef = useModalDialog(true)
  // 読めなかったか。**開くたびに組み立て直す部品なので**、閉じて開き直せばまた原寸を取りに行く。
  const [failed, setFailed] = useState(false)
  const substitute = failed && props.fallback.kind === "substitute" ? props.fallback : undefined

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
      <img
        className={styles["image-zoom-image"]}
        src={substitute?.src ?? props.src}
        alt={props.alt}
        onError={() => setFailed(true)}
      />
      {substitute !== undefined && <p className={styles["image-zoom-note"]}>{substitute.note}</p>}
      <Button
        type="button"
        variant="outline"
        size="secondary"
        pressed="none"
        disabled={false}
        ariaLabel={undefined}
        ariaHasPopup={undefined}
        title={undefined}
        className={styles["image-zoom-close"] ?? ""}
        onClick={props.onClose}
      >
        {CLOSE_LABEL}
      </Button>
    </dialog>
  )
}
