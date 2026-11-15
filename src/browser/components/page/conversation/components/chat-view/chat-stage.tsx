// 雑談のときの左の列。つつくと話しかける立ち絵と、席のアイテムを置く。
// 立ち絵の素材（URL）が無いときは立ち絵を出さない。

import type { ReactElement } from "react"

import type { ItemSeatMap } from "../../../../../../shared/item/item.ts"
import { useSession } from "../../../../../stores/session.ts"
import { ItemSeats } from "../character-view/character-view.tsx"
import styles from "./chat-view.module.css"
import { useChatViewModel } from "./hooks/use-chat-view-model.ts"
import { NudgePortrait } from "./nudge-portrait.tsx"

const EMPTY_SEATS: ItemSeatMap = {
  topLeft: undefined,
  belowLeft: undefined,
  belowRight: undefined,
}

export function ChatStage(): ReactElement {
  const { portraitUrl, altText, expression, turnInProgress, onNudge } = useChatViewModel()
  const character = useSession((session) => session.state.character)
  const itemSeats = useSession((session) => session.state.itemSeats)
  const seats = (character === undefined ? undefined : itemSeats[character.pack]) ?? EMPTY_SEATS
  return (
    <div className={styles["chat-stage"]}>
      <div className={styles["chat-stage-layout"]}>
        {portraitUrl !== undefined && (
          <NudgePortrait
            url={portraitUrl}
            altText={altText}
            expression={expression}
            turnInProgress={turnInProgress}
            onNudge={onNudge}
          />
        )}
      </div>
      <ItemSeats seats={seats} portraitShown={portraitUrl !== undefined} />
    </div>
  )
}
