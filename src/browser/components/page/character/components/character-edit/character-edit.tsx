// キャラクター画面の右側、選んでいるパックの詳しい設定（名乗り・表情・差し色・背景）の入口。

import type { ReactElement } from "react"

import { useCharacterEdit } from "../hooks/use-character-edit.ts"
import { PresentationalCharacterEdit } from "./presentational-character-edit.tsx"

export function CharacterEdit(): ReactElement {
  return <PresentationalCharacterEdit {...useCharacterEdit()} />
}
