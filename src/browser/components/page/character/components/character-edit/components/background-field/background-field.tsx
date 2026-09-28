// キャラクター画面の背景の行。いまの背景の縮図と、口は「差し替える」と「消す」の2つだけ。
// 覆いの濃さは画面から変えない（定義ファイルを手で直す）。

import clsx from "clsx"
import type { ReactElement } from "react"

import { HStack } from "../../../../../../ui/h-stack/h-stack.tsx"
import { TrashIcon, UploadIcon } from "../../../../../../ui/icon/icon.tsx"
import { Text } from "../../../../../../ui/text/text.tsx"
import { VStack } from "../../../../../../ui/v-stack/v-stack.tsx"
import styles from "../../../../character.module.css"
import type { BackgroundFieldModel } from "../../../hooks/use-character-edit.ts"

/**
 * 背景に選べる種類。`.gif` は入れない（動く背景は読む面の隣で気が散る）。
 * 中身の検証はサーバ側で、ここは選ぶときの絞り込みだけ。
 */
const BACKGROUND_FILE_ACCEPT = ".png,.jpg,.jpeg,.webp"

export function BackgroundField(props: {
  readonly background: BackgroundFieldModel
  readonly disabled: boolean
}): ReactElement {
  const { background, disabled } = props

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
      {background.image.kind === "absent" ? (
        <span className={styles["character-background-blank"]} />
      ) : (
        <img
          className={styles["character-background-preview"]}
          src={background.image.url}
          alt={background.label}
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
          {background.label}
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
              aria-label="背景を差し替える"
              accept={BACKGROUND_FILE_ACCEPT}
              disabled={disabled}
              onChange={(event) => {
                background.onPick(event.currentTarget)
              }}
            />
          </label>
          {background.image.kind !== "absent" && (
            <button
              type="button"
              className={clsx(styles["character-button"], styles["character-button-danger"])}
              aria-label="背景を消す"
              disabled={disabled}
              onClick={background.onClear}
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
