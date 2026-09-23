// キャラクター画面（`#character`。`docs/screen-design.md` 13.6 / 6.1）。**会話の画面と入れ替わる**
// （重ねない。出す画面を選ぶのは入口の `<Root>`）。腰を据えて整えるものだけをここに置く:
// **パックの持ち物（立ち絵・差し色・背景。`<CharacterEdit>`）だけ**。
//
// **会話へ戻る口と答え待ちの印は、全画面の最上部の帯**（`features/screen-nav/`。13.9）に
// あるので、この画面は持たない。
//
// **地・領域・字の色（利用者の設定）は帯の歯車にある**（13.6 の表。色を「利用者が決める部分」と
// 「キャラクターが決める部分」に割ったので、パックの持ち物である差し色だけがここに残る）。
// 保存の仕方は変えていない（`browser/domain/appearance-color.ts`）。

import { type ReactElement } from "react"

import { useScreenHref } from "../../stores/screen.tsx"
import { useSessionSelector } from "../../stores/session.tsx"
import { CharacterEdit } from "./character-edit.tsx"
import styles from "./character-screen.module.css"

export function CharacterScreen(): ReactElement {
  const screenHref = useScreenHref()
  const character = useSessionSelector((session) => session.state.character)

  return (
    <div className={styles["character-screen"]}>
      <div className={styles["character-screen-headline"]}>
        {character === undefined ? null : (
          <>
            <h1 className={styles["character-screen-label"]}>
              {character.name ?? character.pack ?? ""}
            </h1>
            <span className={styles["character-screen-pack"]}>{character.pack}</span>
          </>
        )}
        <a className={styles["character-screen-new"]} href={screenHref("character-create")}>
          新しく作る
        </a>
      </div>
      <CharacterEdit />
    </div>
  )
}
