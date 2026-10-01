// キャラクターを消す／同梱に戻す前の確かめ。画面全体を覆い、中央に置く。
//
// 打った id がパックの id と完全に一致するまで実行ボタンは押せない。
//
// 開くときにだけ組み立て、閉じたら呼び出し側がこの部品ごと外す。
// 常にマウントして `open` を追随させると、打ちかけの id が次に開いたときに残る。

import { useState, type ReactElement } from "react"

import { Button } from "../../../../../../ui/button/button.tsx"
import { Dialog } from "../../../../../../ui/dialog/dialog.tsx"
import { Heading } from "../../../../../../ui/heading/heading.tsx"
import { Text } from "../../../../../../ui/text/text.tsx"
import { VStack } from "../../../../../../ui/v-stack/v-stack.tsx"
import characterStyles from "../../../../character.module.css"
import type { CharacterDeleteBandModel } from "../../../hooks/use-character-edit.ts"
import styles from "./character-delete-confirm.module.css"

export type CharacterDeleteConfirmProps = {
  readonly band: Extract<CharacterDeleteBandModel, { readonly kind: "shown" }>
  /** 打った id が一致した状態で実行ボタンを押したとき。 */
  readonly onConfirm: () => void
  /** 「やめる」・Esc・外側のクリックのいずれでも呼ばれる（開いているかは呼び出し側が持つ）。 */
  readonly onClose: () => void
}

export function CharacterDeleteConfirm(props: CharacterDeleteConfirmProps): ReactElement {
  const { band } = props
  const [typedId, setTypedId] = useState("")
  const canSubmit = typedId === band.pack

  return (
    <Dialog
      open={true}
      ariaLabel={band.heading}
      backdrop="dim"
      placement={{ kind: "auto" }}
      onClose={props.onClose}
      className={styles["character-delete-dialog"]}
    >
      <VStack
        element="div"
        name={{ kind: "none" }}
        ref={undefined}
        gap="lg"
        align="stretch"
        justify="start"
        wrap="nowrap"
        className=""
      >
        <div className={styles["character-delete-head"]}>
          {band.face.kind === "shown" ? (
            <img className={styles["character-delete-portrait"]} src={band.face.url} alt="" />
          ) : (
            <span className={styles["character-delete-portrait-blank"]} />
          )}
          <Heading level={2} size="subheading" tone="inherit" weight="bold" className="">
            {band.dialogHeading}
          </Heading>
        </div>
        <Text
          element="p"
          size="secondary"
          tone="ink-quiet"
          weight="inherit"
          className={styles["character-delete-note"]}
        >
          {band.dialogNote}
        </Text>
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
          <Button
            variant="outline"
            size="secondary"
            pressed="none"
            disabled={false}
            ariaLabel={undefined}
            disclosure={{ kind: "none" }}
            ariaHasPopup={undefined}
            title={undefined}
            className={characterStyles["character-button-outline"]}
            onClick={props.onClose}
          >
            やめる
          </Button>
          <Button
            variant="solid-danger"
            size="secondary"
            pressed="none"
            disabled={!canSubmit}
            ariaLabel={undefined}
            disclosure={{ kind: "none" }}
            ariaHasPopup={undefined}
            title={undefined}
            className={styles["character-delete-ok"]}
            onClick={props.onConfirm}
          >
            <Text element="span" size="inherit" tone="inherit" weight="bold" className="">
              {band.okLabel}
            </Text>
          </Button>
        </div>
      </VStack>
    </Dialog>
  )
}
