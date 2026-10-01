// 名前とひとことプロフィールを変えるダイアログ本体。
// 開いている間だけ組み立てる。閉じたら呼び出し側がこの部品ごと外すので、次に開いたときは渡された初期値から下書きが始まる。
//
// id は作ったあと変えない欄なので出さない。
// 枠・見出し・欄・footer の CSS は作るダイアログのクラス（`.character-create-*`）をそのまま流用する。

import { useState, type ReactElement } from "react"

import {
  MAX_CHARACTER_NAME_LENGTH,
  MAX_CHARACTER_TAGLINE_LENGTH,
} from "../../../../../../../../shared/character-pack/character-definition.ts"
import { Button } from "../../../../../../ui/button/button.tsx"
import { Dialog } from "../../../../../../ui/dialog/dialog.tsx"
import { Heading } from "../../../../../../ui/heading/heading.tsx"
import { Text } from "../../../../../../ui/text/text.tsx"
import styles from "../../../../character.module.css"

/** ひとことプロフィールの説明（雑談のサイドバーの札にも出ることを添える）。 */
const TAGLINE_HINT = "画面や雑談のサイドバーのプロフィールの札に出るひとこと"
const NAME_HINT = "画面や吹き出しに出る名前。空にすると id をそのまま使います"

export type CharacterProfileEditDialogProps = {
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
      ariaLabel="名前とプロフィールを変える"
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
          名前とプロフィール
        </Heading>
        <div className={styles["character-create-field"]}>
          <label className={styles["character-create-label"]} htmlFor="character-profile-edit-name">
            名前
          </label>
          <input
            id="character-profile-edit-name"
            type="text"
            className={styles["character-create-input"]}
            maxLength={MAX_CHARACTER_NAME_LENGTH}
            value={name}
            onChange={(event) => {
              setName(event.target.value)
            }}
          />
          <Text element="span" size="label" tone="ink-quiet" weight="inherit" className="">
            {NAME_HINT}
          </Text>
        </div>
        <div className={styles["character-create-field"]}>
          <label
            className={styles["character-create-label"]}
            htmlFor="character-profile-edit-tagline"
          >
            ひとことプロフィール
          </label>
          <input
            id="character-profile-edit-tagline"
            type="text"
            className={styles["character-create-input"]}
            maxLength={MAX_CHARACTER_TAGLINE_LENGTH}
            value={tagline}
            onChange={(event) => {
              setTagline(event.target.value)
            }}
          />
          <Text element="span" size="label" tone="ink-quiet" weight="inherit" className="">
            {TAGLINE_HINT}
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
