// 詳しい設定の最上段、**選んでいるパックの名乗り**（docs/screen-design.md 13.6）。大きな丸い顔・
// 名前・`id: <パックの名前>`・「使用中」の札・ひとこと、変えられないパックならその理由の一言。
// 右端には使用中以外のパックにだけ「このキャラクターに切り替える」を置く。出し分けは
// `hooks/use-character-edit.ts` が畳んだ値のとおりで、判定を持たない。

import { type ReactElement } from "react"

import styles from "../character-screen.module.css"
import { type CharacterProfileModel } from "../hooks/use-character-edit.ts"
import { SwitchIcon } from "./action-icon.tsx"

export function CharacterProfile(props: { readonly profile: CharacterProfileModel }): ReactElement {
  const { profile } = props

  return (
    <div className={styles["character-profile"]}>
      {profile.face.kind === "shown" ? (
        <img className={styles["character-profile-face"]} src={profile.face.url} alt="" />
      ) : (
        <span className={styles["character-profile-face-blank"]} />
      )}
      <div className={styles["character-profile-text"]}>
        <div className={styles["character-profile-headline"]}>
          <h1 className={styles["character-profile-name"]}>{profile.name}</h1>
          <span className={styles["character-profile-id"]}>id: {profile.id}</span>
          {profile.inUse ? <span className={styles["character-in-use"]}>使用中</span> : null}
        </div>
        {profile.tagline.kind === "shown" ? (
          <span className={styles["character-profile-tagline"]}>{profile.tagline.text}</span>
        ) : null}
        {profile.note.kind === "shown" ? (
          <span className={styles["character-screen-note"]}>{profile.note.text}</span>
        ) : null}
      </div>
      {profile.switchTo.kind === "shown" ? (
        <button
          type="button"
          className={`${styles["character-button"]} ${styles["character-profile-action"]}`}
          disabled={profile.switchTo.disabled}
          title={profile.switchTo.title}
          onClick={profile.switchTo.onSwitch}
        >
          <SwitchIcon />
          このキャラクターに切り替える
        </button>
      ) : null}
    </div>
  )
}
