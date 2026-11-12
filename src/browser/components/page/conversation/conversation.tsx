// 会話の画面（hash が空のときの既定の画面）の入口。いま雑談モードかをストアから読んで器に渡す。

import type { ReactElement } from "react"

import { useSession } from "../../../stores/session.ts"
import {
  PresentationalConversation,
  type ConversationShell,
} from "./presentational-conversation.tsx"

export function Conversation(props: { readonly shell: ConversationShell }): ReactElement {
  return (
    <PresentationalConversation
      chatMode={useSession((session) => session.state.chatMode)}
      shell={props.shell}
    />
  )
}
