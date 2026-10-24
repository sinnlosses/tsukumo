// 人格の本文（`persona.md` の `## 覚えたこと` より前）を変えるダイアログ本体。
// 開いている間だけ組み立てる。閉じたら呼び出し側がこの部品ごと外すので、次に開いたときは渡された初期値から下書きが始まる。
//
// 枠・見出し・footer の CSS は作るダイアログのクラス（`.character-create-*`）をそのまま流用する。

import { useState, type ReactElement } from "react"

import { MAX_PERSONA_BODY_LENGTH } from "../../../../../../../../shared/character-pack/persona-section.ts"
import { Button } from "../../../../../../ui/button/button.tsx"
import { Dialog } from "../../../../../../ui/dialog/dialog.tsx"
import { Field } from "../../../../../../ui/field/field.tsx"
import { Heading } from "../../../../../../ui/heading/heading.tsx"
import { TextField } from "../../../../../../ui/text-field/text-field.tsx"
import { Text } from "../../../../../../ui/text/text.tsx"
import styles from "../../../../character.module.css"

const PERSONA_HINT =
  "口調や性格を書く。保存した人格が効くのは次に起こすセッションから。雑談で覚えたことはここには出ない"

type CharacterPersonaEditDialogProps = {
  /** 開いた時点の本文。 */
  readonly persona: string
  /** 「保存する」を押したとき。返りを待ち、書き終えてから閉じる（断られたら開いたまま）。 */
  readonly onSubmit: (persona: string) => Promise<unknown>
  /** 「やめる」・Esc・外側のクリックのいずれでも呼ばれる。 */
  readonly onClose: () => void
}

export function CharacterPersonaEditDialog(props: CharacterPersonaEditDialogProps): ReactElement {
  const [persona, setPersona] = useState(props.persona)

  function submit(): void {
    void props
      .onSubmit(persona)
      .then(props.onClose)
      .catch(() => {})
  }

  return (
    <Dialog
      open={true}
      ariaLabel="プロフィールを設定する"
      backdrop="dim"
      placement={{ kind: "auto" }}
      onClose={props.onClose}
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
          プロフィールを設定する
        </Heading>
        <Field
          variant="form"
          id="character-persona-edit-body"
          label="本文"
          hint={
            <Text element="span" size="label" tone="ink-quiet" weight="inherit" className="">
              {PERSONA_HINT}
            </Text>
          }
        >
          <TextField
            element="textarea"
            id="character-persona-edit-body"
            className={styles["character-persona-input"]}
            maxLength={MAX_PERSONA_BODY_LENGTH}
            value={persona}
            onChange={setPersona}
          />
        </Field>
        <div className={styles["character-create-footer"]}>
          <div className={styles["character-create-footer-spacer"]} />
          <Button
            variant="outline"
            size="secondary"
            pressed="none"
            disabled={false}
            disclosure={{ kind: "none" }}
            className={styles["character-button-outline"]}
            onClick={props.onClose}
          >
            やめる
          </Button>
          <Button
            variant="solid-accent"
            size="secondary"
            pressed="none"
            disabled={false}
            disclosure={{ kind: "none" }}
            className={styles["character-create-submit"]}
            onClick={submit}
          >
            <Text element="span" size="inherit" tone="inherit" weight="bold" className="">
              保存する
            </Text>
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
