// バックグラウンドタスクの顔ぶれと委譲先の進みの知らせを、tsukumo 内部のイベントに変換する。
// 知らせは外部由来の値なので、unknown で受けて検証する。

import { isPlainObject } from "remeda"

import type {
  BackgroundTask,
  BackgroundTaskKind,
} from "../../../shared/session-driver/background-task.ts"
import type { SessionEvent } from "../../../shared/session/session-event.ts"
import { nonBlankString } from "../../../shared/utils/non-blank-string.ts"
import { optionalString } from "../../../shared/utils/optional-string.ts"

/**
 * `background_tasks_changed` の `tasks`（変わったあとの全員）を内部の型に写す。
 * `tasks` が配列でなければイベントを出さない（壊れた知らせで、動いているものを空に倒さない）。
 * 要素のうち `task_id` が文字列でないものと、`ambient` が true のもの（SDK が「活動の印から外せ」と言う見張り役など）は捨てる。
 * `description` が無ければ空の文字列に畳む（描く側は種類だけ出す）。
 */
export function backgroundTaskEvents(tasks: unknown): readonly SessionEvent[] {
  if (!Array.isArray(tasks)) {
    return []
  }

  return [
    {
      kind: "background-tasks-changed",
      tasks: tasks.flatMap((task): readonly BackgroundTask[] =>
        !isPlainObject(task) || typeof task.task_id !== "string" || task.ambient === true
          ? []
          : [
              {
                taskId: task.task_id,
                kind: backgroundTaskKind(task.task_type),
                description: optionalString(task.description) ?? "",
              },
            ],
      ),
    },
  ]
}

export function delegateProgressEvents(
  message: Readonly<Record<string, unknown>>,
): readonly SessionEvent[] {
  const summary = nonBlankString(message.summary)
  return typeof message.task_id !== "string" || summary === undefined
    ? []
    : [{ kind: "delegate-progress", taskId: message.task_id, summary }]
}

/**
 * SDK の `task_type` を3つに畳む（{@link BackgroundTaskKind}）。
 * 実測で見たのは `local_bash`（`run_in_background` の Bash）と `local_agent`（背景のサブエージェント）の2つ。
 */
function backgroundTaskKind(taskType: unknown): BackgroundTaskKind {
  switch (taskType) {
    case "local_bash":
      return "shell"
    case "local_agent":
      return "agent"
    default:
      return "other"
  }
}
