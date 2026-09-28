// 新しいキャラクターパックを作るダイアログの入口。
// 開いているかどうかは呼び出し側の state が持ち、ここへは `open` と `onClose` で渡す。

import type { ReactElement } from "react"

import { useCharacterCreate } from "./hooks/use-character-create.ts"
import { PresentationalCharacterCreate } from "./presentational-character-create.tsx"

export type CharacterCreateProps = {
  readonly open: boolean
  readonly onClose: () => void
}

export function CharacterCreate(props: CharacterCreateProps): ReactElement {
  return (
    <PresentationalCharacterCreate
      {...useCharacterCreate(props.open, props.onClose)}
      onClose={props.onClose}
    />
  )
}
