// 新しい器「舞台と紙」の部屋の頭のロジック。
// 部屋の名前（押すとセッションの一覧）・仕事と雑談の切り替え・状態・「文脈 n%」・ほかの画面の入口・探すを、見た目が受け取れる形まで畳んで返す。
//
// 札は `<a href>` で、紙の開閉の正典は `location.hash` のまま。
// 仕事と雑談の切り替えの表示はサーバから届いた値だけに従い、押した側へ先に倒さない。

import { FRAME_ERROR_REASON } from "../../../../../shared/frame-error-reason.ts"
import { taskReadiness } from "../../../../../shared/repository/task-summary.ts"
import {
  conversationMoment,
  type ConversationMoment,
} from "../../../../../shared/session/conversation-moment.ts"
import { useContextUsage } from "../../../../domain/context-usage.ts"
import { rpc } from "../../../../stores/rpc.ts"
import { useScreen, useScreenHref } from "../../../../stores/screen.tsx"
import { useRestartRefused, useSession } from "../../../../stores/session.ts"
import { useProjectName } from "./use-project-name.ts"
import { currentRoomName } from "./use-screen-nav.ts"
import { useSearchPalette, type SearchPaletteView } from "./use-search-palette.ts"
import { useSessionSwitcher, type ScreenNavSessionSwitcher } from "./use-session-switcher.ts"

/** 状態の点の色の種類。雑談中は局面を問わず `chat`。 */
export type RoomStateTone = ConversationMoment | "chat"

/** 部屋の頭の札1つ。 */
export type RoomHeadGate = {
  readonly screen: "tasks" | "achievement" | "character" | "settings"
  readonly label: string
  readonly href: string
  /** その紙を開いているか。 */
  readonly current: boolean
}

export type RoomHeadView = {
  /** 部屋の名前。プロジェクト名が分かるまで（取れなかったときも）は部屋の色の名前。 */
  readonly title: string
  readonly sessionsOpen: boolean
  readonly onOpenSessions: () => void
  readonly switcher: ScreenNavSessionSwitcher
  readonly chatMode: boolean
  /** `restartRefused` の間は切り替えを送らない。理由は `modeBlockedTitle`。 */
  readonly modeBlockedTitle?: string
  readonly onChangeMode: (chat: boolean) => void
  readonly state: { readonly tone: RoomStateTone; readonly label: string }
  readonly context: RoomHeadContext
  readonly gates: readonly RoomHeadGate[]
  readonly search: SearchPaletteView
}

/** 「文脈 n%」の札。押すと使用量の紙を開く。 */
export type RoomHeadContext = {
  readonly label: string
  /** 目盛りを塗る幅（%）。 */
  readonly fill: number
  readonly href: string
  readonly current: boolean
  readonly busy: boolean
}

const STATE_LABELS = {
  greet: "依頼を待っている",
  work: "作業中",
  ask: "答えを待っている",
  deliver: "終わった",
  stumble: "止まった",
  chat: "雑談している",
} satisfies Record<RoomStateTone, string>

const CONTEXT_LABEL = "文脈"
const PLACEHOLDER = "—"

export function useRoomHead(): RoomHeadView {
  const dispatch = useSession((session) => session.dispatch)
  const chatMode = useSession((session) => session.state.chatMode)
  const moment = useSession((session) => conversationMoment(session.state))
  const tasks = useSession((session) => session.state.tasks)
  const finishedTurnCount = useSession((session) => session.state.finishedTurnCount)
  const restartRefused = useRestartRefused()
  const current = useScreen()
  const screenHref = useScreenHref()
  const contextUsage = useContextUsage(rpc.contextUsage.report, finishedTurnCount)
  const room = currentRoomName()
  const project = useProjectName()
  const { tag, switcher } = useSessionSwitcher(room, project)

  const gateOf = (screen: RoomHeadGate["screen"], label: string): RoomHeadGate => ({
    screen,
    label,
    href: screenHref(screen),
    current: current === screen,
  })
  const readyCount =
    tasks.kind === "known"
      ? tasks.items.filter((task) => taskReadiness(task)?.kind === "ready").length
      : undefined
  const tone: RoomStateTone = chatMode ? "chat" : moment
  const onChangeMode = (chat: boolean): void => {
    if (chat !== chatMode && !restartRefused) {
      void dispatch.session.setChatMode({ chat })
    }
  }
  const search = useSearchPalette({ chatMode, onChangeMode, onOpenSessions: tag.onOpen })

  return {
    title: project === "" ? room : project,
    sessionsOpen: tag.open,
    onOpenSessions: tag.onOpen,
    switcher,
    chatMode,
    modeBlockedTitle: restartRefused ? FRAME_ERROR_REASON.chatModeSwitchDuringTurn : undefined,
    onChangeMode,
    state: { tone, label: STATE_LABELS[tone] },
    context: {
      label: `${CONTEXT_LABEL} ${contextUsage.kind === "ready" ? `${String(contextUsage.percentage)}%` : PLACEHOLDER}`,
      fill: contextUsage.kind === "ready" ? Math.min(contextUsage.percentage, 100) : 0,
      href: screenHref("token-usage"),
      current: current === "token-usage",
      busy: contextUsage.kind === "pending",
    },
    gates: [
      ...(tasks.kind === "no-beads"
        ? []
        : [gateOf("tasks", readyCount === undefined ? "タスク" : `タスク ${String(readyCount)}`)]),
      gateOf("achievement", "成果"),
      gateOf("character", "キャラ"),
      gateOf("settings", "設定"),
    ],
    search,
  }
}
