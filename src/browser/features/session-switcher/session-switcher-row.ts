// セッション一覧の行の組み立て。
// 一覧（`SessionState.sessions`）は軽いもの（ID・見出し・時刻）だけを持つ。

import type { SessionChoice } from "../../../shared/session/session-choice.ts"
import type { SessionId } from "../../../shared/session/session-id.ts"
import { clockTime, zonedDateTime } from "../../utils/clock.ts"

/** 一覧の日の区切り（見本の「今日」「昨日」「それより前」）。 */
export type SessionSwitcherGroup = "today" | "yesterday" | "earlier"

export const SESSION_SWITCHER_GROUP_LABELS = {
  today: "今日",
  yesterday: "昨日",
  earlier: "それより前",
} as const satisfies Record<SessionSwitcherGroup, string>

export type SessionSwitcherRow = {
  readonly sessionId: SessionId
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
  /** 別のウィンドウの tsukumo がいま開いているか。いまの行は使用中にしない。 */
  readonly occupiedElsewhere: boolean
}

/** 見出しが無い（SDK の `summary` が空・読めない）行に代わりに出す字。 */
export const NO_HEADING_LABEL = "（題なし）"

export function switcherRow(
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

/** `M/D HH:MM`（年は出さない。一覧に並ぶのは直近の作業だけ）。 */
export function monthDayTime(at: Temporal.ZonedDateTime): string {
  return `${String(at.month)}/${String(at.day)} ${clockTime(at)}`
}

function groupOf(date: Temporal.PlainDate, today: Temporal.PlainDate): SessionSwitcherGroup {
  if (date.equals(today)) {
    return "today"
  }
  return date.equals(today.subtract({ days: 1 })) ? "yesterday" : "earlier"
}
