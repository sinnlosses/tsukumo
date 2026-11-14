// 会話の画面（hash が空のときの既定の画面）の入口。いま雑談モードかと、メインビューの中身の種類をストアから読んで器に渡す。
// ほかの画面を開いても会話の画面は隠れないので、紙が重なっているか（hash の画面）も読む。

import type { ReactElement } from "react"

import { conversationMoment } from "../../../../shared/session/conversation-moment.ts"
import { navigateTo, useScreen } from "../../../stores/screen.tsx"
import { useSession } from "../../../stores/session.ts"
import { turnTitle } from "./components/main-view/main-view.tsx"
import type { StagePosture } from "./components/stage/stage.tsx"
import {
  PresentationalConversation,
  type ConversationShell,
  type NarrowHeadSubject,
} from "./presentational-conversation.tsx"
import { useMainViewContent, type MainViewContent } from "./stores/main-view-content.ts"
import { useMainViewTurns } from "./stores/main-view-turn.ts"

const ROOM_SUBJECT = { kind: "room" } satisfies NarrowHeadSubject

export function Conversation(props: { readonly shell: ConversationShell }): ReactElement {
  const chatMode = useSession((session) => session.state.chatMode)
  const contentKind = useMainViewContent((state) => state.content.kind)
  const waitingForAnswer = useSession((session) => conversationMoment(session.state) === "ask")
  const latestTurn = useMainViewTurns().at(-1)
  const covered = useScreen() !== "conversation"
  const posture = chatMode ? "deliver" : postureOf(contentKind)
  const narrowHeadSubject: NarrowHeadSubject =
    chatMode || posture === "greet" || latestTurn === undefined
      ? ROOM_SUBJECT
      : { kind: "turn", title: turnTitle(latestTurn) }
  return (
    <PresentationalConversation
      chatMode={chatMode}
      shell={props.shell}
      posture={posture}
      narrowHeadSubject={narrowHeadSubject}
      asking={waitingForAnswer}
      covered={covered}
      onUncover={() => {
        navigateTo("conversation")
      }}
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
