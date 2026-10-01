// 迎える口に並べる口を、セッションの一覧・前回の要約・タスク一覧から導く。

import {
  taskReadiness,
  unfinishedTaskIds,
  type TaskSummaryResult,
} from "../../../../../../../../../shared/repository/task-summary.ts"
import type { SessionChoice } from "../../../../../../../../../shared/session/session-choice.ts"
import { remainingOf } from "../../../../../../../../domain/session-summary.ts"

/** 見出しが無いセッションの代わりに出す字。 */
const NO_HEADING_LABEL = "（題なし）"

/** 次に着手できるタスクとして並べる上限。 */
const MAX_TASK_DOORS = 3

/** 押すと下書きの末尾に `request` が入る口。 */
export type WelcomeDoor = {
  readonly key: string
  readonly label: string
  /** 口の2行目（続きは「残り：」の段落、タスクは無い）。 */
  readonly detail: string
  readonly request: string
}

export type WelcomeEntries = {
  readonly resume: readonly WelcomeDoor[]
  readonly tasks: readonly WelcomeDoor[]
}

/** 前回の続きの要約を読む相手。無ければ取りに行かない。 */
export function previousSessionOf(
  sessions: readonly SessionChoice[],
  currentSessionId: string | undefined,
): SessionChoice | undefined {
  return sessions.find((session) => session.sessionId !== currentSessionId)
}

export function welcomeEntriesOf(
  previous: SessionChoice | undefined,
  previousSummary: string | undefined,
  tasks: TaskSummaryResult,
): WelcomeEntries {
  const remaining = previousSummary === undefined ? undefined : remainingOf(previousSummary)
  return {
    resume:
      previous === undefined || remaining === undefined
        ? []
        : [
            {
              key: previous.sessionId,
              label: previous.heading ?? NO_HEADING_LABEL,
              detail: `残り：${remaining}`,
              request: `前回の続き: ${remaining}`,
            },
          ],
    tasks: readyTaskDoors(tasks),
  }
}

function readyTaskDoors(tasks: TaskSummaryResult): readonly WelcomeDoor[] {
  if (tasks.kind === "unknown") {
    return []
  }
  const unfinished = unfinishedTaskIds(tasks.items)
  return tasks.items
    .filter((task) => taskReadiness(task, unfinished)?.kind === "ready")
    .slice(0, MAX_TASK_DOORS)
    .map((task) => ({
      key: task.id,
      label: task.id,
      detail: task.summary,
      request: `${task.id} に着手して`,
    }))
}
