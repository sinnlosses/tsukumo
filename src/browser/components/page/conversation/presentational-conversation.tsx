// 会話の画面の器「舞台と紙」。舞台に立ち絵、紙にメインビュー、欄外に受け取ったもの（雑談では覚えていることと最近の話題）、紙の下端に入力欄を差す。
//
// 雑談モードではメインビューを雑談ビューに差し替える。

import type { ReactElement, ReactNode } from "react"

import { CharacterView } from "./components/character-view/character-view.tsx"
import { ChatMemory } from "./components/chat-memory/chat-memory.tsx"
import { ChatView } from "./components/chat-view/chat-view.tsx"
import { Dispatch } from "./components/dispatch/dispatch.tsx"
import { Greeting } from "./components/greeting/greeting.tsx"
import { InquiryCard } from "./components/inquiry/inquiry.tsx"
import { LiveAnnouncer } from "./components/live-announcer/live-announcer.tsx"
import {
  MainView,
  PhoneActivity,
  StageActivity,
  WorkPlanDockLamps,
} from "./components/main-view/main-view.tsx"
import { PaperDesk } from "./components/paper-desk/paper-desk.tsx"
import { RequestedTaskBoard } from "./components/requested-task-board/requested-task-board.tsx"
import { Stage, type StagePosture } from "./components/stage/stage.tsx"

/**
 * 器に差し込む、ほかの画面の部品の中身。
 * 欄外に置くやり取りの並びと、舞台の左上に置く部屋の頭、舞台の器の右上に置く入口の群は、画面の登録表から受け取る。
 */
export type ConversationShell = {
  readonly margin: ReactNode
  readonly head: ReactNode
  readonly tools: ReactNode
  readonly today: ReactNode
  /** 狭い幅の1行の頭。題（`subject`）は会話の画面が決めて渡す。 */
  readonly narrowHead: (subject: NarrowHeadSubject) => ReactNode
}

/** 狭い幅の頭の題。迎えると雑談では部屋の頭の主の字、ほかでは最新のやり取りの題。 */
export type NarrowHeadSubject =
  | { readonly kind: "room" }
  | { readonly kind: "turn"; readonly title: string }

const MARGIN_TITLE = "この部屋のやり取り"
const CHAT_MARGIN_TITLE = "雑談の覚え書き"

type PresentationalConversationProps = {
  readonly chatMode: boolean
  readonly shell: ConversationShell
  readonly posture: StagePosture
  readonly narrowHeadSubject: NarrowHeadSubject
  /** 入力欄の場所にお伺いを出すか（答え待ちのあいだ。姿勢・幅によらない）。 */
  readonly asking: boolean
  /** ほかの画面の紙が重なっているか。 */
  readonly covered: boolean
  /** 紙の左に見えている会話の紙の端（覆い）を押したとき。 */
  readonly onUncover: () => void
}

export function PresentationalConversation(props: PresentationalConversationProps): ReactElement {
  return (
    <>
      <Stage
        posture={props.posture}
        chatMode={props.chatMode}
        covered={props.covered}
        onUncover={props.onUncover}
        tools={props.shell.tools}
        narrowHead={props.shell.narrowHead(props.narrowHeadSubject)}
        figure={
          <CharacterView
            hands={<PhoneActivity />}
            stageHands={<StageActivity />}
            roomHead={props.shell.head}
            today={props.shell.today}
          />
        }
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
            margin={
              props.chatMode
                ? {
                    title: CHAT_MARGIN_TITLE,
                    titleShown: false,
                    body: <ChatMemory />,
                  }
                : { title: MARGIN_TITLE, titleShown: true, body: props.shell.margin }
            }
            dock={
              <Dispatch
                progress={{
                  kind: "paper",
                  lamps: !props.chatMode && <WorkPlanDockLamps />,
                }}
              />
            }
            inquiry={props.asking ? <InquiryCard actions="inline" placement="dock" /> : undefined}
          />
        }
      />
      <LiveAnnouncer />
      {!props.chatMode && <RequestedTaskBoard />}
    </>
  )
}
