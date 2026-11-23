// 会話の画面の器。`<ConversationLayout>` の差し込み口を4領域とサイドバーで埋める。
//
// 雑談モードは左の列を畳んだ2列で、メインビューを雑談の立ち絵とログ（`ChatView`）に差し替える。
// 雑談の state は `ChatViewProvider` が持ち、器ごと包む。
// 包みは仕事のときも置いたままにして、切り替えで器（入力欄の手元の state）を作り直さない。

import type { ReactElement } from "react"

import { ArchitectureMapExpanded } from "../../../features/architecture-map/architecture-map-expanded.tsx"
import { MapBoxMark } from "../../../features/architecture-map/map-box-mark.tsx"
import { MapMarkProvider } from "../../../features/report/map-mark-slot.tsx"
import { TaskDoingCount } from "../../frame/sidebar/components/task-doing-count.tsx"
import { Sidebar } from "../../frame/sidebar/sidebar.tsx"
import "./stores/map-pointing.ts"
import { CharacterView } from "./components/character-view/character-view.tsx"
import { ChatView, ChatViewProvider } from "./components/chat-view/chat-view.tsx"
import { ConversationLayout } from "./components/conversation-layout/conversation-layout.tsx"
import { Dispatch } from "./components/dispatch/dispatch.tsx"
import { LiveAnnouncer } from "./components/live-announcer/live-announcer.tsx"
import { MainView, ReportOutline, VoiceBand } from "./components/main-view/main-view.tsx"
import { PendingAskCard } from "./components/pending-ask-card/pending-ask-card.tsx"
import {
  RequestedTaskBoard,
  RequestedTaskSheet,
} from "./components/requested-task-board/requested-task-board.tsx"

type PresentationalConversationProps = {
  readonly chatMode: boolean
}

export function PresentationalConversation(props: PresentationalConversationProps): ReactElement {
  const layout = (
    <ConversationLayout
      main={props.chatMode ? <ChatView /> : <MainView />}
      sidebar={<Sidebar />}
      character={!props.chatMode && <CharacterView />}
      outline={!props.chatMode && <ReportOutline />}
      dispatch={<Dispatch />}
      inquiry={!props.chatMode && <PendingAskCard />}
      voice={!props.chatMode && <VoiceBand />}
      sheet={<RequestedTaskSheet listModeAvailable={!props.chatMode} />}
      map={!props.chatMode && <ArchitectureMapExpanded />}
      rail={{ badge: !props.chatMode && <TaskDoingCount /> }}
      narrowGround={props.chatMode}
      collapseCharacter={props.chatMode}
    />
  )
  return (
    <MapMarkProvider value={renderMapMark}>
      <ChatViewProvider active={props.chatMode}>{layout}</ChatViewProvider>
      <LiveAnnouncer />
      {!props.chatMode && <RequestedTaskBoard />}
    </MapMarkProvider>
  )
}

function renderMapMark(id: string, source: string): ReactElement {
  return <MapBoxMark id={id} source={source} />
}
