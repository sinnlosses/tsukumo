// 左の札のセッション側に並べる行。
// この作業ツリーの今日と昨日のセッションだけを2群で出し、いまのセッションは一覧に無くても「今日」の先頭に「いま」の行で出す。

import type { SessionId } from "../../../../../../../shared/session/session-id.ts"
import {
  NO_HEADING_LABEL,
  type SessionSwitcherRow,
} from "../../../../../../features/session-switcher/session-switcher-row.ts"

type SessionOutlineGroup = "today" | "yesterday"

export type SessionOutlineRow = {
  /** 選びの鍵。ID がまだ無いいまの行は固定の鍵。 */
  readonly key: string
  /** 切り替え先として押せるか（ID が無い・別のウィンドウが使用中は押せない）。 */
  readonly sessionId?: SessionId
  readonly heading: string
  /** 右端の字。いまの行は「いま」。 */
  readonly timeLabel: string
  readonly current: boolean
  readonly occupiedElsewhere: boolean
}

export type SessionOutlineSection = {
  readonly group: SessionOutlineGroup
  readonly rows: readonly SessionOutlineRow[]
}

type SessionOutline = {
  readonly sections: readonly SessionOutlineSection[]
  /** 出す行の数（いまの行を含む）。 */
  readonly count: number
}

type SessionOutlineInput = {
  readonly rows: readonly SessionSwitcherRow[]
  /** ID が分かる前（新規に起こして最初の依頼を送る前）は無い。 */
  readonly currentSessionId?: SessionId
  /** 一覧にいまのセッションが無いときの見出しの元（最初のやり取りの題）。 */
  readonly firstTurnTitle?: string
}

const NOW_LABEL = "いま"
const STARTING_KEY = "starting"

export function sessionOutline(input: SessionOutlineInput): SessionOutline {
  const listed = input.rows.find((row) => row.current)
  const current: SessionOutlineRow = {
    key: input.currentSessionId ?? STARTING_KEY,
    ...(input.currentSessionId === undefined ? {} : { sessionId: input.currentSessionId }),
    heading: listed?.heading ?? input.firstTurnTitle ?? NO_HEADING_LABEL,
    timeLabel: NOW_LABEL,
    current: true,
    occupiedElsewhere: false,
  }
  const others = input.rows.filter(
    (row) => !row.current && row.inCurrentWorktree && row.group !== "earlier",
  )
  const sections: readonly SessionOutlineSection[] = [
    {
      group: "today",
      rows: [current, ...others.filter((row) => row.group === "today").map(rowOf)],
    },
    { group: "yesterday", rows: others.filter((row) => row.group === "yesterday").map(rowOf) },
  ]
  const shown = sections.filter((section) => section.rows.length > 0)
  return { sections: shown, count: shown.reduce((sum, section) => sum + section.rows.length, 0) }
}

function rowOf(row: SessionSwitcherRow): SessionOutlineRow {
  return {
    key: row.sessionId,
    sessionId: row.sessionId,
    heading: row.heading,
    timeLabel: row.timeLabel,
    current: false,
    occupiedElsewhere: row.occupiedElsewhere,
  }
}
