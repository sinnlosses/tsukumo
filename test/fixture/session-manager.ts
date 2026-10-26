import type { CommandRouterPorts } from "../../src/router.ts"
import type { ChatConsolidationSource } from "../../src/server/chat/core/chat-consolidation-writer.ts"
import type { ContextUsageLog } from "../../src/server/context-usage/core/context-usage.ts"
import { IDLE_CHANGE_COUNT_GIT } from "../../src/server/core/change-count-git.ts"
import type { DiagnosticLog } from "../../src/server/diagnostic/core/diagnostic.ts"
import type { DiaryWriterSource } from "../../src/server/diary/core/diary-writer.ts"
import type { ExperienceMetricLog } from "../../src/server/experience-metric/core/experience-metric.ts"
import { createReportImageShelf } from "../../src/server/report/core/report-image-shelf.ts"
import type { ReportUsageLog } from "../../src/server/report/core/report-usage.ts"
import { createPromptImageShelf } from "../../src/server/session-driver/core/prompt-image-shelf.ts"
import type { SessionManagerOptions } from "../../src/server/session/core/session-manager-port.ts"
import { createSessionManager as createSessionManagerWithoutCommands } from "../../src/server/session/core/session-manager.ts"
import type { TokenUsageLog } from "../../src/server/token-usage/core/token-usage.ts"
import type { CharacterEdit } from "../../src/shared/contract/character-pack.ts"
import type { UsageProposalKeyInput } from "../../src/shared/contract/usage-review.ts"
import type { SessionEvent } from "../../src/shared/session/session-event.ts"
import {
  type PreviousUsageReview,
  usageProposalKey,
} from "../../src/shared/usage-review/usage-review.ts"
import { NOOP_CHAT_ARCHIVE } from "./chat.ts"
import { createCommandClient } from "./command-client.ts"
import { createStubDriver } from "./session-driver.ts"
import { CHARACTER_EVENT, requestEvent } from "./session-event.ts"

const BATCH_MS = 5

/** 会話のアーカイブに書く仕事の行の `project`（架空のリポジトリの名前）。 */
export const FICTIONAL_PROJECT = "架空プロジェクト"

/** トークン消費の記録を気にしないテストに渡す、何もしない書き込み口。 */
const NOOP_TOKEN_USAGE_LOG: TokenUsageLog = {
  append: () => {},
  prefetchOpenTask: () => {},
  readRange: () => [],
}

/** 進行の計測値の記録を気にしないテストに渡す、何もしない書き込み口。 */
const NOOP_EXPERIENCE_METRIC_LOG: ExperienceMetricLog = { append: () => {}, readRange: () => [] }

/** 診断ログを気にしないテストに渡す、何もしない書き込み口。 */
const NOOP_DIAGNOSTIC_LOG: DiagnosticLog = { append: () => {}, readRange: () => [] }

/** コンテキストの内訳の記録を気にしないテストに渡す、何もしない書き込み口。 */
const NOOP_CONTEXT_USAGE_LOG: ContextUsageLog = { append: () => {} }

/** `report` の塊の使われ方の記録を気にしないテストに渡す、何もしない書き込み口。 */
const NOOP_REPORT_USAGE_LOG: ReportUsageLog = {
  append: () => {},
  appendRejection: () => {},
  appendFollowUp: () => {},
}

/** タスク一覧を気にしないテストに渡す見張り（何も流さない）。 */
const NO_TASK_WATCH: SessionManagerOptions["watchTasks"] = () => ({
  close: () => {},
  setWatching: () => {},
  refresh: () => Promise.resolve(),
})

/** 定着を気にしないテストに渡す出どころ（起こさない）。 */
const NO_CHAT_CONSOLIDATION: ChatConsolidationSource = { kind: "dont-consolidate" }

/** 振り返りの書き手を気にしないテストに渡す出どころ（起こさない）。 */
const NO_DIARY_WRITER: DiaryWriterSource = { kind: "dont-write" }

/** コマンドの受け手の口（機能ごとの `ports` を平らに並べたもの。棚は `SessionManagerOptions` と共有する）。 */
type FlatCommandPorts = Omit<
  CommandRouterPorts["session"] &
    CommandRouterPorts["characterPack"] &
    CommandRouterPorts["chat"] &
    CommandRouterPorts["usageReview"] &
    CommandRouterPorts["host"],
  "promptImageShelf"
>

