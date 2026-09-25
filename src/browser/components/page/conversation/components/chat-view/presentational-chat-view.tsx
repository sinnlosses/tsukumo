// 雑談ビューの**器だけ**（<PresentationalChatView>。docs/screen-design.md 13.7）。左に立ち絵、右に会話の
// ログを置く。フックも算出も持たず、`hooks/use-chat-view.ts` が組み立てた値をそのまま部品へ
// 渡す（docs/design.md 2章「機能の中を分ける」）。
//
// **立ち絵の素材（URL）が無いときは立ち絵を出さず、ログだけで成立させる**。

import { type ReactElement } from "react"

import { HStack } from "../../../../../components/ui/h-stack/h-stack.tsx"
import styles from "./chat-view.module.css"
import { ChatLog } from "./components/chat-log.tsx"
import { NudgePortrait } from "./components/nudge-portrait.tsx"
import { type ChatViewModel } from "./hooks/use-chat-view.ts"

export type PresentationalChatViewProps = ChatViewModel

/**
 * **props はここだけ分解して受ける**。ref を持つ入れ物を `props.logRef` の形で描画中に読むと
 * `react(refs)`（規約「レンダー中に ref を読み書きしない」）が落ちるため
 * （`layout/presentational-layout.tsx` と同じ理由）。
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
}: PresentationalChatViewProps): ReactElement {
  return (
    <HStack
      element="div"
      name={{ kind: "none" }}
      ref={undefined}
      gap="lg"
      align="end"
      justify="start"
      wrap="nowrap"
      className={styles["chat-region"] ?? ""}
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
  )
}
