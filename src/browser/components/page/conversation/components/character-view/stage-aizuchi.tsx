// 立ち絵の席の右上に出す相づちの札。押すとキャラクターが表情を変えて返す（作業は止まらない）。
// 出す札はいまの局面から決まる（`shownAizuchi`）。置く側が、1枚も無ければこの部品ごと出さない。

import type { ReactElement } from "react"

import styles from "./character-view.module.css"
import type { CharacterViewAizuchi } from "./hooks/use-character-view.ts"

export function StageAizuchi(props: {
  readonly aizuchi: readonly CharacterViewAizuchi[]
}): ReactElement {
  return (
    <div className={styles["stage-aizuchi"]} data-slot="aizuchi">
      {props.aizuchi.map((chip) => (
        <button
          key={`${chip.moment}-${String(chip.index)}`}
          type="button"
          className={styles["stage-aizuchi-chip"]}
          onClick={chip.onPress}
        >
          {chip.label}
        </button>
      ))}
    </div>
  )
}
