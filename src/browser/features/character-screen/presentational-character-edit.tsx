// キャラクター画面の主役、**立ち絵の並びと差し色と背景**の**器だけ**
// （<PresentationalCharacterEdit>。docs/design.md 13.6 / 7.1）。表情ごとのカードは
// `components/portrait-card.tsx`、背景の行は `components/background-field.tsx` に任せる。
// フックも算出も持たず、`hooks/use-character-edit.ts` が畳んだ値をそのまま置く
// （docs/design.md 2章「機能の中を分ける」）。

import { type ReactElement } from "react"

import styles from "./character-screen.module.css"
import { BackgroundField } from "./components/background-field.tsx"
import { PortraitCard } from "./components/portrait-card.tsx"
import { type CharacterEditModel } from "./hooks/use-character-edit.ts"

/** 画面から変えられないパックのときに出す一言（理由は探索の順。`docs/design.md` 7.1）。 */
const NOT_EDITABLE_NOTE = "起動先の characters/local のパックは、画面からは変えられない"

export type PresentationalCharacterEditProps = CharacterEditModel

export function PresentationalCharacterEdit(
  props: PresentationalCharacterEditProps,
): ReactElement | null {
  if (props.kind === "waiting") {
    return null
  }

  return (
    <>
      {props.disabled ? (
        <p className={styles["character-screen-note"]}>{NOT_EDITABLE_NOTE}</p>
      ) : null}
      <div className={styles["character-gallery"]}>
        {props.cards.map((card) => (
          <PortraitCard key={card.expression} card={card} disabled={props.disabled} />
        ))}
      </div>
      <fieldset className={styles["character-screen-fieldset"]}>
        <legend>差し色</legend>
        <div className={styles["character-screen-row"]}>
          {props.outfitAccents.map((field) => (
            <div className={styles["character-screen-field"]} key={field.outfit}>
              <label htmlFor={field.inputId}>{field.label}</label>
              <input
                id={field.inputId}
                type="color"
                disabled={props.disabled}
                value={field.value}
                onChange={(event) => {
                  field.onChange(event.target.value)
                }}
              />
            </div>
          ))}
        </div>
      </fieldset>
      <fieldset className={styles["character-screen-fieldset"]}>
        <legend>背景</legend>
        <div className={styles["character-screen-row"]}>
          <BackgroundField background={props.background} disabled={props.disabled} />
        </div>
      </fieldset>
    </>
  )
}
