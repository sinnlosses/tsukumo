// 名前とひとことプロフィールを変えるダイアログ本体（「名前とプロフィールを変える」を押すと開く。
// `components/character-profile-edit.tsx` の「開いているか」を受けて、開いている間だけ組み立てる
// （`character-delete-confirm.tsx` と同じ形。閉じたら呼び出し側がこの部品ごと外すので、次に開いた
// ときは渡された初期値から下書きが始まる）。
//
// **形は作るダイアログ（`character-create.tsx`）と同じ枠・同じ欄の書き方**
// （`docs/screen-design.md` 13.6）。id は作ったあと変えない欄なので出さない
// （作ったあとは変えない、と決めている）。**枠・見出し・欄・footer の CSS は
// 作るダイアログのクラスをそのまま流用する**（`.character-create-*`。見た目が同じなので、
// このためだけの見た目違いのクラスを増やさない）。

import { useState, type ReactElement } from "react"

import {
  MAX_CHARACTER_NAME_LENGTH,
  MAX_CHARACTER_TAGLINE_LENGTH,
} from "../../../../../../../../shared/character-definition.ts"
import { Button } from "../../../../../../ui/button/button.tsx"
import { Dialog } from "../../../../../../ui/dialog/dialog.tsx"
import { Heading } from "../../../../../../ui/heading/heading.tsx"
import { Text } from "../../../../../../ui/text/text.tsx"
import styles from "../../../../character.module.css"

/** ひとことプロフィールの説明（雑談のサイドバーの札にも出ることを添える。`docs/screen-design.md`
 * 13.7「プロフィールの札」）。 */
const TAGLINE_HINT = "画面や雑談のサイドバーのプロフィールの札に出るひとこと"
const NAME_HINT = "画面や吹き出しに出る名前。空にすると id をそのまま使います"

export type CharacterProfileEditDialogProps = {
  /** 開いた時点の値（呼び出し側〔`character-profile-edit.tsx`〕が畳んだ現在値）。 */
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
      name={{ kind: "label", label: "名前とプロフィールを変える" }}
      backdrop="dim"
      placement={{ kind: "auto" }}
      onClose={props.onClose}
      className={styles["character-create-dialog"] ?? ""}
    >
      <div className={styles["character-create-body"]}>
        <Heading
          level={2}
          size="heading"
          tone="inherit"
          weight="bold"
          className={styles["character-create-heading"] ?? ""}
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
            type="button"
            variant="outline"
            size="secondary"
            pressed="none"
            disabled={false}
            ariaLabel={undefined}
            ariaHasPopup={undefined}
            title={undefined}
            className={styles["character-button-outline"] ?? ""}
            onClick={props.onClose}
          >
            やめる
          </Button>
          <Button
            type="button"
            variant="solid-accent"
            size="secondary"
            pressed="none"
            disabled={false}
            ariaLabel={undefined}
            ariaHasPopup={undefined}
            title={undefined}
            className={styles["character-create-submit"] ?? ""}
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
