// 作業ディレクトリのリポジトリの配線。タスク一覧の見張りと、一覧が届くたびに札を作り直す推薦役を選ぶ。

import {
  readRecommendationCache,
  writeRecommendationCache,
} from "../server/recommendation/adapter/recommendation-cache.ts"
import { queryStructured } from "../server/recommendation/adapter/sdk-structured-query.ts"
import { createRecommender, type Recommender } from "../server/recommendation/core/recommender.ts"
import { watchTaskSummary } from "../server/repository/adapter/task-summary.ts"
import type { SessionManagerOptions } from "../server/session/core/session-manager.ts"
import type { SessionEvent } from "../shared/session/session-event.ts"
import type { WiringContext } from "./wiring-context.ts"

/** 疑似セッションの推薦役。claude を起こさないので、何も配らない。 */
const IDLE_RECOMMENDER: Recommender = {
  observe: () => {},
  close: () => {},
}

export function wireRepository(context: WiringContext): {
  readonly manager: Pick<SessionManagerOptions, "watchTasks">
} {
  return {
    manager: {
      watchTasks: (onEvent) => {
        const recommender = startRecommender(context, onEvent)
        const watcher = watchTaskSummary(context.cwd, (tasks) => {
          onEvent({ kind: "tasks-changed", tasks })
          recommender.observe(tasks)
        })
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
  onEvent: (event: SessionEvent) => void,
): Recommender {
  if (context.fakeSession !== undefined) {
    return IDLE_RECOMMENDER
  }
  const { cwd, inheritedEnv } = context
  return createRecommender({
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
