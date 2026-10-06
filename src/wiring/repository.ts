// 作業ディレクトリのリポジトリの配線。タスク一覧の見張りと、一覧が届くたびに札を作り直す推薦役を選び、プロジェクトの設定を書く口を組む。

import type { DiagnosticLog } from "../server/diagnostic/core/diagnostic.ts"
import {
  readRecommendationCache,
  writeRecommendationCache,
} from "../server/recommendation/adapter/recommendation-cache.ts"
import { queryStructured } from "../server/recommendation/adapter/sdk-structured-query.ts"
import { createRecommender, type Recommender } from "../server/recommendation/core/recommender.ts"
import { writeProjectSettings } from "../server/repository/adapter/project-settings.ts"
import {
  taskSummaryOptionsOf,
  watchTaskSummary,
} from "../server/repository/adapter/task-summary.ts"
import type { ProjectSettingsCommandPorts } from "../server/repository/core/project-settings-command.ts"
import type { SessionManagerOptions } from "../server/session/core/session-manager.ts"
import type { SessionEvent } from "../shared/session/session-event.ts"
import { failureDiagnostic } from "./failure-diagnostic.ts"
import type { WiringContext } from "./wiring-context.ts"

/** 疑似セッションの推薦役。claude を起こさないので、何も配らない。 */
const IDLE_RECOMMENDER: Recommender = {
  observe: () => {},
  close: () => {},
}

export function wireRepository(
  context: WiringContext,
  diagnosticLog: DiagnosticLog,
): {
  readonly manager: Pick<SessionManagerOptions, "watchTasks">
  readonly commands: ProjectSettingsCommandPorts
} {
  return {
    commands: {
      save: (tasks) => writeProjectSettings(context.cwd, tasks),
    },
    manager: {
      watchTasks: (onEvent) => {
        const recommender = startRecommender(context, diagnosticLog, onEvent)
        const reportFailure = failureDiagnostic(diagnosticLog, context.now)
        const watcher = watchTaskSummary(
          context.cwd,
          (tasks) => {
            onEvent({ kind: "tasks-changed", tasks })
            recommender.observe(tasks)
          },
          taskSummaryOptionsOf(context.fakeSession === undefined ? "real" : "fake"),
          (error) => {
            reportFailure({ feature: "repository", place: "task-summary-poll" }, error)
          },
        )
        return {
          setWatching: watcher.setWatching,
          close: () => {
            recommender.close()
            return watcher.close()
          },
        }
      },
    },
  }
}

/** 問い合わせは会話のセッションと同じ作業先・引き継いだ環境で起こす。 */
function startRecommender(
  context: WiringContext,
  diagnosticLog: DiagnosticLog,
  onEvent: (event: SessionEvent) => void,
): Recommender {
  if (context.fakeSession !== undefined) {
    return IDLE_RECOMMENDER
  }
  const { cwd, inheritedEnv } = context
  const reportFailure = failureDiagnostic(diagnosticLog, context.now)
  return createRecommender({
    onFailure: (place, error) => {
      reportFailure({ feature: "recommendation", place }, error)
    },
    readCache: () => readRecommendationCache(),
    writeCache: (entries) => {
      writeRecommendationCache(entries)
    },
    query: (request, signal) => queryStructured(request, { cwd, env: inheritedEnv }, signal),
    emit: (cards) => {
      onEvent({ kind: "recommendation-changed", cards })
    },
  })
}
