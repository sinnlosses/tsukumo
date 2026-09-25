// キャラクター画面の背景の行（docs/screen-design.md 13.8）。いまの背景の縮図と、**口は「差し替える」と
// 「消す」の2つだけ**で、覆いの濃さは画面から変えない（定義ファイルを手で直す）。敷かれるのは
// キャラビューだけ。有無の字と出し分けは `hooks/use-character-edit.ts` が畳んだ値のとおりで、
// 判定を持たない。

import { type ReactElement } from "react"

import styles from "../character-screen.module.css"
import { type BackgroundFieldModel } from "../hooks/use-character-edit.ts"
import { TrashIcon, UploadIcon } from "./action-icon.tsx"

/**
 * 背景に選べる種類（`docs/design.md` 7.1 / `docs/screen-design.md` 13.8）。**`.gif` は入れない**（動く背景は読む面の
 * 隣で気が散る）。中身の検証はサーバ側（`src/shared/character-background.ts`）。
 */
const BACKGROUND_FILE_ACCEPT = ".png,.jpg,.jpeg,.webp"

export function BackgroundField(props: {
  readonly background: BackgroundFieldModel
  readonly disabled: boolean
}): ReactElement {
  const { background, disabled } = props

  return (
    <div className={styles["character-background"]}>
      {background.image.kind === "absent" ? (
        <span className={styles["character-background-blank"]} />
      ) : (
        <img
          className={styles["character-background-preview"]}
          src={background.image.url}
          alt={background.label}
        />
      )}
      <div className={styles["character-background-side"]}>
        <span>{background.label}</span>
        <div className={styles["character-background-actions"]}>
          <label className={styles["character-button"]}>
            <UploadIcon />
            差し替える
            <input
              type="file"
              className={styles["character-card-file"]}
              aria-label="背景を差し替える"
              accept={BACKGROUND_FILE_ACCEPT}
              disabled={disabled}
              onChange={(event) => {
                background.onPick(event.currentTarget)
              }}
            />
          </label>
          {background.image.kind === "absent" ? null : (
            <button
              type="button"
              className={`${styles["character-button"]} ${styles["character-button-danger"]}`}
              aria-label="背景を消す"
              disabled={disabled}
              onClick={background.onClear}
            >
              <TrashIcon />
              消す
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
