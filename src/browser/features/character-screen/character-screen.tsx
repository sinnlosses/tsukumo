// キャラクター画面（`#character`。`docs/screen-design.md` 13.6 / 6.1）。**会話の画面と入れ替わる**
// （重ねない。出す画面を選ぶのは入口の `<Root>`）。腰を据えて整えるものだけをここに置く:
// **パックの持ち物（立ち絵・差し色・背景）だけ**。
//
// **左に一覧（`<CharacterList>`）、右に選んでいるパックの詳しい設定（`<CharacterEdit>`）の2段組。**
// 選んでいるパックは hash の `pack`（`stores/screen.tsx`）が持ち、使用中以外のパックも右側で
// そのまま直せる（書き込む先はコマンドの `pack`。`docs/design.md` 7.1）。
//
// **会話へ戻る口と答え待ちの印は、全画面の最上部の帯**（`features/screen-nav/`。13.9）に
// あるので、この画面は持たない。
//
// **地・領域・字の色（利用者の設定）は帯の歯車にある**（13.6 の表。色を「利用者が決める部分」と
// 「キャラクターが決める部分」に割ったので、パックの持ち物である差し色だけがここに残る）。

import { type ReactElement } from "react"

import { CharacterEdit } from "./character-edit.tsx"
import { CharacterList } from "./character-list.tsx"
import styles from "./character-screen.module.css"

export function CharacterScreen(): ReactElement {
  return (
    <div className={styles["character-screen-columns"]}>
      <CharacterList />
      <CharacterEdit />
    </div>
  )
}
