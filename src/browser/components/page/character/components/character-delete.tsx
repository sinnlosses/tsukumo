// 詳しい設定の最下部、キャラクターを消す／同梱に戻す帯（docs/screen-design.md 13.6「このキャラクターを
// 消す」。見本は同節が指す最下部の赤い帯）。
//
// **押しても即座には送らない。** 押すと確かめのダイアログ（`character-delete-confirm.tsx`）を開き、
// そこで id を打って一致して初めて `band.onSubmit` を呼ぶ。開いているかどうかだけをここで持つ
// （「保つ」の1種類。`components/portrait-card.tsx` の `confirmClear` と同じ形。
// docs/design.md 2章「機能の中を分ける」）。
//
// 消せないパック（`removal: "none"`）では `band.kind` が `"hidden"` なので何も出さない
// （出し分けは `hooks/use-character-edit.ts` が畳んだ値のとおりで、ここは判定を持たない）。

import { useState, type ReactElement } from "react"

import { Text } from "../../../../components/ui/text/text.tsx"
import styles from "../character-screen.module.css"
import { type CharacterDeleteBandModel } from "../hooks/use-character-edit.ts"
import { TrashIcon } from "./action-icon.tsx"
import { CharacterDeleteConfirm } from "./character-delete-confirm.tsx"

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
          className={`${styles["character-button"]} ${styles["character-button-danger"]}`}
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
      {open ? (
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
      ) : null}
    </>
  )
}
