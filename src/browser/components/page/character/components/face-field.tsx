// キャラクター画面の顔の行（`docs/screen-design.md` 13.9「顔」）。帯の左端・一覧の丸・名乗りの
// 大きな丸に出す1枚の縮図と、**口は「差し替える」と「消す」の2つだけ**（背景の行と同じ形。
// `background-field.tsx`）。有無の字と出し分けは `hooks/use-character-edit.ts` が畳んだ値の
// とおりで、判定を持たない。

import { type ReactElement } from "react"

import { HStack } from "../../../../components/ui/h-stack/h-stack.tsx"
import { Text } from "../../../../components/ui/text/text.tsx"
import { VStack } from "../../../../components/ui/v-stack/v-stack.tsx"
import styles from "../character-screen.module.css"
import { type FaceFieldModel } from "../hooks/use-character-edit.ts"
import { TrashIcon, UploadIcon } from "./action-icon.tsx"

/**
 * 顔に選べる種類。**立ち絵と同じ**（`docs/screen-design.md` 13.9「顔」・`src/shared/character-face.ts`）。
 * 中身の検証はサーバ側。
 */
const FACE_FILE_ACCEPT = ".svg,.png,.gif"

export function FaceField(props: {
  readonly face: FaceFieldModel
  readonly disabled: boolean
}): ReactElement {
  const { face, disabled } = props

  return (
    <HStack
      element="div"
      name={{ kind: "none" }}
      ref={undefined}
      gap="lg"
      align="center"
      justify="start"
      wrap="wrap"
      className=""
    >
      {face.image.kind === "absent" ? (
        <span className={styles["character-face-field-blank"]} />
      ) : (
        <img
          className={styles["character-face-field-preview"]}
          src={face.image.url}
          alt={face.label}
        />
      )}
      <VStack
        element="div"
        name={{ kind: "none" }}
        ref={undefined}
        gap="sm"
        align="stretch"
        justify="start"
        wrap="nowrap"
        className=""
      >
        <Text element="span" size="secondary" tone="inherit" weight="inherit" className="">
          {face.label}
        </Text>
        <HStack
          element="div"
          name={{ kind: "none" }}
          ref={undefined}
          gap="sm"
          align="stretch"
          justify="start"
          wrap="wrap"
          className=""
        >
          <label className={styles["character-button"]}>
            <UploadIcon />
            差し替える
            <input
              type="file"
              className={styles["character-card-file"]}
              aria-label="顔を差し替える"
              accept={FACE_FILE_ACCEPT}
              disabled={disabled}
              onChange={(event) => {
                face.onPick(event.currentTarget)
              }}
            />
          </label>
          {face.image.kind === "absent" ? null : (
            <button
              type="button"
              className={`${styles["character-button"]} ${styles["character-button-danger"]}`}
              aria-label="顔を消す"
              disabled={disabled}
              onClick={face.onClear}
            >
              <TrashIcon />
              消す
            </button>
          )}
        </HStack>
      </VStack>
    </HStack>
  )
}
