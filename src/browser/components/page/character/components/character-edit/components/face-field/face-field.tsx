// キャラクター画面の顔の行。
// 帯の左端・一覧の丸・名乗りの大きな丸に出す1枚の縮図と、口は「差し替える」と「消す」の2つだけ。

import clsx from "clsx"
import type { ReactElement } from "react"

import { HStack } from "../../../../../../ui/h-stack/h-stack.tsx"
import { TrashIcon, UploadIcon } from "../../../../../../ui/icon/icon.tsx"
import { Text } from "../../../../../../ui/text/text.tsx"
import { VStack } from "../../../../../../ui/v-stack/v-stack.tsx"
import styles from "../../../../character.module.css"
import type { FaceFieldModel } from "../../../hooks/use-character-edit.ts"

/** 顔に選べる種類。中身の検証はサーバ側で、ここは選ぶときの絞り込みだけ。 */
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
          {face.image.kind !== "absent" && (
            <button
              type="button"
              className={clsx(styles["character-button"], styles["character-button-danger"])}
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
