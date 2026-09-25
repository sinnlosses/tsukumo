// 名乗りの右に置く「名前とプロフィールを変える」（見本の鉛筆のボタン。`docs/screen-design.md`
// 13.6）。押しても即座には送らない——押すとダイアログ（`character-profile-edit-dialog.tsx`）を
// 開き、そこで保存して初めて `edit.onSubmit` を呼ぶ。開いているかどうかだけをここで持つ
// （「保つ」の1種類。`components/character-delete.tsx` と同じ形。docs/design.md 2章
// 「機能の中を分ける」）。
//
// 変えられないパックでは `edit.kind` が `"hidden"` なので何も出さない（出し分けは
// `hooks/use-character-edit.ts` が畳んだ値のとおりで、ここは判定を持たない）。

import { useState, type ReactElement } from "react"

import { Button } from "../../../../components/ui/button/button.tsx"
import styles from "../character-screen.module.css"
import { type CharacterProfileEditModel } from "../hooks/use-character-edit.ts"
import { PencilIcon } from "./action-icon.tsx"
import { CharacterProfileEditDialog } from "./character-profile-edit-dialog.tsx"

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
        type="button"
        variant="outline"
        size="secondary"
        pressed="none"
        disabled={false}
        ariaLabel={undefined}
        ariaHasPopup={undefined}
        title={undefined}
        className={styles["character-button-outline"] ?? ""}
        onClick={() => {
          setOpen(true)
        }}
      >
        <PencilIcon />
        名前とプロフィールを変える
      </Button>
      {open ? (
        <CharacterProfileEditDialog
          name={edit.name}
          tagline={edit.tagline}
          onSubmit={edit.onSubmit}
          onClose={() => {
            setOpen(false)
          }}
        />
      ) : null}
    </>
  )
}