/** どのテストも気にしない口の既定値。共有の棚は呼ぶたびに新しく起こす。 */
function defaultSessionManagerOptions() {
  return {
    now: () => 1_000,
    openFile: () => Promise.resolve(true),
    readAchievementDay: () => Promise.resolve(undefined),
    batchIntervalMs: BATCH_MS,
    chatConsolidation: NO_CHAT_CONSOLIDATION,
    watchTasks: NO_TASK_WATCH,
    diary: NO_DIARY_WRITER,
    chatArchive: NOOP_CHAT_ARCHIVE,
    project: FICTIONAL_PROJECT,
    tokenUsageLog: NOOP_TOKEN_USAGE_LOG,
    experienceMetricLog: NOOP_EXPERIENCE_METRIC_LOG,
    diagnosticLog: NOOP_DIAGNOSTIC_LOG,
    contextUsageLog: NOOP_CONTEXT_USAGE_LOG,
    reportUsageLog: NOOP_REPORT_USAGE_LOG,
    promptImageShelf: createPromptImageShelf(),
    reportImageShelf: createReportImageShelf(),
    readReportImage: () => undefined,
    rememberSessionDefault: (sessionDefault) => ({
      kind: "session-default-changed",
      sessionDefault,
    }),
    editCharacter: () => Promise.resolve(undefined),
    createCharacter: () => Promise.resolve(undefined),
    deleteCharacter: () => Promise.resolve(undefined),
    forgetRememberedLine: () => Promise.resolve(undefined),
    readPreviousUsageReview: (): PreviousUsageReview => ({ kind: "none" }),
    changeCountGit: IDLE_CHANGE_COUNT_GIT,
    dismissUsageProposal: (dismiss) => ({
      kind: "usage-proposal-dismissed",
      key: usageProposalKey(dismiss),
    }),
    runner: { startReview: () => false, runProposal: () => false, interrupt: () => {} },
  } satisfies Partial<SessionManagerOptions & FlatCommandPorts>
}

/**
 * 平らに並べた口からセッションとコマンドのルータを組む。
 * 受け手そのものの振る舞いは `createSocketRouter` のテストが持ち、ここでコマンドを使うのは代の寿命と反応の順を起こす引き金としてだけ。
 */
export function createSessionManager(
  overrides: Pick<SessionManagerOptions, "launchSession"> &
    Partial<SessionManagerOptions & FlatCommandPorts>,
) {
  const options = { ...defaultSessionManagerOptions(), ...overrides }
  const {
    rememberSessionDefault,
    readAchievementDay,
    diary,
    editCharacter,
    createCharacter,
    deleteCharacter,
    forgetRememberedLine,
    dismissUsageProposal,
    runner,
    openFile,
    ...rest
  } = options
  const manager = createSessionManagerWithoutCommands(rest)
  const commands = createCommandClient(
    {
      session: {
        promptImageShelf: rest.promptImageShelf,
        rememberSessionDefault,
        readAchievementDay,
        diary,
        reserveSession: () => Promise.resolve("reserved"),
        withdrawSessionClaim: () => {},
      },
      characterPack: {
        editCharacter,
        createCharacter,
        deleteCharacter,
        generateFromPortrait: () => Promise.resolve(undefined),
      },
      item: {
        addItem: () => Promise.resolve(undefined),
        removeItem: () => Promise.resolve(undefined),
        setSeat: () => Promise.resolve(undefined),
        clearSeat: () => Promise.resolve(undefined),
      },
      chat: { forgetRememberedLine },
      usageReview: { dismissUsageProposal, runner },
      host: { openFile },
      workflowSetting: {
        changeWorkflowSetting: () => Promise.reject(new Error("ワークフローの設定は使わない")),
      },
      diagnostic: { reportBrowserError: () => {}, reportRecommendationPressed: () => {} },
      experienceMetric: { recordSplit: () => {} },
    },
    manager.commandSession,
  )
  return { ...manager, commands }
}

export function startManagerWithStub() {
  const stub = createStubDriver()
  const edits: CharacterEdit[] = []
  /** 見送った提案の識別子（書き先は配線層なので、ここでは積むだけ）。 */
  const dismissedUsageProposals: UsageProposalKeyInput[] = []
  const manager = createSessionManager({
    launchSession: (onEvent, onRestoredEvents) => {
      stub.attach(onEvent)
      stub.attachRestored(onRestoredEvents)
      return Promise.resolve(stub.driver)
    },
    editCharacter: (edit) => {
      edits.push(edit)
      return Promise.resolve(CHARACTER_EVENT)
    },
    dismissUsageProposal: (dismiss) => {
      dismissedUsageProposals.push(dismiss)
      return { kind: "usage-proposal-dismissed", key: usageProposalKey(dismiss) }
    },
  })
  return { manager, stub, edits, dismissedUsageProposals }
}

export function waitForBatch(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, BATCH_MS * 4))
}

/** 前のセッションを組み直した再生（架空の1ターン）。 */
export const RESTORED_REPLAY: readonly SessionEvent[] = [
  requestEvent("前のセッションの架空の依頼"),
  {
    kind: "tool-started",
    toolUseId: "t-restored",
    name: "Read",
    input: { file_path: "/tmp/dummy.txt" },
    parentToolUseId: undefined,
  },
  { kind: "tool-finished", toolUseId: "t-restored", content: "架空の結果", isError: false },
  { kind: "speech", text: "前のセッションの架空のセリフ", expression: "proud" },
  { kind: "turn-finished", outcome: { kind: "completed" } },
]
