// 人格の本文（`persona.md` の `## 覚えたこと` より前）を変えるダイアログ本体。
// 開いている間だけ組み立てる。閉じたら呼び出し側がこの部品ごと外すので、次に開いたときは渡された初期値から下書きが始まる。
//
// 枠・見出し・欄・footer の CSS は作るダイアログのクラス（`.character-create-*`）をそのまま流用する。

import { useState, type ReactElement } from "react"

import { MAX_PERSONA_BODY_LENGTH } from "../../../../../../../../shared/character-pack/persona-section.ts"
import { Button } from "../../../../../../ui/button/button.tsx"
import { Dialog } from "../../../../../../ui/dialog/dialog.tsx"
import { Heading } from "../../../../../../ui/heading/heading.tsx"
import { Text } from "../../../../../../ui/text/text.tsx"
import styles from "../../../../character.module.css"

const PERSONA_HINT =
  "口調や性格を書く。保存した人格が効くのは次に起こすセッションから。雑談で覚えたことはここには出ない"

export type CharacterPersonaEditDialogProps = {
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
      ariaLabel="人格を変える"
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
          人格
        </Heading>
        <div className={styles["character-create-field"]}>
          <label className={styles["character-create-label"]} htmlFor="character-persona-edit-body">
            本文
          </label>
          <textarea
            id="character-persona-edit-body"
            className={styles["character-persona-input"]}
            maxLength={MAX_PERSONA_BODY_LENGTH}
            value={persona}
            onChange={(event) => {
              setPersona(event.target.value)
            }}
          />
          <Text element="span" size="label" tone="ink-quiet" weight="inherit" className="">
            {PERSONA_HINT}
          </Text>
        </div>
        <div className={styles["character-create-footer"]}>
          <div className={styles["character-create-footer-spacer"]} />
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
            onClick={props.onClose}
          >
            やめる
          </Button>
          <Button
            variant="solid-accent"
            size="secondary"
            pressed="none"
            disabled={false}
            ariaLabel={undefined}
            disclosure={{ kind: "none" }}
            ariaHasPopup={undefined}
            title={undefined}
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
