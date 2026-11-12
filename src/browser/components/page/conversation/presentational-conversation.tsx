// 会話の画面の器。旧い器では `<ConversationLayout>` の差し込み口を4領域とサイドバーで埋める。
// 新しい器「舞台と紙」では、舞台に立ち絵、紙にメインビュー、欄外に受け取ったもの、紙の下端に入力欄を差す。
//
// 雑談モードではメインビューを雑談ビューに差し替え、キャラビューを畳む（立ち絵が上段へ移るため）。
// 同時にメインの領域を地そのものにする（枠と角丸が外れ、背景がそこへ移る）。
// `<ConversationLayout>` に2つの旗を別々に渡すのは、畳むことと枠を外すことが別の話で、片方だけが要る形もありうるため。

import type { ReactElement, ReactNode } from "react"

import { RunSettingGroup } from "../../../features/run-setting/run-setting-group.tsx"
import { TaskDoingCount } from "../../frame/sidebar/components/task-doing-count.tsx"
import { Sidebar } from "../../frame/sidebar/sidebar.tsx"
import { CharacterView } from "./components/character-view/character-view.tsx"
import { ChatView } from "./components/chat-view/chat-view.tsx"
import { ConversationLayout } from "./components/conversation-layout/conversation-layout.tsx"
import { Dispatch } from "./components/dispatch/dispatch.tsx"
import { Greeting } from "./components/greeting/greeting.tsx"
import { InquiryCard } from "./components/inquiry/inquiry.tsx"
import { LiveAnnouncer } from "./components/live-announcer/live-announcer.tsx"
import { MainView, PhoneActivity } from "./components/main-view/main-view.tsx"
import { PaperDesk } from "./components/paper-desk/paper-desk.tsx"
import { PendingAskCard } from "./components/pending-ask-card/pending-ask-card.tsx"
import { RequestedTaskBoard } from "./components/requested-task-board/requested-task-board.tsx"
import { Stage, type StagePosture } from "./components/stage/stage.tsx"

/**
 * 描く器。
 * 新しい器の欄外に置くやり取りの並びは、ほかの画面の部品の中身なので、画面の登録表から受け取る。
 */
export type ConversationShell =
  | { readonly kind: "classic" }
  | { readonly kind: "stage"; readonly margin: ReactNode }

const MARGIN_TITLE = "この部屋のやり取り"

type PresentationalConversationProps = {
  readonly chatMode: boolean
  readonly shell: ConversationShell
  /** 新しい器の姿勢。旧い器は読まない。 */
  readonly posture: StagePosture
  /** 新しい器で、入力欄の場所にお伺いを出すか（働くあいだの答え待ち）。旧い器は読まない。 */
  readonly asking: boolean
}

export function PresentationalConversation(props: PresentationalConversationProps): ReactElement {
  return (
    <>
      {props.shell.kind === "classic" ? (
        <ConversationLayout
          main={props.chatMode ? <ChatView /> : <MainView outline="column" inquiry="inline" />}
          sidebar={<Sidebar />}
          character={<CharacterView />}
          dispatch={<Dispatch />}
          inquiry={!props.chatMode && <PendingAskCard />}
          rail={{
            badge: !props.chatMode && <TaskDoingCount />,
            tools: <RunSettingGroup placement="rail" />,
          }}
          collapseCharacter={props.chatMode}
          mainAsGround={props.chatMode}
        />
      ) : (
        <Stage
          posture={props.posture}
          figure={<CharacterView hands={<PhoneActivity />} />}
          desk={
            <PaperDesk
              posture={props.posture}
              greeting={<Greeting />}
              paper={
                props.chatMode ? (
                  <ChatView />
                ) : (
                  <MainView outline="none" inquiry={props.asking ? "none" : "inline"} />
                )
              }
              margin={{ title: MARGIN_TITLE, body: props.shell.margin }}
              dock={<Dispatch />}
              inquiry={props.asking ? <InquiryCard actions="inline" placement="dock" /> : undefined}
            />
          }
        />
      )}
      <LiveAnnouncer />
      {!props.chatMode && <RequestedTaskBoard />}
    </>
  )
}
