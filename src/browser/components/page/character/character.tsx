// キャラクター画面（`#character`）の入口。会話の画面と入れ替わる（重ねない）。
// 腰を据えて整えるパックの持ち物（立ち絵・差し色・背景）だけをここに置く。

import type { ReactElement } from "react"

import { useCharacter } from "./hooks/use-character.ts"
import { PresentationalCharacter } from "./presentational-character.tsx"

export function Character(): ReactElement {
  return <PresentationalCharacter {...useCharacter()} />
}
