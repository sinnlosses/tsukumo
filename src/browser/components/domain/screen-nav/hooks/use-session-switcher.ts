// 帯の左上の部屋の名前の札と、押すと開く切り替え画面のロジック。
// 札と切り替え画面が同じ開閉の状態（`useSessionSwitcherRequest`）を読む。
//
// 一覧（`SessionState.sessions`）は軽いもの（ID・見出し・時刻）だけで、依頼の数・要約・最後のセリフは選んだ1件ぶんだけ取りに行く（`useSessionDigest`）。

import { FRAME_ERROR_REASON } from "../../../../../shared/frame.ts"
import type { SessionChoice } from "../../../../../shared/session/session-choice.ts"
import { useSessionSwitcherRequest } from "../../../../stores/session-switcher-request.ts"
import { isRefusedFor, useSession, useTurnRunning } from "../../../../stores/session.ts"
import {
  clockTime,
  localTimeZoneId,
  nowEpochMilliseconds,
  zonedDateTime,
} from "../../../../utils/clock.ts"
import { shortSessionIds } from "../domain/session-short-id.ts"
import { useOccupiedSessions } from "./use-occupied-sessions.ts"

/** 一覧の日の区切り（見本の「今日」「昨日」「それより前」）。 */
export type SessionSwitcherGroup = "today" | "yesterday" | "earlier"

export const SESSION_SWITCHER_GROUP_LABELS = {
  today: "今日",
  yesterday: "昨日",
  earlier: "それより前",
} as const satisfies Record<SessionSwitcherGroup, string>

export type SessionSwitcherRow = {
  readonly sessionId: string
  readonly shortId: string
  /** SDK の見出し。無ければ {@link NO_HEADING_LABEL}。 */
  readonly heading: string
  readonly group: SessionSwitcherGroup
  /** 行の右端の時刻。いま出している行は始まった時刻に「〜」を添え、ほかは最終更新時刻。 */
  readonly timeLabel: string
  /** 右の欄の見出しの横に出す、始まり〜最終更新の範囲（`9/26 20:10 – 23:05`）。 */
  readonly rangeLabel: string
  readonly current: boolean
  readonly worktree: string
  readonly inCurrentWorktree: boolean
  /** 別の窓の tsukumo がいま開いているか。いまの行は使用中にしない。 */
  readonly occupiedElsewhere: boolean
}

/** 帯の札に出す、いまのセッションの名乗り。ID が分かる前（新規に起こして最初の依頼を送る前）は短縮IDを出せない。 */
export type ScreenNavSessionIdentity =
  | {
      readonly kind: "known"
      readonly sessionId: string
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
  /** ターン進行中は切り替えも新しいセッションも送らない（起こし直しなので）。 */
  readonly blocked: boolean
  /** `blocked` のときだけ理由を持つ。 */
  readonly blockedTitle: string | undefined
  readonly onSwitch: (sessionId: string) => void
  readonly onStartNew: () => void
}

export type SessionSwitcherView = {
  readonly tag: ScreenNavSessionTag
  readonly switcher: ScreenNavSessionSwitcher
}

/** 見出しが無い（SDK の `summary` が空・読めない）行に代わりに出す字。 */
const NO_HEADING_LABEL = "（題なし）"

export function useSessionSwitcher(room: string, project: string): SessionSwitcherView {
  const dispatch = useSession((session) => session.dispatch)
  const dispatchAwaited = useSession((session) => session.dispatchAwaited)
  const sessions = useSession((session) => session.state.sessions)
  const currentSessionId = useSession((session) =>
    session.state.session.kind === "starting" ? undefined : session.state.session.sessionId,
  )
  const turnInProgress = useTurnRunning()
  const open = useSessionSwitcherRequest((state) => state.open)
  const openSwitcher = useSessionSwitcherRequest((state) => state.openSwitcher)
  const openedAt = useSessionSwitcherRequest((state) => state.openedAt)
  const onOpen = (): void => {
    openSwitcher(nowEpochMilliseconds())
  }
  const onClose = useSessionSwitcherRequest((state) => state.closeSwitcher)
  const occupied = useOccupiedSessions(open)

  const shortIds = shortSessionIds([
    ...(currentSessionId === undefined ? [] : [currentSessionId]),
    ...sessions.map((session) => session.sessionId),
  ])
  const timeZone = localTimeZoneId()
  const today = zonedDateTime(openedAt, timeZone).toPlainDate()
  const rows = sessions.map((session) => {
    const current = session.sessionId === currentSessionId
    return switcherRow(session, shortIds, today, timeZone, {
      current,
      occupiedElsewhere: !current && occupied.has(session.sessionId),
    })
  })
  const currentChoice = sessions.find((session) => session.sessionId === currentSessionId)

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
      blocked: turnInProgress,
      blockedTitle: turnInProgress ? FRAME_ERROR_REASON.sessionSwitchDuringTurn : undefined,
      onSwitch: (sessionId) => {
        if (
          turnInProgress ||
          rows.some((row) => row.sessionId === sessionId && row.occupiedElsewhere)
        ) {
          return
        }
        onClose()
        // いま出しているものを選び直しても起こし直さない（会話が消えるだけで何も変わらない）。
        if (sessionId === currentSessionId) {
          return
        }
        // 開いたあとで別の窓が開いたセッションは、サーバが起こす直前に断る。
        // 開き直すと使用中を聞き直すので、その行が使用中で出る。ほかの失敗は画面に出さない。
        dispatchAwaited.session.switchSession({ sessionId }).catch((error: unknown) => {
          if (isRefusedFor(error, FRAME_ERROR_REASON.sessionOccupied)) {
            openSwitcher(nowEpochMilliseconds())
          }
        })
      },
      onStartNew: () => {
        if (turnInProgress) {
          return
        }
        onClose()
        dispatch.session.startNewSession()
      },
    },
  }
}

function switcherRow(
  session: SessionChoice,
  shortIds: ReadonlyMap<string, string>,
  today: Temporal.PlainDate,
  timeZone: string,
  { current, occupiedElsewhere }: Pick<SessionSwitcherRow, "current" | "occupiedElsewhere">,
): SessionSwitcherRow {
  const started = zonedDateTime(session.startedAt, timeZone)
  const modified = zonedDateTime(session.lastModified, timeZone)
  const group = groupOf(modified.toPlainDate(), today)
  const sameDay = started.toPlainDate().equals(modified.toPlainDate())
  return {
    sessionId: session.sessionId,
    shortId: shortIds.get(session.sessionId) ?? "",
    heading: session.heading ?? NO_HEADING_LABEL,
    group,
    timeLabel: current
      ? `${clockTime(started)}〜`
      : group === "earlier"
        ? monthDayTime(modified)
        : clockTime(modified),
    rangeLabel: `${monthDayTime(started)} – ${sameDay ? clockTime(modified) : monthDayTime(modified)}`,
    current,
    worktree: session.worktree,
    inCurrentWorktree: session.inCurrentWorktree,
    occupiedElsewhere,
  }
}

function groupOf(date: Temporal.PlainDate, today: Temporal.PlainDate): SessionSwitcherGroup {
  if (date.equals(today)) {
    return "today"
  }
  return date.equals(today.subtract({ days: 1 })) ? "yesterday" : "earlier"
}

/** `M/D HH:MM`（年は出さない。一覧に並ぶのは直近の作業だけ）。 */
function monthDayTime(at: Temporal.ZonedDateTime): string {
  return `${String(at.month)}/${String(at.day)} ${clockTime(at)}`
}
