// キャラクター画面の器。
// 左に一覧（`<CharacterList>`）、右に選んでいるパックの詳しい設定（`<CharacterEdit>`）の2段組、重なる新しく作るダイアログ（`<CharacterCreate>`）を置く。

import type { ReactElement } from "react"

import styles from "./character.module.css"
import { CharacterCreate } from "./components/character-create/character-create.tsx"
import { CharacterEdit } from "./components/character-edit/character-edit.tsx"
import { CharacterList } from "./components/character-list/character-list.tsx"
import type { UseCharacterResult } from "./hooks/use-character.ts"

export type PresentationalCharacterProps = UseCharacterResult

export function PresentationalCharacter(props: PresentationalCharacterProps): ReactElement {
  const { create } = props

  return (
    <div className={styles["character-screen-columns"]}>
      <CharacterList onCreate={create.onOpen} />
      <CharacterEdit />
      <CharacterCreate key={create.key} open={create.open} onClose={create.onClose} />
    </div>
  )
}
