// 作業ディレクトリのリポジトリの配線。タスク一覧の見張りと、一覧が届くたびに札を作り直す推薦役を選ぶ。

import { queryStructured } from "../server/adapter/sdk-structured-query.ts"
import type { DiagnosticLog } from "../server/diagnostic/core/diagnostic.ts"
import {
  readRecommendationCache,
  writeRecommendationCache,
} from "../server/recommendation/adapter/recommendation-cache.ts"
import { createRecommender, type Recommender } from "../server/recommendation/core/recommender.ts"
import { codeBlockStartLine } from "../server/report/core/rules/block/code-match.ts"
import type { BeadsStamp } from "../server/repository/adapter/beads/beads.ts"
import {
  createFakeBeadsStampReader,
  readFakeBeadsIssues,
} from "../server/repository/adapter/beads/fake-beads.ts"
import { changeCountGitOf } from "../server/repository/adapter/change-count.ts"
import { checkRecordSourceOf } from "../server/repository/adapter/check-record.ts"
import { projectNameOf } from "../server/repository/adapter/project-name.ts"
import { readCodeBlockStart } from "../server/repository/adapter/repository-code-block-start.ts"
import { readFileExcerpt } from "../server/repository/adapter/repository-file-excerpt.ts"
import { listRepositoryFiles } from "../server/repository/adapter/repository-file.ts"
import type { RepositoryProcedurePorts } from "../server/repository/adapter/repository-procedure.ts"
import {
  REAL_TASK_SUMMARY_OPTIONS,
  watchTaskSummary,
  type TaskSummaryOptions,
} from "../server/repository/adapter/task/task-summary.ts"
import { IDLE_CHANGE_COUNT_GIT } from "../server/repository/core/change-count-git.ts"
import {
  type CheckRecordSource,
  IDLE_CHECK_RECORD_SOURCE,
} from "../server/repository/core/check-record-source.ts"
import type { SessionManagerOptions } from "../server/session/core/session-manager-port.ts"
import {
  type CodeBlockStartRequest,
  UNKNOWN_CODE_BLOCK_START,
} from "../shared/repository/code-block-start.ts"
import {
  type FileExcerptRequest,
  UNREADABLE_FILE_EXCERPT,
} from "../shared/repository/file-excerpt.ts"
import { EMPTY_REPOSITORY_FILE_LIST } from "../shared/repository/repository-file-list.ts"
import type { SessionEvent } from "../shared/session/session-event.ts"
import { failureDiagnostic } from "./failure-diagnostic.ts"
import { foldPortFailure } from "./fold-port-failure.ts"
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
  readonly manager: Pick<
    SessionManagerOptions,
    "watchTasks" | "changeCountGit" | "checkRecordSource"
  >
} {
  const reportFailure = failureDiagnostic(diagnosticLog, context.now)
  return {
    // 読みが投げた回は足跡を残して、読めなかったときの値に畳む（候補が出ない・抜き書きや行番号が出ないだけで画面は続く）。
    rpc: {
      listRepositoryFiles: foldPortFailure(
        reportFailure,
        { feature: "repository", place: "list-files" },
        EMPTY_REPOSITORY_FILE_LIST,
        () => listRepositoryFiles(context.cwd),
      ),
      readFileExcerpt: foldPortFailure(
        reportFailure,
        { feature: "repository", place: "read-file-excerpt" },
        UNREADABLE_FILE_EXCERPT,
        (request: FileExcerptRequest) =>
          readFileExcerpt(
            context.cwd,
            request,
            async () => (await listRepositoryFiles(context.cwd)).paths,
          ),
      ),
      readCodeBlockStart: foldPortFailure(
        reportFailure,
        { feature: "repository", place: "read-code-block-start" },
        UNKNOWN_CODE_BLOCK_START,
        (request: CodeBlockStartRequest) =>
          readCodeBlockStart(
            context.cwd,
            request,
            async () => (await listRepositoryFiles(context.cwd)).paths,
            codeBlockStartLine,
          ),
      ),
      projectName: () => projectNameOf(context.cwd),
    },
    manager: {
      changeCountGit: changeCountGitOfContext(context),
      checkRecordSource: checkRecordSourceOfContext(context),
      watchTasks: (onEvent) => {
        const recommender = startRecommender(context, diagnosticLog, onEvent)
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
          refresh: foldPortFailure(
            reportFailure,
            { feature: "repository", place: "refresh-tasks" },
            undefined,
            watcher.refresh,
          ),
          close: () => {
            recommender.close()
            return watcher.close()
          },
        }
      },
    },
  }
}

/**
 * 疑似セッションの見回りの間隔。読むのはファイル1つだけなので、
 * E2E の足場が置いた一覧を待たせずに届ける。
 */
const FAKE_TASK_SUMMARY_POLL_INTERVAL_MS = 200

/** 疑似セッションは偽の読み元のまま。ふだんは成果のキャッシュと共有する印の読み手を使う。 */
function taskSummaryOptionsOfContext(
  context: WiringContext,
  readBeadsStamp: () => Promise<BeadsStamp>,
): TaskSummaryOptions {
  const { driver } = context
  switch (driver.kind) {
    case "fake":
      return {
        intervalMs: FAKE_TASK_SUMMARY_POLL_INTERVAL_MS,
        ports: {
          ...REAL_TASK_SUMMARY_OPTIONS.ports,
          readBeadsIssues: readFakeBeadsIssues,
          createBeadsStampReader: createFakeBeadsStampReader,
        },
      }
    case "sdk":
      return {
        ...REAL_TASK_SUMMARY_OPTIONS,
        ports: {
          ...REAL_TASK_SUMMARY_OPTIONS.ports,
          createBeadsStampReader: () => readBeadsStamp,
        },
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

function checkRecordSourceOfContext(context: WiringContext): CheckRecordSource {
  const { driver } = context
  switch (driver.kind) {
    case "sdk":
      return checkRecordSourceOf(context.cwd, context.inheritedEnv)
    case "fake":
      return IDLE_CHECK_RECORD_SOURCE
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
  const { cwd, inheritedEnv, now, throwawayQuery } = context
  const reportFailure = failureDiagnostic(diagnosticLog, now)
  return createRecommender({
    onFailure: (place, error) => {
      reportFailure({ feature: "recommendation", place }, error)
    },
    readCache: () => readRecommendationCache(),
    writeCache: (entries) => {
      writeRecommendationCache(entries)
    },
    query: (request, signal) =>
      queryStructured(request, { cwd, env: inheritedEnv, record: throwawayQuery, now }, signal),
    emit: (cards) => {
      onEvent({ kind: "recommendation-changed", cards })
    },
  })
}
