// 名乗りの右に置く「名前とプロフィールを変える」（鉛筆のボタン）。
// 押しても即座には送らない。
// 押すとダイアログ（`CharacterProfileEditDialog`）を開き、そこで保存して初めて `edit.onSubmit` を呼ぶ。

import { useState, type ReactElement } from "react"

import { Button } from "../../../../../../ui/button/button.tsx"
import { PencilIcon } from "../../../../../../ui/icon/icon.tsx"
import styles from "../../../../character.module.css"
import type { CharacterProfileEditModel } from "../../../hooks/use-character-edit.ts"
import { CharacterProfileEditDialog } from "../character-profile-edit-dialog/character-profile-edit-dialog.tsx"

export function CharacterProfileEdit(props: {
  readonly edit: CharacterProfileEditModel
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
        名前とプロフィールを変える
      </Button>
      {open && (
        <CharacterProfileEditDialog
          name={edit.name}
          tagline={edit.tagline}
          onSubmit={edit.onSubmit}
          onClose={() => {
            setOpen(false)
          }}
        />
      )}
    </>
  )
}
