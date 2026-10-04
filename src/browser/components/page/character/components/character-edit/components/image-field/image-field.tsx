// キャラクター画面の画像1枚の行（顔・背景）。
// 縮図（または空の枠）と、口は「差し替える」と「消す」の2つだけ。

import type { ReactElement } from "react"

import { Button } from "../../../../../../ui/button/button.tsx"
import { HStack } from "../../../../../../ui/h-stack/h-stack.tsx"
import { TrashIcon, UploadIcon } from "../../../../../../ui/icon/icon.tsx"
import { Text } from "../../../../../../ui/text/text.tsx"
import { VStack } from "../../../../../../ui/v-stack/v-stack.tsx"
import characterStyles from "../../../../character.module.css"
import type { ImageFieldModel } from "../../../../domain/character-edit-model.ts"
import styles from "./image-field.module.css"

const THUMBNAIL_CLASS = {
  face: { preview: "character-face-field-preview", blank: "character-face-field-blank" },
  background: { preview: "character-background-preview", blank: "character-background-blank" },
} as const satisfies Record<
  ImageFieldModel["kind"],
  { readonly preview: string; readonly blank: string }
>

export function ImageField(props: {
  readonly field: ImageFieldModel
  readonly disabled: boolean
}): ReactElement {
  const { field, disabled } = props
  const thumbnail = THUMBNAIL_CLASS[field.kind]

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
      {field.image.kind === "absent" ? (
        <span className={styles[thumbnail.blank]} />
      ) : (
        <img className={styles[thumbnail.preview]} src={field.image.url} alt={field.label} />
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
          {field.label}
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
          <label className={characterStyles["character-button"]}>
            <UploadIcon />
            差し替える
            <input
              type="file"
              className={characterStyles["character-card-file"]}
              aria-label={`${field.subject}を差し替える`}
              accept={field.accept}
              disabled={disabled}
              onChange={(event) => {
                field.onPick(event.currentTarget)
              }}
            />
          </label>
          {field.image.kind !== "absent" && (
            <Button
              variant="outline-soft-danger"
              size="secondary"
              pressed="none"
              disabled={disabled}
              ariaLabel={`${field.subject}を消す`}
              ariaHasPopup={undefined}
              disclosure={{ kind: "none" }}
              title={undefined}
              className={characterStyles["character-button-outline"]}
              onClick={field.onClear}
            >
              <TrashIcon />
              消す
            </Button>
          )}
        </HStack>
      </VStack>
    </HStack>
  )
}
