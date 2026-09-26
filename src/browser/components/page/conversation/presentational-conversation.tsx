// 会話の画面の器（docs/design.md 2章「ページの形」）。フックも算出も持たず、`<ConversationLayout>`
// の差し込み口を4領域とサイドバーで埋める（`<ConversationLayout>` は差し込み口を props で
// 受けるだけで、画面を知らない）。
//
// **雑談モードではメインビューを雑談ビューに差し替え、キャラビューを畳む**
// （立ち絵が上段へ移るため。docs/chat-mode.md 4.9 / docs/screen-design.md 13.7）。
// **同時にメインの領域を地そのものにする**（枠と角丸が外れ、背景がそこへ移る。13.8）。
// `<ConversationLayout>` に2つの旗を別々に渡すのは、畳むことと枠を外すことが別の話で、片方だけが
// 要る形もありうるため。

import { type ReactElement } from "react"

import { Sidebar } from "../../domain/sidebar/sidebar.tsx"
import { CharacterView } from "./components/character-view/character-view.tsx"
import { ChatView } from "./components/chat-view/chat-view.tsx"
import { ConversationLayout } from "./components/conversation-layout/conversation-layout.tsx"
import { Dispatch } from "./components/dispatch/dispatch.tsx"
import { MainView } from "./components/main-view/main-view.tsx"

export type PresentationalConversationProps = {
  readonly chatMode: boolean
}

export function PresentationalConversation(props: PresentationalConversationProps): ReactElement {
  return (
    <ConversationLayout
      main={props.chatMode ? <ChatView /> : <MainView />}
      sidebar={<Sidebar />}
      character={<CharacterView />}
      dispatch={<Dispatch />}
      collapseCharacter={props.chatMode}
      mainAsGround={props.chatMode}
    />
  )
}
