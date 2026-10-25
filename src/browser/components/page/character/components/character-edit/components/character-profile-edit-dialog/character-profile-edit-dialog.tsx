// 名前と自己紹介文を設定するダイアログ本体。
// 開いている間だけ組み立てる。閉じたら呼び出し側がこの部品ごと外すので、次に開いたときは渡された初期値から下書きが始まる。
//
// id は作ったあと変えない欄なので出さない。
// 枠・見出し・footer の CSS は作るダイアログのクラス（`.character-create-*`）をそのまま流用する。

import { useState, type ReactElement } from "react"

import {
  MAX_CHARACTER_NAME_LENGTH,
  MAX_CHARACTER_TAGLINE_LENGTH,
} from "../../../../../../../../shared/character-pack/character-definition.ts"
import { Button } from "../../../../../../ui/button/button.tsx"
import { Dialog } from "../../../../../../ui/dialog/dialog.tsx"
import { Field } from "../../../../../../ui/field/field.tsx"
import { Heading } from "../../../../../../ui/heading/heading.tsx"
import { TextField } from "../../../../../../ui/text-field/text-field.tsx"
import { Text } from "../../../../../../ui/text/text.tsx"
import styles from "../../../../character.module.css"

/** 自己紹介文の説明（雑談のサイドバーの札にも出ることを添える）。 */
const TAGLINE_HINT = "画面や雑談のサイドバーのプロフィールに出る一言"
const NAME_HINT = "画面や吹き出しに出る名前。空にすると id をそのまま使います"

type CharacterProfileEditDialogProps = {
  /** 開いた時点の値。 */
  readonly name: string
  readonly tagline: string
  /** 「保存する」を押したとき。押すとそのまま閉じる（呼び出し側が `onClose` も呼ぶ）。 */
  readonly onSubmit: (name: string, tagline: string) => void
  /** 「やめる」・Esc・外側のクリックのいずれでも呼ばれる。 */
  readonly onClose: () => void
}

export function CharacterProfileEditDialog(props: CharacterProfileEditDialogProps): ReactElement {
  const [name, setName] = useState(props.name)
  const [tagline, setTagline] = useState(props.tagline)

  function submit(): void {
    props.onSubmit(name, tagline)
    props.onClose()
  }

  return (
    <Dialog
      open={true}
      ariaLabel="名前と自己紹介文を設定する"
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
          名前と自己紹介文を設定する
        </Heading>
        <Field
          variant="form"
          id="character-profile-edit-name"
          label="名前"
          hint={
            <Text element="span" size="label" tone="ink-quiet" weight="inherit" className="">
              {NAME_HINT}
            </Text>
          }
        >
          <TextField
            element="input"
            id="character-profile-edit-name"
            className={styles["character-create-input"]}
            maxLength={MAX_CHARACTER_NAME_LENGTH}
            value={name}
            onChange={setName}
          />
        </Field>
        <Field
          variant="form"
          id="character-profile-edit-tagline"
          label="自己紹介文"
          hint={
            <Text element="span" size="label" tone="ink-quiet" weight="inherit" className="">
              {TAGLINE_HINT}
            </Text>
          }
        >
          <TextField
            element="input"
            id="character-profile-edit-tagline"
            className={styles["character-create-input"]}
            maxLength={MAX_CHARACTER_TAGLINE_LENGTH}
            value={tagline}
            onChange={setTagline}
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
