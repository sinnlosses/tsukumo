// 作業ディレクトリのリポジトリの配線。タスク一覧の見張りと、一覧が届くたびに札を作り直す推薦役を選ぶ。

import { IDLE_CHANGE_COUNT_GIT } from "../server/core/change-count-git.ts"
import type { DiagnosticLog } from "../server/diagnostic/core/diagnostic.ts"
import {
  readRecommendationCache,
  writeRecommendationCache,
} from "../server/recommendation/adapter/recommendation-cache.ts"
import { createRecommender, type Recommender } from "../server/recommendation/core/recommender.ts"
import type { BeadsStamp } from "../server/repository/adapter/beads.ts"
import { changeCountGitOf } from "../server/repository/adapter/change-count.ts"
import { projectNameOf } from "../server/repository/adapter/project-name.ts"
import { readFileExcerpt } from "../server/repository/adapter/repository-file-excerpt.ts"
import { listRepositoryFiles } from "../server/repository/adapter/repository-file.ts"
import type { RepositoryProcedurePorts } from "../server/repository/adapter/repository-procedure.ts"
import {
  taskSummaryOptionsOf,
  watchTaskSummary,
  type TaskSummaryOptions,
} from "../server/repository/adapter/task-summary.ts"
import type { SessionManagerOptions } from "../server/session/core/session-manager-port.ts"
import { queryStructured } from "../server/welcome-greeting/adapter/sdk-structured-query.ts"
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
  readBeadsStamp: () => Promise<BeadsStamp>,
): {
  readonly rpc: Omit<RepositoryProcedurePorts, "refreshTasks">
  readonly manager: Pick<SessionManagerOptions, "watchTasks" | "changeCountGit">
} {
  return {
    rpc: {
      listRepositoryFiles: () => listRepositoryFiles(context.cwd),
      readFileExcerpt: (request) =>
        readFileExcerpt(
          context.cwd,
          request,
          async () => (await listRepositoryFiles(context.cwd)).paths,
        ),
      projectName: () => projectNameOf(context.cwd),
    },
    manager: {
      changeCountGit: changeCountGitOfContext(context),
      watchTasks: (onEvent) => {
        const recommender = startRecommender(context, diagnosticLog, onEvent)
        const reportFailure = failureDiagnostic(diagnosticLog, context.now)
        const watcher = watchTaskSummary(
          context.cwd,
          (result, change) => {
            onEvent({ kind: "tasks-changed", tasks: change })
            recommender.observe(result)
          },
          taskSummaryOptionsOfContext(context, readBeadsStamp),
          (error) => {
            reportFailure({ feature: "repository", place: "task-summary-poll" }, error)
          },
        )
        return {
          setWatching: watcher.setWatching,
          refresh: watcher.refresh,
          close: () => {
            recommender.close()
            return watcher.close()
          },
        }
      },
    },
  }
}

/** 疑似セッションは偽の読み元のまま。ふだんは成果のキャッシュと共有する印の読み手を使う。 */
function taskSummaryOptionsOfContext(
  context: WiringContext,
  readBeadsStamp: () => Promise<BeadsStamp>,
): TaskSummaryOptions {
  const { driver } = context
  switch (driver.kind) {
    case "fake":
      return taskSummaryOptionsOf("fake")
    case "sdk": {
      const options = taskSummaryOptionsOf("real")
      return {
        ...options,
        ports: { ...options.ports, createBeadsStampReader: () => readBeadsStamp },
      }
    }
    default:
      return driver satisfies never
  }
}

function changeCountGitOfContext(context: WiringContext): ReturnType<typeof changeCountGitOf> {
  const { driver } = context
  switch (driver.kind) {
    case "sdk":
      return changeCountGitOf(context.cwd)
    case "fake":
      return IDLE_CHANGE_COUNT_GIT
    default:
      return driver satisfies never
  }
}

/** 問い合わせは会話のセッションと同じ作業先・引き継いだ環境で起こす。 */
function startRecommender(
  context: WiringContext,
  diagnosticLog: DiagnosticLog,
  onEvent: (event: SessionEvent) => void,
): Recommender {
  const { driver } = context
  switch (driver.kind) {
    case "fake":
      return IDLE_RECOMMENDER
    case "sdk":
      return startRealRecommender(context, diagnosticLog, onEvent)
    default:
      return driver satisfies never
  }
}

function startRealRecommender(
  context: WiringContext,
  diagnosticLog: DiagnosticLog,
  onEvent: (event: SessionEvent) => void,
): Recommender {
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
