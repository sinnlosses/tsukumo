// 雑談ビューの器。左に立ち絵、右に会話のログを置く。
//
// 立ち絵の素材（URL）が無いときは立ち絵を出さず、ログだけで成立させる。
//
// 狭い画面（760px 以下）では立ち絵の代わりに、ログの下に顔だけの行を出す（どちらを出すかは CSS の `@media`）。

import type { ReactElement } from "react"

import { CharacterFace } from "../../../../domain/character-face.tsx"
import { HStack } from "../../../../ui/h-stack/h-stack.tsx"
import styles from "./chat-view.module.css"
import { ChatLog } from "./components/chat-log/chat-log.tsx"
import { NudgePortrait } from "./components/nudge-portrait/nudge-portrait.tsx"
import type { ChatViewModel } from "./hooks/use-chat-view.ts"

export type PresentationalChatViewProps = ChatViewModel

/**
 * props はここだけ分解して受ける。
 * ref を持つ入れ物を `props.logRef` の形で描画中に読むと、lint の `react(refs)` が落ちるため。
 */
export function PresentationalChatView({
  portraitUrl,
  accent,
  altText,
  expression,
  outfit,
  turnInProgress,
  onNudge,
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
        ref={undefined}
        gap="lg"
        align="end"
        justify="start"
        wrap="nowrap"
        className={styles["chat-region"]}
      >
        {portraitUrl !== undefined && (
          <NudgePortrait
            url={portraitUrl}
            accent={accent}
            altText={altText}
            expression={expression}
            outfit={outfit}
            turnInProgress={turnInProgress}
            onNudge={onNudge}
          />
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
