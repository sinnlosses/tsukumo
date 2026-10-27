// アイテムを足すダイアログ。名前と画像を選んで「足す」を押すと送る。
// 開いている間だけ組み立てる（閉じるときは呼び出し側が外す）。断られたら開いたまま一言を出す。
// 枠・見出し・footer の CSS は作るダイアログのクラス（`.character-create-*`）をそのまま流用する。

import { type ReactElement, useState } from "react"

import { MAX_ITEM_NAME_LENGTH } from "../../../../../../shared/item/item.ts"
import { Button } from "../../../../ui/button/button.tsx"
import { Dialog } from "../../../../ui/dialog/dialog.tsx"
import { Field } from "../../../../ui/field/field.tsx"
import { Heading } from "../../../../ui/heading/heading.tsx"
import { TextField } from "../../../../ui/text-field/text-field.tsx"
import { Text } from "../../../../ui/text/text.tsx"
import styles from "../../character.module.css"
import type { ItemAddDialogModel } from "../../domain/item-edit-model.ts"

/** 選ぶときの絞り込み。中身の検証はサーバ側。 */
const ITEM_FILE_ACCEPT = ".svg,.png,.gif"

type OpenDialog = Extract<ItemAddDialogModel, { kind: "open" }>

export function ItemAddDialog(props: { readonly dialog: OpenDialog }): ReactElement {
  const { dialog } = props
  const [name, setName] = useState("")
  const [file, setFile] = useState<File | undefined>(undefined)

  const ready = name.trim() !== "" && file !== undefined

  return (
    <Dialog
      open={true}
      ariaLabel="アイテムを足す"
      backdrop="dim"
      placement={{ kind: "auto" }}
      onClose={dialog.onClose}
      className={styles["character-create-dialog"]}
    >
      <div>
        <Heading
          level={2}
          size="heading"
          tone="inherit"
          weight="bold"
          className={styles["character-create-heading"]}
        >
          アイテムを足す
        </Heading>
        <Field variant="form" id="character-item-add-name" label="名前" hint={undefined}>
          <TextField
            element="input"
            id="character-item-add-name"
            className={styles["character-create-input"]}
            maxLength={MAX_ITEM_NAME_LENGTH}
            value={name}
            onChange={setName}
          />
        </Field>
        <Field variant="form" id="character-item-add-image" label="画像" hint={undefined}>
          <input
            id="character-item-add-image"
            type="file"
            accept={ITEM_FILE_ACCEPT}
            onChange={(event) => {
              setFile(event.currentTarget.files?.[0])
            }}
          />
        </Field>
        {dialog.rejection.kind === "shown" && (
          <Text element="p" size="secondary" tone="state-ng" weight="inherit" className="">
            {dialog.rejection.text}
          </Text>
        )}
        <div className={styles["character-create-footer"]}>
          <div className={styles["character-create-footer-spacer"]} />
          <Button
            variant="outline"
            size="secondary"
            pressed="none"
            disabled={false}
            disclosure={{ kind: "none" }}
            className={styles["character-button-outline"]}
            onClick={dialog.onClose}
          >
            やめる
          </Button>
          <Button
            variant="solid-accent"
            size="secondary"
            pressed="none"
            disabled={!ready}
            disclosure={{ kind: "none" }}
            className={styles["character-create-submit"]}
            onClick={() => {
              if (file !== undefined) {
                dialog.onSubmit(name.trim(), file)
              }
            }}
          >
            <Text element="span" size="inherit" tone="inherit" weight="bold" className="">
              足す
            </Text>
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
