// 名乗りの右に置く「プロフィールを設定する」（鉛筆のボタン）。
// 押すとダイアログ（`CharacterPersonaEditDialog`）を開き、そこで保存して初めて `edit.onSubmit` を呼ぶ。

import { useState, type ReactElement } from "react"

import { Button } from "../../../../../../ui/button/button.tsx"
import { PencilIcon } from "../../../../../../ui/icon/icon.tsx"
import styles from "../../../../character.module.css"
import type { CharacterPersonaEditModel } from "../../../../domain/character-edit-model.ts"
import { CharacterPersonaEditDialog } from "../character-persona-edit-dialog/character-persona-edit-dialog.tsx"

export function CharacterPersonaEdit(props: {
  readonly edit: CharacterPersonaEditModel
}): ReactElement | null {
  const [open, setOpen] = useState(false)
  const { edit } = props

  if (edit.kind === "hidden") {
    return null
  }

  return (
    <>
      <Button
        variant="outline"
        size="secondary"
        pressed="none"
        disabled={false}
        ariaLabel={undefined}
        disclosure={{ kind: "none" }}
        ariaHasPopup={undefined}
        title={undefined}
        className={styles["character-button-outline"]}
        onClick={() => {
          setOpen(true)
        }}
      >
        <PencilIcon />
        プロフィールを設定する
      </Button>
      {open && (
        <CharacterPersonaEditDialog
          persona={edit.persona}
          onSubmit={edit.onSubmit}
          onClose={() => {
            setOpen(false)
          }}
        />
      )}
    </>
  )
}
