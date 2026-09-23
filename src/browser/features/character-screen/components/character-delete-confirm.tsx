// キャラクターを消す／同梱に戻す前の確かめ（`components/character-delete.tsx` の帯のボタンを
// 押すと開く。docs/screen-design.md 13.6「このキャラクターを消す」に見本がある）。表情1枚を消す前の
// 確かめ（`portrait-clear-confirm.tsx`）のパック全体版で、**画面全体を覆う**——作るダイアログと同じ
// UA 既定の中央寄せ（`showModal()` + `margin: auto`）を使う（`portrait-clear-confirm.tsx` は
// 押した位置に自分で置くが、こちらは帯のどこから開いても同じ場所でよい）。
//
// **打った id がパックの id と完全に一致するまで実行ボタンは押せない**（`docs/screen-design.md`
// 13.6「決まっていること」）。入力の下書きだけをここで持ち（「保つ」の1種類）、一致の判定は
// 描画のたびに引き直す軽い比較なので、これだけのために別ファイル・別フックへは出さない
// （`portrait-clear-confirm.tsx` の `anchoredStyle` と同じ扱い。docs/design.md 2章
// 「機能の中を分ける」）。
//
// `<dialog>` は開くときにだけ組み立て、閉じたら呼び出し側（`character-delete.tsx`）がこの部品ごと
// 外す（`portrait-clear-confirm.tsx` と同じ形。常にマウントして `open` を追随させる
// `character-create.tsx` とは違う——こちらは常設の入力欄を持たないので、開くたびに空から始まる
// ほうが「打ちかけの id が残る」事故を避けられる）。

import { useState, type MouseEvent, type ReactElement } from "react"

import { useModalDialog } from "../../../hooks/use-modal-dialog.ts"
import styles from "../character-screen.module.css"
import { type CharacterDeleteBandModel } from "../hooks/use-character-edit.ts"

export type CharacterDeleteConfirmProps = {
  readonly band: Extract<CharacterDeleteBandModel, { readonly kind: "shown" }>
  /** 打った id が一致した状態で実行ボタンを押したとき。 */
  readonly onConfirm: () => void
  /** 「やめる」・Esc・外側のクリックのいずれでも呼ばれる（開いているかは呼び出し側が持つ）。 */
  readonly onClose: () => void
}

export function CharacterDeleteConfirm(props: CharacterDeleteConfirmProps): ReactElement {
  const { band } = props
  const dialogRef = useModalDialog(true)
  const [typedId, setTypedId] = useState("")
  const canSubmit = typedId === band.pack

  // backdrop のクリックは `<dialog>` 自身が受け取る（`task-run-confirm.tsx` と同じ読み替え）。
  const onDialogClick = (event: MouseEvent<HTMLDialogElement>): void => {
    if (event.target === dialogRef.current) {
      props.onClose()
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className={styles["character-delete-dialog"]}
      aria-label={band.heading}
      onClose={props.onClose}
      onClick={onDialogClick}
    >
      <div className={styles["character-delete-body"]}>
        <div className={styles["character-delete-head"]}>
          {band.face.kind === "shown" ? (
            <img className={styles["character-delete-portrait"]} src={band.face.url} alt="" />
          ) : (
            <span className={styles["character-delete-portrait-blank"]} />
          )}
          <h2 className={styles["character-delete-question"]}>{band.dialogHeading}</h2>
        </div>
        <p className={styles["character-delete-note"]}>{band.dialogNote}</p>
        <div className={styles["character-delete-field"]}>
          <label className={styles["character-delete-label"]} htmlFor="character-delete-id">
            確かめのため、id を入力してください
          </label>
          <input
            id="character-delete-id"
            type="text"
            className={styles["character-delete-input"]}
            placeholder="id"
            value={typedId}
            onChange={(event) => {
              setTypedId(event.target.value)
            }}
          />
        </div>
        <div className={styles["character-delete-actions"]}>
          <button type="button" className={styles["character-button"]} onClick={props.onClose}>
            やめる
          </button>
          <button
            type="button"
            className={styles["character-delete-ok"]}
            disabled={!canSubmit}
            onClick={props.onConfirm}
          >
            {band.okLabel}
          </button>
        </div>
      </div>
    </dialog>
  )
}
