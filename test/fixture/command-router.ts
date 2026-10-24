// コマンドの受け手（`createSocketRouter`）のテストが共有する、偽のセッションと受け手の口。

import type { CommandRouterPorts } from "../../src/router.ts"
import type { DispatchResult } from "../../src/server/core/command-receiver.ts"
import type { DiaryWriterSource } from "../../src/server/diary/core/diary-writer.ts"
import { createPromptImageShelf } from "../../src/server/session-driver/core/prompt-image-shelf.ts"
import type { CommandSession } from "../../src/server/session/core/command-session.ts"
import type { SessionLaunchRequest } from "../../src/server/session/core/session-launch.ts"
import type { DailyAchievement } from "../../src/shared/achievement/achievement.ts"
import type { GeneratedCharacter } from "../../src/shared/character-pack/generated-character.ts"
import type {
  CharacterCreate,
  CharacterDelete,
  CharacterEdit,
} from "../../src/shared/contract/character-pack.ts"
import type { SessionDefault } from "../../src/shared/session/session-default.ts"
import type { SessionEvent } from "../../src/shared/session/session-event.ts"
import { applySessionEvent } from "../../src/shared/session/session-fold.ts"
import { INITIAL_SESSION_STATE, type SessionState } from "../../src/shared/session/session-state.ts"
import { usageProposalKey } from "../../src/shared/usage-review/usage-review.ts"
import { createCommandClient } from "./command-client.ts"
import { createStubDriver, type StubDriver } from "./session-driver.ts"
import { CHARACTER_EVENT, ITEMS_EVENT, requestEvent } from "./session-event.ts"

/** 立ち絵から生成できたときに口が返す欄の値（手で書いた架空のキャラクター）。 */
export const GENERATED_CHARACTER = {
  id: "fictional-3",
  name: "架空の3号",
  accent: "#b8c7ff",
  chatAccent: "#eaa77a",
  persona: "# 架空の3号\n\n架空の人格。",
} satisfies GeneratedCharacter

/** 振り返りの書き手を気にしないテストに渡す出どころ（起こさない）。 */
export const NO_DIARY_WRITER: DiaryWriterSource = { kind: "dont-write" }

export const REQUEST_EVENT = requestEvent()
export const CHAT_MODE_EVENT = { kind: "chat-mode-changed", chat: true } satisfies SessionEvent

export function createFakeSession(
  stub: StubDriver = createStubDriver(),
  restartResult: DispatchResult = { ok: true },
): FakeSession {
  const emitted: SessionEvent[] = []
  const restarts: SessionLaunchRequest[] = []
  const diaryAbort = new AbortController()
  let state: SessionState = INITIAL_SESSION_STATE
  const observe = (event: SessionEvent): void => {
    state = applySessionEvent(state, event, NOW)
  }
  return {
    session: {
      state: () => state,
      modeSession: () => ({ kind: "none" }),
      driver: () => Promise.resolve(stub.driver),
      restart: (request) => {
        restarts.push(request)
        return Promise.resolve(restartResult)
      },
      generation: () => ({
        emit: (event) => {
          emitted.push(event)
          observe(event)
        },
        diarySignal: diaryAbort.signal,
      }),
    },
    stub,
    emitted,
    restarts,
    diarySignal: diaryAbort.signal,
    observe,
  }
}

