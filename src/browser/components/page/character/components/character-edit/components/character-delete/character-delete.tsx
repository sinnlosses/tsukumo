// 詳しい設定の最下部、キャラクターを消す／同梱に戻す帯。
//
// 押しても即座には送らない。
// 押すと確かめのダイアログ（`CharacterDeleteConfirm`）を開き、そこで id を打って一致して初めて `band.onSubmit` を呼ぶ。

import { useState, type ReactElement } from "react"

import { Button } from "../../../../../../ui/button/button.tsx"
import { TrashIcon } from "../../../../../../ui/icon/icon.tsx"
import { Text } from "../../../../../../ui/text/text.tsx"
import characterStyles from "../../../../character.module.css"
import type { CharacterDeleteBandModel } from "../../../../domain/character-edit-model.ts"
import { CharacterDeleteConfirm } from "../character-delete-confirm/character-delete-confirm.tsx"
import styles from "./character-delete.module.css"

export function CharacterDelete(props: {
  readonly band: CharacterDeleteBandModel
}): ReactElement | null {
  const [open, setOpen] = useState(false)
  const { band } = props

  if (band.kind === "hidden") {
    return null
  }

  return (
    <>
      <section
        className={styles["character-delete-band"]}
        aria-labelledby="character-delete-heading"
      >
        <div className={styles["character-delete-band-text"]}>
          <Text element="span" size="secondary" tone="state-ng" weight="bold" className="">
            <span id="character-delete-heading">{band.heading}</span>
          </Text>
          <Text element="span" size="action" tone="ink-quiet" weight="inherit" className="">
            {band.note}
          </Text>
        </div>
        <Button
          variant="outline-soft-danger"
          size="secondary"
          pressed="none"
          disabled={band.disabled}
          ariaLabel={undefined}
          ariaHasPopup={undefined}
          disclosure={{ kind: "none" }}
          title={band.title}
          className={characterStyles["character-button-outline"]}
          onClick={() => {
            setOpen(true)
          }}
        >
          <TrashIcon />
          {band.buttonLabel}
        </Button>
      </section>
      {open && (
        <CharacterDeleteConfirm
          band={band}
          onConfirm={() => {
            band.onSubmit()
            setOpen(false)
          }}
          onClose={() => {
            setOpen(false)
          }}
        />
      )}
    </>
  )
}
