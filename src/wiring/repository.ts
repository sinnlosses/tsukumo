// 作業ディレクトリのリポジトリの配線。タスク一覧の見張りを選ぶ。

import { watchTaskSummary } from "../server/repository/adapter/task-summary.ts"
import type { SessionManagerOptions } from "../server/session/core/session-manager.ts"
import type { WiringContext } from "./wiring-context.ts"

export function wireRepository(context: WiringContext): {
  readonly manager: Pick<SessionManagerOptions, "watchTasks">
} {
  return {
    manager: {
      watchTasks: (onEvent) =>
        watchTaskSummary(context.cwd, (tasks) => onEvent({ kind: "tasks-changed", tasks })),
    },
  }
}
