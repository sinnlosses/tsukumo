// 会話の画面（hash が空のときの既定の画面）の入口。いま雑談モードかと、メインビューの中身の種類をストアから読んで器に渡す。

import type { ReactElement } from "react"

import { conversationMoment } from "../../../../shared/session/conversation-moment.ts"
import { usePhoneWidth } from "../../../hooks/use-phone-width.ts"
import { useSession } from "../../../stores/session.ts"
import type { StagePosture } from "./components/stage/stage.tsx"
import {
  PresentationalConversation,
  type ConversationShell,
} from "./presentational-conversation.tsx"
import { useMainViewContent, type MainViewContent } from "./stores/main-view-content.ts"

export function Conversation(props: { readonly shell: ConversationShell }): ReactElement {
  const chatMode = useSession((session) => session.state.chatMode)
  const contentKind = useMainViewContent((state) => state.content.kind)
  const waitingForAnswer = useSession((session) => conversationMoment(session.state) === "ask")
  const phone = usePhoneWidth()
  const posture = chatMode ? "deliver" : postureOf(contentKind)
  return (
    <PresentationalConversation
      chatMode={chatMode}
      shell={props.shell}
      posture={posture}
      asking={posture === "work" && waitingForAnswer && !phone}
    />
  )
}

function postureOf(kind: MainViewContent["kind"]): StagePosture {
  switch (kind) {
    case "welcome":
      return "greet"
    case "work":
      return "work"
    case "report":
      return "deliver"
  }
}
