// 帯の左上の部屋の名前のラベルと、押すと開く切り替え画面のロジック。
// 札と切り替え画面が同じ開閉の状態（`useSessionSwitcherRequest`）を読む。
//
// 一覧（`SessionState.sessions`）は軽いもの（ID・見出し・時刻）だけで、依頼の数・要約・最後のセリフは選んだ1件ぶんだけ取りに行く（`useSessionDigest`）。

import type { SessionId } from "../../../../../shared/session/session-id.ts"
import {
  monthDayTime,
  type SessionSwitcherRow,
} from "../../../../features/session-switcher/session-switcher-row.ts"
import { useSessionRows } from "../../../../features/session-switcher/use-session-row-list.ts"
import { useSessionSwitch } from "../../../../features/session-switcher/use-session-switch.ts"
import { useSessionSwitcherRequest } from "../../../../stores/session-switcher-request.ts"
import { useSession } from "../../../../stores/session.ts"
import { nowEpochMilliseconds, zonedDateTime } from "../../../../utils/clock.ts"

/** 帯の札に出す、いまのセッションの識別情報。ID が分かる前（新規に起こして最初の依頼を送る前）は短縮IDを出せない。 */
export type ScreenNavSessionIdentity =
  | {
      readonly kind: "known"
      readonly sessionId: SessionId
      readonly shortId: string
      /** 一覧に載っていれば始まった時刻（`9/27 09:12〜`）。載っていなければ空。 */
      readonly startedLabel: string
    }
  | { readonly kind: "unknown" }

/** 札の主の字。プロジェクト名が分かるまで（取れなかったときも）は部屋の名前が主になる。 */
export type ScreenNavSessionTitle =
  | { readonly kind: "project"; readonly project: string; readonly room: string }
  | { readonly kind: "room-only"; readonly room: string }

export type ScreenNavSessionTag = {
  readonly title: ScreenNavSessionTitle
  readonly identity: ScreenNavSessionIdentity
  readonly open: boolean
  readonly onOpen: () => void
}

export type ScreenNavSessionSwitcher = {
  readonly open: boolean
  readonly onClose: () => void
  readonly rows: readonly SessionSwitcherRow[]
  /** `restartRefused` の間は切り替えも新しいセッションも送らない（起こし直しなので）。 */
  readonly blocked: boolean
  /** `blocked` のときだけ理由を持つ。 */
  readonly blockedTitle?: string
  readonly onSwitch: (sessionId: SessionId) => void
  readonly onStartNew: () => void
}

type SessionSwitcherView = {
  readonly tag: ScreenNavSessionTag
  readonly switcher: ScreenNavSessionSwitcher
}

export function useSessionSwitcher(room: string, project: string): SessionSwitcherView {
  const dispatch = useSession((session) => session.dispatch)
  const open = useSessionSwitcherRequest((state) => state.open)
  const openSwitcher = useSessionSwitcherRequest((state) => state.openSwitcher)
  const openedAt = useSessionSwitcherRequest((state) => state.openedAt)
  const onOpen = (): void => {
    openSwitcher(nowEpochMilliseconds())
  }
  const onClose = useSessionSwitcherRequest((state) => state.closeSwitcher)
  const { rows, shortIds, currentSessionId, currentChoice, timeZone } = useSessionRows(
    open,
    openedAt,
  )
  const switching = useSessionSwitch(rows)

  return {
    tag: {
      title: project === "" ? { kind: "room-only", room } : { kind: "project", project, room },
      identity:
        currentSessionId === undefined
          ? { kind: "unknown" }
          : {
              kind: "known",
              sessionId: currentSessionId,
              shortId: shortIds.get(currentSessionId) ?? "",
              startedLabel:
                currentChoice === undefined
                  ? ""
                  : `${monthDayTime(zonedDateTime(currentChoice.startedAt, timeZone))}〜`,
            },
      open,
      onOpen,
    },
    switcher: {
      open,
      onClose,
      rows,
      blocked: switching.blocked,
      blockedTitle: switching.blockedTitle,
      onSwitch: (sessionId) => {
        switching.switchSession(sessionId, onClose)
      },
      onStartNew: () => {
        if (switching.blocked) {
          return
        }
        onClose()
        void dispatch.session.startNewSession()
      },
    },
  }
}