/** 呼ばれた口と引数を積む受け手の口。書き込みの結果は `writeResult` で決める。 */
export function createRecordingPorts(
  writeResult: "written" | "rejected",
  readAchievementDay: (date: string) => Promise<DailyAchievement | undefined>,
  diary: DiaryWriterSource,
) {
  const edits: CharacterEdit[] = []
  const creates: CharacterCreate[] = []
  const deletes: CharacterDelete[] = []
  const generations: string[] = []
  const itemCalls: string[] = []
  const remembered: SessionDefault[] = []
  const forgottenLines: string[] = []
  const openedFiles: string[] = []
  /** 別の窓が占有ファイルに書いていることにするセッションのID。 */
  const occupiedElsewhere = new Set<string>()
  const reserved: string[] = []
  let withdrawCount = 0
  /** 見直しの走りへの頼み（頼まれた順）。走りは止められるまで「走っている」ままにする。 */
  const usageReviewCalls: string[] = []
  let usageReviewRunning = false
  const runUsageReview = (call: string, onEvent: (event: SessionEvent) => void): boolean => {
    usageReviewCalls.push(call)
    if (usageReviewRunning) {
      return false
    }
    usageReviewRunning = true
    onEvent({ kind: "usage-review-started" })
    return true
  }
  const written = (): SessionEvent | undefined =>
    writeResult === "written" ? CHARACTER_EVENT : undefined
  const ports: CommandRouterPorts = {
    session: {
      promptImageShelf: createPromptImageShelf(),
      rememberSessionDefault: (sessionDefault) => {
        remembered.push(sessionDefault)
        return { kind: "session-default-changed", sessionDefault }
      },
      readAchievementDay,
      diary,
      reserveSession: (sessionId) => {
        reserved.push(sessionId)
        return Promise.resolve(occupiedElsewhere.has(sessionId) ? "occupied" : "reserved")
      },
      withdrawSessionClaim: () => {
        withdrawCount += 1
      },
    },
    characterPack: {
      editCharacter: (edit) => {
        edits.push(edit)
        return Promise.resolve(written())
      },
      createCharacter: (create) => {
        creates.push(create)
        return Promise.resolve(written())
      },
      deleteCharacter: (remove) => {
        deletes.push(remove)
        return Promise.resolve(written())
      },
      generateFromPortrait: (portrait) => {
        generations.push(portrait)
        return Promise.resolve(writeResult === "written" ? GENERATED_CHARACTER : undefined)
      },
    },
    item: {
      addItem: (input) => {
        itemCalls.push(`add:${input.name}`)
        return Promise.resolve(writeResult === "written" ? ITEMS_EVENT : undefined)
      },
      removeItem: ({ id }) => {
        itemCalls.push(`remove:${id}`)
        return Promise.resolve(writeResult === "written" ? ITEMS_EVENT : undefined)
      },
      setSeat: ({ pack, seat, id }) => {
        itemCalls.push(`setSeat:${pack}:${seat}:${id}`)
        return Promise.resolve(writeResult === "written" ? ITEMS_EVENT : undefined)
      },
      clearSeat: ({ pack, seat }) => {
        itemCalls.push(`clearSeat:${pack}:${seat}`)
        return Promise.resolve(writeResult === "written" ? ITEMS_EVENT : undefined)
      },
    },
    chat: {
      forgetRememberedLine: (line) => {
        forgottenLines.push(line)
        return Promise.resolve(writeResult === "written" ? REMEMBERED_LINES_EVENT : undefined)
      },
    },
    usageReview: {
      dismissUsageProposal: (dismiss) => ({
        kind: "usage-proposal-dismissed",
        key: usageProposalKey(dismiss),
      }),
      runner: {
        startReview: (model, onEvent) => runUsageReview(`start:${model}`, onEvent),
        runProposal: (proposal, model, onEvent) =>
          runUsageReview(`runProposal:${usageProposalKey(proposal)}:${model}`, onEvent),
        interrupt: () => {
          usageReviewCalls.push("interrupt")
          usageReviewRunning = false
        },
      },
    },
    host: {
      openFile: (path) => {
        openedFiles.push(path)
        return Promise.resolve(writeResult === "written")
      },
    },
    workflowSetting: {
      changeWorkflowSetting: () => Promise.reject(new Error("ワークフローの設定は使わない")),
    },
    diagnostic: { reportBrowserError: () => {}, reportRecommendationPressed: () => {} },
    experienceMetric: { recordSplit: () => {} },
  }
  return {
    ports,
    edits,
    creates,
    deletes,
    generations,
    itemCalls,
    remembered,
    forgottenLines,
    openedFiles,
    occupiedElsewhere,
    reserved,
    withdrawCount: () => withdrawCount,
    usageReviewCalls,
  }
}

export function startRouter(
  writeResult: "written" | "rejected" = "written",
  readAchievementDay: (date: string) => Promise<DailyAchievement | undefined> = () =>
    Promise.resolve(undefined),
  diary: DiaryWriterSource = NO_DIARY_WRITER,
) {
  const fake = createFakeSession()
  const recorded = createRecordingPorts(writeResult, readAchievementDay, diary)
  return { ...fake, ...recorded, commands: createCommandClient(recorded.ports, fake.session) }
}

/** 偽のセッションがイベントを畳むときの時刻。 */
const NOW = 1_000

/** 覚えたことを1行消したあとに流し直す `remembered-lines-changed`（作り物の1行）。 */
const REMEMBERED_LINES_EVENT: SessionEvent = {
  kind: "remembered-lines-changed",
  lines: ["架空の残った1行"],
}

/**
 * 受け手に見せるセッションの口の代役。
 * 姿は本物の reducer で畳むので、受け手が流したイベントも `observe` で届けたイベントも、断る条件の判定に効く。
 * 起こし直しは頼まれた要求を覚えるだけで、代は変えない。
 */
type FakeSession = {
  readonly session: CommandSession
  readonly stub: StubDriver
  /** 受け手が流したイベント（流した順）。 */
  readonly emitted: readonly SessionEvent[]
  /** 頼まれた起こし直しの要求（頼まれた順）。 */
  readonly restarts: readonly SessionLaunchRequest[]
  readonly diarySignal: AbortSignal
  /** 駆動から届いたことにして、イベントを姿に畳む。 */
  readonly observe: (event: SessionEvent) => void
}
