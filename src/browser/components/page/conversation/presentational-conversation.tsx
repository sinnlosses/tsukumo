// 会話の画面の器。`<ConversationLayout>` の差し込み口を4領域とサイドバーで埋める。
//
// 雑談モードではメインビューを雑談ビューに差し替え、キャラビューを畳む（立ち絵が上段へ移るため）。
// 同時にメインの領域を地そのものにする（枠と角丸が外れ、背景がそこへ移る）。
// `<ConversationLayout>` に2つの旗を別々に渡すのは、畳むことと枠を外すことが別の話で、片方だけが要る形もありうるため。

import type { ReactElement } from "react"

import { RunSettingGroup } from "../../domain/sidebar/components/run-setting-group.tsx"
import { TaskDoingCount } from "../../domain/sidebar/components/task-doing-count.tsx"
import { Sidebar } from "../../domain/sidebar/sidebar.tsx"
import { CharacterView } from "./components/character-view/character-view.tsx"
import { ChatView } from "./components/chat-view/chat-view.tsx"
import { ConversationLayout } from "./components/conversation-layout/conversation-layout.tsx"
import { Dispatch } from "./components/dispatch/dispatch.tsx"
import { LiveAnnouncer } from "./components/live-announcer/live-announcer.tsx"
import { MainView } from "./components/main-view/main-view.tsx"
import { RequestedTaskBoard } from "./components/requested-task-board/requested-task-board.tsx"

export type PresentationalConversationProps = {
  readonly chatMode: boolean
}

export function PresentationalConversation(props: PresentationalConversationProps): ReactElement {
  return (
    <>
      <ConversationLayout
        main={props.chatMode ? <ChatView /> : <MainView />}
        sidebar={<Sidebar />}
        character={<CharacterView />}
        dispatch={<Dispatch />}
        railBadge={!props.chatMode && <TaskDoingCount />}
        railTools={<RunSettingGroup placement="rail" />}
        collapseCharacter={props.chatMode}
        mainAsGround={props.chatMode}
      />
      <LiveAnnouncer />
      {!props.chatMode && <RequestedTaskBoard />}
    </>
  )
}
