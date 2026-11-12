// 迎える姿勢の右の先頭に出す、キャラクターの名前と迎えの一言。
// 一言は吹き出しに出している迎えの挨拶と同じ。書いている途中は「…」、まだ無ければ名前だけを出す。

import { useState, type ReactElement } from "react"

import { useSession } from "../../../../../stores/session.ts"
import { nowEpochMilliseconds } from "../../../../../utils/clock.ts"
import { welcomeHeadOf } from "../../domain/welcome-entry-list.ts"
import { useShownReaction } from "../../stores/shown-reaction.ts"
import { useWelcomeCards } from "../hooks/use-welcome-card-list.ts"
import styles from "./greeting.module.css"

const WRITING = "…"

export function Greeting(): ReactElement {
  const name = useSession((session) => session.state.character?.name ?? "")
  const { cards } = useWelcomeCards()
  // 時刻は待ちの一言を出すかにだけ効き、迎える局面の一言には効かないので、開いた時点のまま使う。
  const [openedAt] = useState(() => nowEpochMilliseconds())
  const reaction = useShownReaction(welcomeHeadOf(cards), openedAt)
  const voice =
    reaction.kind === "shown" ? reaction.line.text : reaction.kind === "writing" ? WRITING : ""

  return (
    <header className={styles["greeting"]} data-region="greeting">
      {name !== "" && <p className={styles["who"]}>{name}</p>}
      {voice !== "" && <h1 className={styles["voice"]}>{voice}</h1>}
    </header>
  )
}
