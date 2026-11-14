// キャラビュー本体の入口。

import type { ReactElement } from "react"

import { useCharacterView } from "./hooks/use-character-view.ts"
import { PresentationalCharacterView } from "./presentational-character-view.tsx"

export function CharacterView(): ReactElement {
  return <PresentationalCharacterView {...useCharacterView()} />
}
