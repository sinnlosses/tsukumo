// 会話の画面（hash が空のときの既定の画面）の入口。いま雑談モードかと、メインビューの中身の種類をストアから読んで器に渡す。

import type { ReactElement } from "react"

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
  return (
    <PresentationalConversation
      chatMode={chatMode}
      shell={props.shell}
      posture={chatMode ? "deliver" : postureOf(contentKind)}
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
