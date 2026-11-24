// セッション一覧の行を、セッションの状態から組み立てる。
// 「今日」の基準 `at` は呼ぶ側が渡す（開いた時刻を固定したい画面と、出した時刻を持つ札で違う）。

import type { SessionChoice } from "../../../shared/session/session-choice.ts"
import type { SessionId } from "../../../shared/session/session-id.ts"
import { useSession } from "../../stores/session.ts"
import { localTimeZoneId, zonedDateTime } from "../../utils/clock.ts"
import { shortSessionIds } from "./session-short-id.ts"
import { switcherRow, type SessionSwitcherRow } from "./session-switcher-row.ts"
import { useOccupiedSessions } from "./use-occupied-session-list.ts"

type SessionRows = {
  readonly rows: readonly SessionSwitcherRow[]
  readonly shortIds: ReadonlyMap<string, string>
  readonly currentSessionId?: SessionId
  readonly currentChoice?: SessionChoice
  readonly timeZone: string
}

export function useSessionRows(open: boolean, at: number): SessionRows {
  const sessions = useSession((session) => session.state.sessions)
  const currentSessionId = useSession((session) =>
    session.state.session.kind === "starting" ? undefined : session.state.session.sessionId,
  )
  const occupied = useOccupiedSessions(open)

  const shortIds = shortSessionIds([
    ...(currentSessionId === undefined ? [] : [currentSessionId]),
    ...sessions.map((session) => session.sessionId),
  ])
  const timeZone = localTimeZoneId()
  const today = zonedDateTime(at, timeZone).toPlainDate()
  const rows = sessions.map((session) => {
    const current = session.sessionId === currentSessionId
    return switcherRow(session, shortIds, today, timeZone, {
      current,
      occupiedElsewhere: !current && occupied.has(session.sessionId),
    })
  })
  const currentChoice = sessions.find((session) => session.sessionId === currentSessionId)
  return { rows, shortIds, currentSessionId, currentChoice, timeZone }
}
