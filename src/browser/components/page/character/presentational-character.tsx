// キャラクター画面の器だけ（<PresentationalCharacter>。`docs/screen-design.md` 13.6 / 6.1）。
// 左に一覧（`<CharacterList>`）、右に選んでいるパックの詳しい設定（`<CharacterEdit>`）の2段組、
// 重なる新しく作るダイアログ（`<CharacterCreate>`）を置く。フックも算出も持たず、
// `hooks/use-character.ts` が畳んだ値をそのまま置く（docs/design.md 2章「機能の中を分ける」）。
//
// 会話へ戻る口と答え待ちの印、地・領域・字の色の操作子は、全画面の最上部の帯
// （`components/domain/screen-nav/`。13.9）にあるので、この画面は持たない。

import { type ReactElement } from "react"

import styles from "./character.module.css"
import { CharacterCreate } from "./components/character-create/character-create.tsx"
import { CharacterEdit } from "./components/character-edit/character-edit.tsx"
import { CharacterList } from "./components/character-list/character-list.tsx"
import { type UseCharacterResult } from "./hooks/use-character.ts"

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
