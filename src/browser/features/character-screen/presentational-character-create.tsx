// **新しいキャラクターパックを作る画面**（`#character/new`。`docs/design.md` 7.1 / 13.6）の
// **器だけ**（<PresentationalCharacterCreate>）。左上の「← キャラクターへ戻る」と、名前・必須の
// 立ち絵・差し色の口、名前の欄の下の一言（作れたら「このキャラクターに切り替える」を添える）を
// 置く。フックも算出も持たず、`hooks/use-character-create.ts` が畳んだ値をそのまま置く
// （docs/design.md 2章「機能の中を分ける」）。

import { type ReactElement } from "react"

import styles from "./character-screen.module.css"
import { type CharacterCreateModel } from "./hooks/use-character-create.ts"

/** `<input type="file">` に出す受け付ける種類（`components/portrait-card.tsx` と同じ3つ）。 */
const PORTRAIT_FILE_ACCEPT = ".svg,.png,.gif"

export type PresentationalCharacterCreateProps = CharacterCreateModel

export function PresentationalCharacterCreate(
  props: PresentationalCharacterCreateProps,
): ReactElement {
  const { form } = props

  return (
    <div className={styles["character-screen"]}>
      <div className={styles["character-screen-bar"]}>
        <a className={styles["character-screen-back"]} href={props.backHref}>
          ← キャラクターへ戻る
        </a>
      </div>
      {form.kind === "waiting" ? null : (
        <fieldset className={styles["character-screen-fieldset"]}>
          <legend>新しいキャラクター</legend>
          <div className={styles["character-screen-field"]}>
            <label htmlFor="character-create-name">名前</label>
            <input
              id="character-create-name"
              type="text"
              className={styles["character-screen-create-name"]}
              value={form.name}
              onChange={(event) => form.onNameChange(event.target.value)}
            />
          </div>
          {form.portraitFields.map((field) => (
            <div className={styles["character-screen-field"]} key={field.expression}>
              <label htmlFor={field.inputId}>{field.label}</label>
              <input
                id={field.inputId}
                type="file"
                className={styles["character-screen-create-file"]}
                accept={PORTRAIT_FILE_ACCEPT}
                onChange={(event) => {
                  field.onPick(event.currentTarget)
                }}
              />
            </div>
          ))}
          <div className={styles["character-screen-field"]}>
            <label htmlFor="character-create-accent">差し色</label>
            <input
              id="character-create-accent"
              type="color"
              value={form.accent}
              onChange={(event) => form.onAccentChange(event.target.value)}
            />
          </div>
          {form.note.kind === "none" ? null : (
            <p className={styles["character-screen-note"]}>
              {form.note.text}
              {form.note.kind === "created" ? (
                <button
                  type="button"
                  className={styles["character-screen-switch"]}
                  disabled={form.note.switchDisabled}
                  title={form.note.switchTitle}
                  onClick={form.note.onSwitch}
                >
                  このキャラクターに切り替える
                </button>
              ) : null}
            </p>
          )}
          <button
            type="button"
            className={styles["character-screen-create-submit"]}
            disabled={!form.canSubmit}
            onClick={form.onSubmit}
          >
            作る
          </button>
        </fieldset>
      )}
    </div>
  )
}
