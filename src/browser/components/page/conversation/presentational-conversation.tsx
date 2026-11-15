// 会話の画面の器。`<ConversationLayout>` の差し込み口を4領域とサイドバーで埋める。
//
// 雑談モードも仕事と同じ3列で、左の列をキャラビューから雑談の立ち絵（`ChatStage`）に、メインビューを雑談のログ（`ChatView`）に差し替える。
// 立ち絵とログは表情などの state を共有するので、器ごと `ChatViewProvider` で包む。
// 包みは仕事のときも置いたままにして、切り替えで器（入力欄の手元の state）を作り直さない。

import type { ReactElement } from "react"

import { TaskDoingCount } from "../../frame/sidebar/components/task-doing-count.tsx"
import { Sidebar } from "../../frame/sidebar/sidebar.tsx"
import { CharacterView } from "./components/character-view/character-view.tsx"
import { ChatStage, ChatView, ChatViewProvider } from "./components/chat-view/chat-view.tsx"
import { ConversationLayout } from "./components/conversation-layout/conversation-layout.tsx"
import { Dispatch } from "./components/dispatch/dispatch.tsx"
import { LiveAnnouncer } from "./components/live-announcer/live-announcer.tsx"
import { MainView, ReportOutline } from "./components/main-view/main-view.tsx"
import { PendingAskCard } from "./components/pending-ask-card/pending-ask-card.tsx"
import { RequestedTaskBoard } from "./components/requested-task-board/requested-task-board.tsx"

type PresentationalConversationProps = {
  readonly chatMode: boolean
}

export function PresentationalConversation(props: PresentationalConversationProps): ReactElement {
  const layout = (
    <ConversationLayout
      main={props.chatMode ? <ChatView /> : <MainView />}
      sidebar={<Sidebar />}
      character={props.chatMode ? <ChatStage /> : <CharacterView />}
      outline={!props.chatMode && <ReportOutline />}
      dispatch={<Dispatch />}
      inquiry={!props.chatMode && <PendingAskCard />}
      rail={{ badge: !props.chatMode && <TaskDoingCount /> }}
      narrowGround={props.chatMode}
    />
  )
  return (
    <>
      <ChatViewProvider active={props.chatMode}>{layout}</ChatViewProvider>
      <LiveAnnouncer />
      {!props.chatMode && <RequestedTaskBoard />}
    </>
  )
}
