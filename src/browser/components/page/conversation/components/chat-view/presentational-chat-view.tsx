// 雑談ビューの器。メインビューの中で、左に立ち絵と席の舞台、右に会話のログを並べる。
//
// 立ち絵の素材（URL）が無いときは舞台ごと出さず、ログだけで成立させる。
//
// 狭い画面（760px 以下）では舞台を出さず、ログの下に顔だけの行を出す（どちらを出すかは CSS の `@media`）。

import type { ReactElement } from "react"

import type { ItemSeatMap } from "../../../../../../shared/item/item.ts"
import { CharacterFace } from "../../../../frame/character-face.tsx"
import { HStack } from "../../../../ui/h-stack/h-stack.tsx"
import { ItemSeats } from "../character-view/character-view.tsx"
import { ChatLog } from "./chat-log.tsx"
import styles from "./chat-view.module.css"
import type { ChatViewModel } from "./hooks/use-chat-view.ts"
import { NudgePortrait } from "./nudge-portrait.tsx"

export type PresentationalChatViewProps = ChatViewModel & {
  /** 舞台に置く席のアイテム。 */
  readonly seats: ItemSeatMap
}

/**
 * props はここだけ分解して受ける。
 * ref を持つ入れ物を `props.logRef` の形で描画中に読むと、lint の `react(refs)` が落ちるため。
 */
export function PresentationalChatView({
  portraitUrl,
  altText,
  expression,
  turnInProgress,
  onNudge,
  seats,
  logRef,
  rows,
  showTyping,
  showEmptyMessage,
  face,
}: PresentationalChatViewProps): ReactElement {
  return (
    <div className={styles["chat-view"]}>
      <HStack
        element="div"
        name={{ kind: "none" }}
        gap="lg"
        align="end"
        justify="start"
        wrap="nowrap"
        className={styles["chat-region"]}
      >
        {portraitUrl !== undefined && (
          <div className={styles["chat-stage"]}>
            <div className={styles["chat-stage-layout"]}>
              <NudgePortrait
                url={portraitUrl}
                altText={altText}
                expression={expression}
                turnInProgress={turnInProgress}
                onNudge={onNudge}
              />
            </div>
            <ItemSeats seats={seats} portraitShown />
          </div>
        )}
        <ChatLog
          logRef={logRef}
          rows={rows}
          showTyping={showTyping}
          showEmptyMessage={showEmptyMessage}
        />
      </HStack>
      <div className={styles["chat-face-row"]}>
        <CharacterFace url={face.url} alt={face.alt} className={styles["chat-face"]} />
      </div>
    </div>
  )
}
