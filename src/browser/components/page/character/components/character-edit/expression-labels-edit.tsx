// 表情の見出しの右に置く「表情の名前を設定する」。
// 押しても即座には送らない。
// 押すとダイアログ（`ExpressionLabelsEditDialog`）を開き、そこで保存して初めて `edit.onSubmit` を呼ぶ。

import { useState, type ReactElement } from "react"

import { Button } from "../../../../ui/button/button.tsx"
import { PencilIcon } from "../../../../ui/icon/icon.tsx"
import type { ExpressionLabelsEditModel } from "../../domain/character-edit-model.ts"
import { ExpressionLabelsEditDialog } from "./expression-labels-edit-dialog.tsx"

export function ExpressionLabelsEdit(props: {
  readonly edit: ExpressionLabelsEditModel
}): ReactElement | undefined {
  const [open, setOpen] = useState(false)
  const { edit } = props

  if (edit.kind === "hidden") {
    return undefined
  }

  return (
    <>
      <Button
        variant="link"
        size="action"
        pressed="none"
        disabled={false}
        disclosure={{ kind: "none" }}
        className=""
        onClick={() => {
          setOpen(true)
        }}
      >
        <PencilIcon />
        表情の名前を設定する
      </Button>
      {open && (
        <ExpressionLabelsEditDialog
          rows={edit.rows}
          onSubmit={edit.onSubmit}
          onClose={() => {
            setOpen(false)
          }}
        />
      )}
    </>
  )
}
