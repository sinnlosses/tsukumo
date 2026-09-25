// 作るダイアログの必須の立ち絵（`default`）を選ぶ大きな枠（docs/screen-design.md 13.6）。
// **見た目は表情のカード（`portrait-card.tsx`）の空欄と同じ語彙を大きさだけ変えて流用する**
// （`character-card` / `character-card-blank`。CSS に新しい語彙を増やさない）。
//
// 立ち絵がまだ無い間は点線の枠に「いつもの顔の立ち絵」の案内、選んだあとはその画像を出す。
// どちらの状態でも画像を落とせる（落とすと差し替え）。判定は持たず、`hooks/use-character-create.ts`
// が畳んだ `PortraitDropModel` をそのまま置く。

import { type DragEvent, type ReactElement } from "react"

import { Text } from "../../../../../../ui/text/text.tsx"
import styles from "../../../../character.module.css"
import { UploadIcon } from "../../../action-icon/action-icon.tsx"
import { type PortraitDropModel } from "../../hooks/use-character-create.ts"

const PORTRAIT_FILE_ACCEPT = ".svg,.png,.gif"

export function PortraitDrop(props: { readonly drop: PortraitDropModel }): ReactElement {
  const { drop } = props

  const onDragOver = (event: DragEvent): void => {
    event.preventDefault()
  }
  const onDrop = (event: DragEvent): void => {
    event.preventDefault()
    const file = event.dataTransfer.files[0]
    if (file !== undefined) {
      drop.onDropFile(file)
    }
  }

  const fileInput = (
    <input
      type="file"
      className={styles["character-card-file"]}
      aria-label={drop.pickAriaLabel}
      accept={PORTRAIT_FILE_ACCEPT}
      onChange={(event) => {
        drop.onPick(event.currentTarget)
      }}
    />
  )

  if (drop.image.kind === "picked") {
    return (
      <label
        className={`${styles["character-card"]} ${styles["character-create-portrait"]}`}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <img className={styles["character-create-portrait-image"]} src={drop.image.url} alt="" />
        <Text element="span" size="label" tone="inherit" weight="inherit" className="">
          差し替えるにはもう一度選ぶ
        </Text>
        {fileInput}
      </label>
    )
  }

  return (
    <label
      className={`${styles["character-card"]} ${styles["character-card-blank"]} ${styles["character-create-portrait"]}`}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <span className={styles["character-card-plus"]}>
        <UploadIcon />
      </span>
      <Text element="span" size="secondary" tone="ink" weight="inherit" className="">
        いつもの顔の立ち絵
      </Text>
      <Text element="span" size="label" tone="inherit" weight="inherit" className="">
        画像をドロップ、または押して選ぶ
        <br />
        ほかの表情はあとから足せます
      </Text>
      {fileInput}
    </label>
  )
}
