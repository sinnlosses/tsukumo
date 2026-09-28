// 詳しい設定の最下部、キャラクターを消す／同梱に戻す帯。
//
// 押しても即座には送らない。
// 押すと確かめのダイアログ（`CharacterDeleteConfirm`）を開き、そこで id を打って一致して初めて `band.onSubmit` を呼ぶ。

import clsx from "clsx"
import { useState, type ReactElement } from "react"

import { TrashIcon } from "../../../../../../ui/icon/icon.tsx"
import { Text } from "../../../../../../ui/text/text.tsx"
import styles from "../../../../character.module.css"
import type { CharacterDeleteBandModel } from "../../../hooks/use-character-edit.ts"
import { CharacterDeleteConfirm } from "../character-delete-confirm/character-delete-confirm.tsx"

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
        <button
          type="button"
          className={clsx(styles["character-button"], styles["character-button-danger"])}
          disabled={band.disabled}
          title={band.title}
          onClick={() => {
            setOpen(true)
          }}
        >
          <TrashIcon />
          {band.buttonLabel}
        </button>
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
