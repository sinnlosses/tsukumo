// アイテムを一覧から消す前の確かめ。
// 消すとそのアイテムを置いているすべてのキャラクターの席が空になることを、数で言う。

import type { ReactElement } from "react"

import { Button } from "../../../../../../ui/button/button.tsx"
import { Dialog } from "../../../../../../ui/dialog/dialog.tsx"
import { HStack } from "../../../../../../ui/h-stack/h-stack.tsx"
import { Text } from "../../../../../../ui/text/text.tsx"
import characterStyles from "../../../../character.module.css"
import type { ItemRemoveConfirmModel } from "../../../../domain/item-edit-model.ts"
import styles from "./item-remove-confirm.module.css"

type OpenConfirm = Extract<ItemRemoveConfirmModel, { kind: "open" }>

export function ItemRemoveConfirm(props: { readonly confirm: OpenConfirm }): ReactElement {
  const { confirm } = props

  return (
    <Dialog
      open={true}
      ariaLabel="アイテムを消す"
      backdrop="dim"
      placement={{ kind: "auto" }}
      onClose={confirm.onCancel}
      className={styles["item-remove-confirm"]}
    >
      <HStack
        element="div"
        name={{ kind: "none" }}
        ref={undefined}
        gap="md"
        align="center"
        justify="start"
        wrap="nowrap"
        className=""
      >
        <img className={styles["item-remove-confirm-thumb"]} src={confirm.url} alt="" />
        <Text element="span" size="secondary" tone="inherit" weight="bold" className="">
          「{confirm.name}」を消しますか？
        </Text>
      </HStack>
      <Text
        element="p"
        size="action"
        tone="ink-quiet"
        weight="inherit"
        className={styles["item-remove-confirm-note"]}
      >
        {confirm.emptiedSeats === 0
          ? "どのキャラクターの席にも置いていません。"
          : `置いている ${String(confirm.emptiedSeats)} つの席が空になります。`}
      </Text>
      <HStack
        element="div"
        name={{ kind: "none" }}
        ref={undefined}
        gap="sm"
        align="stretch"
        justify="end"
        wrap="nowrap"
        className=""
      >
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
          onClick={confirm.onCancel}
        >
          やめる
        </Button>
        <Button
          variant="solid-danger"
          size="secondary"
          pressed="none"
          disabled={false}
          ariaLabel={undefined}
          disclosure={{ kind: "none" }}
          ariaHasPopup={undefined}
          title={undefined}
          className={styles["item-remove-confirm-ok"]}
          onClick={confirm.onConfirm}
        >
          <Text element="span" size="inherit" tone="inherit" weight="bold" className="">
            消す
          </Text>
        </Button>
      </HStack>
    </Dialog>
  )
}
