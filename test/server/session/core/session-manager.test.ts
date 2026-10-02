import { describe, expect, it } from "vitest"

import type { CommandRouterPorts } from "../../../../src/router.ts"
import type {
  ChatArchive,
  ChatArchiveEntry,
} from "../../../../src/server/chat/core/chat-archive-port.ts"
import type {
  ChatConsolidationOutcome,
  ChatConsolidationSource,
} from "../../../../src/server/chat/core/chat-consolidation-writer.ts"
import type {
  ContextUsageEntry,
  ContextUsageLog,
} from "../../../../src/server/context-usage/core/context-usage.ts"
import type { DiaryWriterSource } from "../../../../src/server/diary/core/diary-writer.ts"
import type { ExperienceMetricLog } from "../../../../src/server/experience-metric/core/experience-metric.ts"
import {
  createReportImageShelf,
  type ReportImage,
} from "../../../../src/server/report/core/report-image-shelf.ts"
import type {
  ReportUsageEntry,
  ReportUsageLog,
} from "../../../../src/server/report/core/report-usage.ts"
import {
  createPromptImageShelf,
  type PromptImageShelf,
  recordedPromptImages,
  type ShelvedPromptImage,
} from "../../../../src/server/session-driver/core/prompt-image-shelf.ts"
import type { SessionDriver } from "../../../../src/server/session-driver/core/session-driver.ts"
import type { SessionLaunchRequest } from "../../../../src/server/session/core/session-launch.ts"
import {
  createSessionManager as createSessionManagerWithoutCommands,
  type SessionManagerOptions,
  type SessionWatcher,
} from "../../../../src/server/session/core/session-manager.ts"
import type {
  TokenUsageEntry,
  TokenUsageLog,
} from "../../../../src/server/token-usage/core/token-usage.ts"
import type { VisitGuest } from "../../../../src/server/visit/core/visit-guest.ts"
import { VISIT_TIMING } from "../../../../src/server/visit/core/visit-timing.ts"
import type { VisitPorts } from "../../../../src/server/visit/core/visit-watch.ts"
import type { VisitScript } from "../../../../src/shared/character-pack/character-visit.ts"
import { CHAT_MEMORY_BUDGET } from "../../../../src/shared/chat/chat-memory-budget.ts"
import {
  type ContextUsageReport,
  UNAVAILABLE_CONTEXT_USAGE,
} from "../../../../src/shared/context-usage/context-usage.ts"
import type { CharacterEdit } from "../../../../src/shared/contract/character-pack.ts"
import type { UsageProposalDismissal } from "../../../../src/shared/contract/usage-review.ts"
import {
  FRAME_ERROR_REASON,
  PROTOCOL_VERSION,
  type ServerFrame,
} from "../../../../src/shared/frame.ts"
import type { ReportSection } from "../../../../src/shared/report/report-block.ts"
import type { PromptImage } from "../../../../src/shared/session-driver/prompt-image.ts"
import { UNAVAILABLE_SESSION_DIGEST } from "../../../../src/shared/session/session-digest.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"
import {
  applySessionEvent,
  INITIAL_SESSION_STATE,
  MAX_SESSION_STATE_TURNS,
  type SessionState,
} from "../../../../src/shared/session/session-state.ts"
import type {
  ModelTokenUsage,
  ScopeUsage,
  TurnUsageBreakdown,
} from "../../../../src/shared/token-usage/token-usage.ts"
import {
  type PreviousUsageReview,
  usageProposalKey,
} from "../../../../src/shared/usage-review/usage-review.ts"
import { VISIT_LINE_MIN_INTERVAL_MS } from "../../../../src/shared/visit/visit-line-timing.ts"
import {
  characterChangedEvent,
  shownOutfitAccents,
  shownPortraits,
} from "../../../fixture/character.ts"
import { NOOP_CHAT_ARCHIVE } from "../../../fixture/chat.ts"
import { createCommandClient } from "../../../fixture/command-client.ts"
import { contextUsage, readyContextUsage } from "../../../fixture/context-usage.ts"
import { createManualClock } from "../../../fixture/manual-clock.ts"
import {
  createStubDriver,
  FAKE_SESSION_DIGEST,
  type StubDriver,
} from "../../../fixture/session-driver.ts"

const BATCH_MS = 5

/** 会話のアーカイブに書く仕事の行の `project`（架空のリポジトリの名前）。 */
const FICTIONAL_PROJECT = "架空プロジェクト"

/** トークン消費の記録を気にしないテストに渡す、何もしない書き込み口。 */
const NOOP_TOKEN_USAGE_LOG: TokenUsageLog = { append: () => {}, readRange: () => [] }

/** 体験の数の記録を気にしないテストに渡す、何もしない書き込み口。 */
const NOOP_EXPERIENCE_METRIC_LOG: ExperienceMetricLog = { append: () => {}, readRange: () => [] }

/** コンテキストの内訳の記録を気にしないテストに渡す、何もしない書き込み口。 */
const NOOP_CONTEXT_USAGE_LOG: ContextUsageLog = { append: () => {} }

/** `report` の塊の使われ方の記録を気にしないテストに渡す、何もしない書き込み口。 */
const NOOP_REPORT_USAGE_LOG: ReportUsageLog = { append: () => {} }

/** 訪問を気にしないテストに渡す口（客の候補が居ないので来ない。時計は起こさない）。 */
const NO_VISIT_PORTS: VisitPorts = {
  timing: VISIT_TIMING,
  clock: { after: () => () => {} },
  listGuests: () => [],
  random: () => 0,
  scriptSource: { kind: "pack-only" },
}

/** タスク一覧を気にしないテストに渡す見張り（何も流さない）。 */
const NO_TASK_WATCH = (): SessionWatcher => ({ close: () => {}, setWatching: () => {} })

/** 定着を気にしないテストに渡す出どころ（起こさない）。 */
const NO_CHAT_CONSOLIDATION: ChatConsolidationSource = { kind: "dont-consolidate" }

/** 振り返りの書き手を気にしないテストに渡す出どころ（起こさない）。 */
const NO_DIARY_WRITER: DiaryWriterSource = { kind: "dont-write" }

/**
 * 見た目の編集で流し直す `character-changed`（手で書いた架空のパック）。書き込みそのものは
 * 配線層の仕事なので、ここでは「書けた/書けなかった」だけを差し替える。
 */
const CHARACTER_EVENT: SessionEvent = characterChangedEvent({
  ...shownPortraits({ default: "/character/default.png?v=fictional@2" }),
  outfitAccents: shownOutfitAccents({ default: "#b8c7ff" }),
})

/** コマンドの受け手の口（機能ごとの `ports` を平らに並べたもの。棚は `SessionManagerOptions` と共有する）。 */
type FlatCommandPorts = Omit<
  CommandRouterPorts["session"] &
    CommandRouterPorts["characterPack"] &
    CommandRouterPorts["chat"] &
    CommandRouterPorts["visit"] &
    CommandRouterPorts["usageReview"] &
    CommandRouterPorts["host"],
  "promptImageShelf"
>

/**
 * 平らに並べた口からセッションとコマンドのルータを組む。
 * 受け手そのものの振る舞いは `createCommandRouter` のテストが持ち、ここでコマンドを使うのは代の寿命と反応の順を起こす引き金としてだけ。
 */
function createSessionManager(options: SessionManagerOptions & FlatCommandPorts) {
  const {
    rememberSessionDefault,
    readAchievementDay,
    diary,
    editCharacter,
    createCharacter,
    deleteCharacter,
    forgetRememberedLine,
    rememberVisitEnabled,
    dismissUsageProposal,
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
      },
      characterPack: { editCharacter, createCharacter, deleteCharacter },
      chat: { forgetRememberedLine },
      visit: { rememberVisitEnabled },
      usageReview: { dismissUsageProposal },
      host: { openFile },
    },
    manager.commandSession,
  )
  return { ...manager, commands }
}

function startManagerWithStub() {
  const stub = createStubDriver()
  const edits: CharacterEdit[] = []
  /** ホームへ書いた「前回の見直しの結果」（書き先は配線層なので、ここでは積むだけ）。 */
  const writtenPreviousUsageReviews: [number, unknown][] = []
  /** 見送った提案の識別子（書き先は配線層なので、ここでは積むだけ）。 */
  const dismissedUsageProposals: UsageProposalDismissal[] = []
  const manager = createSessionManager({
    now: () => 1_000,
    openFile: () => Promise.resolve(true),
    readAchievementDay: () => Promise.resolve(undefined),
    batchIntervalMs: BATCH_MS,
    chatConsolidation: NO_CHAT_CONSOLIDATION,
    watchTasks: NO_TASK_WATCH,
    visit: NO_VISIT_PORTS,
    diary: NO_DIARY_WRITER,
    chatArchive: NOOP_CHAT_ARCHIVE,
    project: FICTIONAL_PROJECT,
    tokenUsageLog: NOOP_TOKEN_USAGE_LOG,
    experienceMetricLog: NOOP_EXPERIENCE_METRIC_LOG,
    contextUsageLog: NOOP_CONTEXT_USAGE_LOG,
    reportUsageLog: NOOP_REPORT_USAGE_LOG,
    promptImageShelf: createPromptImageShelf(),
    reportImageShelf: createReportImageShelf(),
    readReportImage: () => undefined,
    rememberSessionDefault: (sessionDefault) => ({
      kind: "session-default-changed",
      sessionDefault,
    }),
    rememberVisitEnabled: (visitEnabled) => ({ kind: "visit-enabled-changed", visitEnabled }),
    launchSession: (onEvent, onRestoredEvents) => {
      stub.attach(onEvent)
      stub.attachRestored(onRestoredEvents)
      return Promise.resolve(stub.driver)
    },
    editCharacter: (edit) => {
      edits.push(edit)
      return Promise.resolve(CHARACTER_EVENT)
    },
    createCharacter: () => Promise.resolve(undefined),
    deleteCharacter: () => Promise.resolve(undefined),
    forgetRememberedLine: () => Promise.resolve(undefined),
    readPreviousUsageReview: (): PreviousUsageReview => ({ kind: "none" }),
    writePreviousUsageReview: (reviewedAt, findings) => {
      writtenPreviousUsageReviews.push([reviewedAt, findings])
    },
    dismissUsageProposal: (dismiss) => {
      dismissedUsageProposals.push(dismiss)
      return { kind: "usage-proposal-dismissed", key: usageProposalKey(dismiss) }
    },
  })
  return { manager, stub, edits, writtenPreviousUsageReviews, dismissedUsageProposals }
}

function waitForBatch(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, BATCH_MS * 4))
}

/** 前のセッションを組み直した再生（架空の1ターン）。 */
const RESTORED_REPLAY: readonly SessionEvent[] = [
  { kind: "request", text: "前のセッションの架空の依頼", images: [] },
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
  { kind: "history-restored" },
]

describe("createSessionManager", () => {
  it("subscribe した直後に hello（snapshot）が届き、以降は events が続く", async () => {
    const { manager, stub } = startManagerWithStub()
    const frames: ServerFrame[] = []

    manager.subscribe((frame) => frames.push(frame))
    stub.emit({ kind: "speech", text: "架空のセリフ", expression: "default" })
    await waitForBatch()

    const [hello, events] = frames
    expect(hello).toEqual({
      type: "hello",
      protocolVersion: PROTOCOL_VERSION,
      state: expect.objectContaining({ speeches: [] }),
    })
    expect(events).toEqual({
      type: "events",
      events: [
        { at: 1_000, event: { kind: "speech", text: "架空のセリフ", expression: "default" } },
      ],
    })
  })

  it("コンテキストの内訳は駆動へ問い合わせてそのまま返す", async () => {
    const { manager, stub } = startManagerWithStub()

    expect(await manager.readContextUsage()).toEqual(readyContextUsage())
    expect(stub.calls).toContain("readContextUsage")
  })

  it("セッションの中身は、一覧に載ったものといま出しているものだけ駆動へ問い合わせる", async () => {
    const { manager, stub } = startManagerWithStub()
    stub.emit({
      kind: "sessions-changed",
      sessions: [
        {
          viewPort: 7327,
          sessionId: "fake-listed",
          lastModified: 2_000,
          startedAt: 1_000,
          heading: "架空の見出し",
        },
      ],
      current: "fake-current",
    })

    expect(await manager.readSessionDigest("fake-listed")).toEqual(FAKE_SESSION_DIGEST)
    expect(await manager.readSessionDigest("fake-current")).toEqual(FAKE_SESSION_DIGEST)
    expect(await manager.readSessionDigest("fake-elsewhere")).toEqual(UNAVAILABLE_SESSION_DIGEST)
    expect(stub.calls).not.toContain("readSessionDigest:fake-elsewhere")
  })

  it("hello の snapshot は、それまでのイベントをサーバ側でも畳んだ姿", async () => {
    const { manager, stub } = startManagerWithStub()
    stub.emit({ kind: "speech", text: "先に流れたセリフ", expression: "proud" })
    await waitForBatch()

    const frames: ServerFrame[] = []
    manager.subscribe((frame) => frames.push(frame))

    const [hello] = frames
    expect(hello?.type).toBe("hello")
    if (hello?.type === "hello") {
      expect(hello.state.speeches).toEqual([{ text: "先に流れたセリフ", expression: "proud" }])
      expect(hello.state.speechExpression).toBe("proud")
    }
  })

  it("組み直した再生は events で配らず、1件ずつ畳んだのと同じ姿の hello で配る", async () => {
    const { manager, stub } = startManagerWithStub()
    const frames: ServerFrame[] = []
    manager.subscribe((frame) => frames.push(frame))
    await waitForBatch()
    const before = frames.length

    // 束に残っているうちに再生が届く（hello の姿に入るので、events でもう一度配らない）。
    stub.emit({ kind: "chat-mode-changed", chat: true })
    const stateBeforeReplay = manager.commandSession.state()
    stub.emitRestored(RESTORED_REPLAY)
    await waitForBatch()

    expect(frames.slice(before)).toEqual([
      {
        type: "hello",
        protocolVersion: PROTOCOL_VERSION,
        state: RESTORED_REPLAY.reduce(
          (state, event) => applySessionEvent(state, event, 1_000),
          stateBeforeReplay,
        ),
      },
    ])
  })

  it("起こし直しの間に届いた再生は、起き上がったあとの hello 1枚に入る", async () => {
    const releases: (() => void)[] = []
    const manager = createSessionManager({
      now: () => 1_000,
      openFile: () => Promise.resolve(true),
      readAchievementDay: () => Promise.resolve(undefined),
      batchIntervalMs: BATCH_MS,
      chatConsolidation: NO_CHAT_CONSOLIDATION,
      watchTasks: NO_TASK_WATCH,
      visit: NO_VISIT_PORTS,
      diary: NO_DIARY_WRITER,
      chatArchive: NOOP_CHAT_ARCHIVE,
      project: FICTIONAL_PROJECT,
      tokenUsageLog: NOOP_TOKEN_USAGE_LOG,
      experienceMetricLog: NOOP_EXPERIENCE_METRIC_LOG,
      contextUsageLog: NOOP_CONTEXT_USAGE_LOG,
      reportUsageLog: NOOP_REPORT_USAGE_LOG,
      promptImageShelf: createPromptImageShelf(),
      reportImageShelf: createReportImageShelf(),
      readReportImage: () => undefined,
      rememberSessionDefault: (sessionDefault) => ({
        kind: "session-default-changed",
        sessionDefault,
      }),
      rememberVisitEnabled: (visitEnabled) => ({
        kind: "visit-enabled-changed",
        visitEnabled,
      }),
      launchSession: (onEvent, onRestoredEvents, request) => {
        const stub = createStubDriver()
        stub.attach(onEvent)
        if (request.chat === true) {
          onRestoredEvents(RESTORED_REPLAY)
        }
        return new Promise((resolve) => {
          releases.push(() => resolve(stub.driver))
        })
      },
      editCharacter: () => Promise.resolve(undefined),
      createCharacter: () => Promise.resolve(undefined),
      deleteCharacter: () => Promise.resolve(undefined),
      forgetRememberedLine: () => Promise.resolve(undefined),
      readPreviousUsageReview: (): PreviousUsageReview => ({ kind: "none" }),
      writePreviousUsageReview: () => {},
      dismissUsageProposal: (dismiss) => ({
        kind: "usage-proposal-dismissed",
        key: usageProposalKey(dismiss),
      }),
    })
    releases[0]?.()
    const frames: ServerFrame[] = []
    manager.subscribe((frame) => frames.push(frame))
    await waitForBatch()
    const before = frames.length

    const switched = manager.commands.session.setChatMode({ chat: true })
    await waitForBatch()
    expect(frames.slice(before)).toEqual([])

    releases[1]?.()
    expect(await switched).toEqual({ ok: true })
    await waitForBatch()
    expect(frames.slice(before).map((frame) => frame.type)).toEqual(["hello"])
    const hello = frames[before]
    expect(hello?.type === "hello" && hello.state.records).toEqual(
      RESTORED_REPLAY.reduce(
        (state, event) => applySessionEvent(state, event, 1_000),
        INITIAL_SESSION_STATE,
      ).records,
    )
  })

  it("書きかけの本文は1バッチの中で1件に連結される", async () => {
    const { manager, stub } = startManagerWithStub()
    const frames: ServerFrame[] = []
    manager.subscribe((frame) => frames.push(frame))

    stub.emit({ kind: "partial-utterance", text: "架空の" })
    stub.emit({ kind: "partial-utterance", text: "本文" })
    stub.emit({ kind: "turn-finished", outcome: { kind: "completed" } })
    await waitForBatch()

    const events = frames.filter((frame) => frame.type === "events")
    expect(events).toHaveLength(1)
    const first = events[0]
    if (first?.type === "events") {
      expect(first.events.map((stamped) => stamped.event)).toEqual([
        { kind: "partial-utterance", text: "架空の本文" },
        { kind: "turn-finished", outcome: { kind: "completed" } },
      ])
    }
  })

  it("session.switchCharacter で駆動を閉じ、別のパックで起こし直して新しい hello を配る", async () => {
    // 起こされた駆動を、渡された要求と一緒に順に覚える。
    const started: { readonly request: SessionLaunchRequest; readonly stub: StubDriver }[] = []
    const manager = createSessionManager({
      now: () => 1_000,
      openFile: () => Promise.resolve(true),
      readAchievementDay: () => Promise.resolve(undefined),
      batchIntervalMs: BATCH_MS,
      chatConsolidation: NO_CHAT_CONSOLIDATION,
      watchTasks: NO_TASK_WATCH,
      visit: NO_VISIT_PORTS,
      diary: NO_DIARY_WRITER,
      chatArchive: NOOP_CHAT_ARCHIVE,
      project: FICTIONAL_PROJECT,
      tokenUsageLog: NOOP_TOKEN_USAGE_LOG,
      experienceMetricLog: NOOP_EXPERIENCE_METRIC_LOG,
      contextUsageLog: NOOP_CONTEXT_USAGE_LOG,
      reportUsageLog: NOOP_REPORT_USAGE_LOG,
      promptImageShelf: createPromptImageShelf(),
      reportImageShelf: createReportImageShelf(),
      readReportImage: () => undefined,
      rememberSessionDefault: (sessionDefault) => ({
        kind: "session-default-changed",
        sessionDefault,
      }),
      rememberVisitEnabled: (visitEnabled) => ({
        kind: "visit-enabled-changed",
        visitEnabled,
      }),
      launchSession: (onEvent, _onRestoredEvents, request) => {
        const stub = createStubDriver()
        stub.attach(onEvent)
        started.push({ request, stub })
        return Promise.resolve(stub.driver)
      },
      editCharacter: () => Promise.resolve(undefined),
      createCharacter: () => Promise.resolve(undefined),
      deleteCharacter: () => Promise.resolve(undefined),
      forgetRememberedLine: () => Promise.resolve(undefined),
      readPreviousUsageReview: (): PreviousUsageReview => ({ kind: "none" }),
      writePreviousUsageReview: () => {},
      dismissUsageProposal: (dismiss) => ({
        kind: "usage-proposal-dismissed",
        key: usageProposalKey(dismiss),
      }),
    })

    const frames: ServerFrame[] = []
    manager.subscribe((frame) => frames.push(frame))
    started[0]?.stub.emit({ kind: "speech", text: "切り替える前のセリフ", expression: "default" })
    await waitForBatch()

    expect(await manager.commands.session.switchCharacter({ name: "fictional" })).toEqual({
      ok: true,
    })

    // 起動の1代目は初期パック・続きは印から探す（どちらも覚えない側）。
    expect(started[0]?.request).toEqual({
      selection: { by: "initial" },
      chat: undefined,
      resume: { by: "latest" },
    })
    // 前の駆動は閉じ、新しい駆動が起きている。
    expect(started[0]?.stub.calls).toContain("close")
    expect(started).toHaveLength(2)

    // 購読者には、初期状態に戻した新しい hello が届く（吹き出し・立ち絵・メインビューが消える）。
    const hello = frames.filter((frame) => frame.type === "hello")
    expect(hello).toHaveLength(2)
    const latest = hello[1]
    if (latest?.type === "hello") {
      expect(latest.state).toEqual(INITIAL_SESSION_STATE)
    }

    // 閉じた駆動があとから投げてくるイベントは、新しい状態に混ざらない。
    started[0]?.stub.emit({ kind: "speech", text: "閉じた駆動のセリフ", expression: "proud" })
    started[1]?.stub.emit({ kind: "speech", text: "切り替えたあとのセリフ", expression: "default" })
    await waitForBatch()

    const events = frames.filter((frame) => frame.type === "events").at(-1)
    if (events?.type === "events") {
      expect(events.events.map((stamped) => stamped.event)).toEqual([
        { kind: "speech", text: "切り替えたあとのセリフ", expression: "default" },
      ])
    }
  })

  it("起こし直しの間に新しい駆動が流したイベントは、新しい hello より先に配らない", async () => {
    // 起き上がりに時間がかかる駆動（本物の claude は起動に数秒かかる）。その間に
    // `chat-mode-changed` などが先に流れると、ブラウザは前のセッションの姿のまま雑談へ
    // 切り替わり、前の立ち絵が一瞬出てから新しい hello で入れ替わる。
    const releases: (() => void)[] = []
    const manager = createSessionManager({
      now: () => 1_000,
      openFile: () => Promise.resolve(true),
      readAchievementDay: () => Promise.resolve(undefined),
      batchIntervalMs: BATCH_MS,
      chatConsolidation: NO_CHAT_CONSOLIDATION,
      watchTasks: NO_TASK_WATCH,
      visit: NO_VISIT_PORTS,
      diary: NO_DIARY_WRITER,
      chatArchive: NOOP_CHAT_ARCHIVE,
      project: FICTIONAL_PROJECT,
      tokenUsageLog: NOOP_TOKEN_USAGE_LOG,
      experienceMetricLog: NOOP_EXPERIENCE_METRIC_LOG,
      contextUsageLog: NOOP_CONTEXT_USAGE_LOG,
      reportUsageLog: NOOP_REPORT_USAGE_LOG,
      promptImageShelf: createPromptImageShelf(),
      reportImageShelf: createReportImageShelf(),
      readReportImage: () => undefined,
      rememberSessionDefault: (sessionDefault) => ({
        kind: "session-default-changed",
        sessionDefault,
      }),
      rememberVisitEnabled: (visitEnabled) => ({
        kind: "visit-enabled-changed",
        visitEnabled,
      }),
      launchSession: (onEvent, _onRestoredEvents, request) => {
        const stub = createStubDriver()
        stub.attach(onEvent)
        onEvent({ kind: "chat-mode-changed", chat: request.chat ?? false })
        return new Promise((resolve) => {
          releases.push(() => resolve(stub.driver))
        })
      },
      editCharacter: () => Promise.resolve(undefined),
      createCharacter: () => Promise.resolve(undefined),
      deleteCharacter: () => Promise.resolve(undefined),
      forgetRememberedLine: () => Promise.resolve(undefined),
      readPreviousUsageReview: (): PreviousUsageReview => ({ kind: "none" }),
      writePreviousUsageReview: () => {},
      dismissUsageProposal: (dismiss) => ({
        kind: "usage-proposal-dismissed",
        key: usageProposalKey(dismiss),
      }),
    })
    releases[0]?.()
    const frames: ServerFrame[] = []
    manager.subscribe((frame) => frames.push(frame))
    await waitForBatch()
    const before = frames.length

    const switched = manager.commands.session.setChatMode({ chat: true })
    await waitForBatch()
    expect(frames.slice(before)).toEqual([])

    releases[1]?.()
    expect(await switched).toEqual({ ok: true })
    await waitForBatch()
    expect(frames.slice(before).map((frame) => frame.type)).toEqual(["hello"])
    const hello = frames[before]
    expect(hello?.type === "hello" && hello.state.chatMode).toBe(true)
  })

  it("駆動が起き上がるのを待ってから、新しい hello を配る（続きから始めるセッションを探す間）", async () => {
    // 駆動を起こすのに外の世界（transcript の一覧）を読むので、`launchSession` は待てる形で返る。
    const started: StubDriver[] = []
    const manager = createSessionManager({
      now: () => 1_000,
      openFile: () => Promise.resolve(true),
      readAchievementDay: () => Promise.resolve(undefined),
      batchIntervalMs: BATCH_MS,
      chatConsolidation: NO_CHAT_CONSOLIDATION,
      watchTasks: NO_TASK_WATCH,
      visit: NO_VISIT_PORTS,
      diary: NO_DIARY_WRITER,
      chatArchive: NOOP_CHAT_ARCHIVE,
      project: FICTIONAL_PROJECT,
      tokenUsageLog: NOOP_TOKEN_USAGE_LOG,
      experienceMetricLog: NOOP_EXPERIENCE_METRIC_LOG,
      contextUsageLog: NOOP_CONTEXT_USAGE_LOG,
      reportUsageLog: NOOP_REPORT_USAGE_LOG,
      promptImageShelf: createPromptImageShelf(),
      reportImageShelf: createReportImageShelf(),
      readReportImage: () => undefined,
      rememberSessionDefault: (sessionDefault) => ({
        kind: "session-default-changed",
        sessionDefault,
      }),
      rememberVisitEnabled: (visitEnabled) => ({
        kind: "visit-enabled-changed",
        visitEnabled,
      }),
      launchSession: async (onEvent) => {
        const stub = createStubDriver()
        stub.attach(onEvent)
        await waitForBatch()
        started.push(stub)
        return stub.driver
      },
      editCharacter: () => Promise.resolve(undefined),
      createCharacter: () => Promise.resolve(undefined),
      deleteCharacter: () => Promise.resolve(undefined),
      forgetRememberedLine: () => Promise.resolve(undefined),
      readPreviousUsageReview: (): PreviousUsageReview => ({ kind: "none" }),
      writePreviousUsageReview: () => {},
      dismissUsageProposal: (dismiss) => ({
        kind: "usage-proposal-dismissed",
        key: usageProposalKey(dismiss),
      }),
    })

    const frames: ServerFrame[] = []
    manager.subscribe((frame) => frames.push(frame))

    // 起き上がる前に届いた依頼も、待ってから渡る（取りこぼさない）。
    expect(await manager.commands.session.prompt({ text: "架空の依頼", images: [] })).toEqual({
      ok: true,
    })
    expect(started[0]?.calls).toEqual(["prompt:架空の依頼"])

    expect(await manager.commands.session.switchCharacter({ name: "fictional" })).toEqual({
      ok: true,
    })

    // 切り替え先の駆動が起き上がったあとで hello が配られている。
    expect(started).toHaveLength(2)
    expect(started[0]?.calls).toContain("close")
    expect(frames.filter((frame) => frame.type === "hello")).toHaveLength(2)
  })

  it("代を閉じると、渡した信号が中断される", async () => {
    const { manager } = startManagerWithStub()

    const signal = manager.commandSession.generation().diarySignal
    expect(signal.aborted).toBe(false)

    await manager.commands.session.switchCharacter({ name: "fictional" })
    expect(signal.aborted).toBe(true)
  })

  describe("定着", () => {
    function startChatManagerWithStub(
      archive: ChatArchive = NOOP_CHAT_ARCHIVE,
      chatConsolidation: ChatConsolidationSource = NO_CHAT_CONSOLIDATION,
    ) {
      const stub = createStubDriver()
      const manager = createSessionManager({
        now: () => 1_000,
        openFile: () => Promise.resolve(true),
        readAchievementDay: () => Promise.resolve(undefined),
        batchIntervalMs: BATCH_MS,
        chatConsolidation,
        watchTasks: NO_TASK_WATCH,
        visit: NO_VISIT_PORTS,
        diary: NO_DIARY_WRITER,
        chatArchive: archive,
        project: FICTIONAL_PROJECT,
        tokenUsageLog: NOOP_TOKEN_USAGE_LOG,
        experienceMetricLog: NOOP_EXPERIENCE_METRIC_LOG,
        contextUsageLog: NOOP_CONTEXT_USAGE_LOG,
        reportUsageLog: NOOP_REPORT_USAGE_LOG,
        promptImageShelf: createPromptImageShelf(),
        reportImageShelf: createReportImageShelf(),
        readReportImage: () => undefined,
        rememberSessionDefault: (sessionDefault) => ({
          kind: "session-default-changed",
          sessionDefault,
        }),
        rememberVisitEnabled: (visitEnabled) => ({
          kind: "visit-enabled-changed",
          visitEnabled,
        }),
        launchSession: (onEvent) => {
          stub.attach(onEvent)
          return Promise.resolve(stub.driver)
        },
        editCharacter: () => Promise.resolve(undefined),
        createCharacter: () => Promise.resolve(undefined),
        deleteCharacter: () => Promise.resolve(undefined),
        forgetRememberedLine: () => Promise.resolve(undefined),
        readPreviousUsageReview: (): PreviousUsageReview => ({ kind: "none" }),
        writePreviousUsageReview: () => {},
        dismissUsageProposal: (dismiss) => ({
          kind: "usage-proposal-dismissed",
          key: usageProposalKey(dismiss),
        }),
      })
      return { manager, stub }
    }

    /**
     * 呼ばれたパック名と信号を覚え、結果はテストが手で返す書き手（本物の `query()` は起こさない）。
     */
    function createManualConsolidation() {
      const calls: { readonly packName: string; readonly signal: AbortSignal }[] = []
      const pending: ((outcome: ChatConsolidationOutcome) => void)[] = []
      const source: ChatConsolidationSource = {
        kind: "consolidate",
        consolidate: (packName, signal) => {
          calls.push({ packName, signal })
          const { promise, resolve } = Promise.withResolvers<ChatConsolidationOutcome>()
          pending.push(resolve)
          return promise
        },
      }
      const finish = (outcome: ChatConsolidationOutcome): void => {
        pending.shift()?.(outcome)
      }
      return { source, calls, finish }
    }

    /** 届いた `events` のうち `chat-topics-changed` だけ。 */
    function topicEvents(frames: readonly ServerFrame[]): readonly SessionEvent[] {
      return frames.flatMap((frame) =>
        frame.type === "events"
          ? frame.events
              .map(({ event }) => event)
              .filter((event) => event.kind === "chat-topics-changed")
          : [],
      )
    }

    const TURN_FINISHED: SessionEvent = { kind: "turn-finished", outcome: { kind: "completed" } }

    async function startInChat() {
      const consolidation = createManualConsolidation()
      const started = startChatManagerWithStub(NOOP_CHAT_ARCHIVE, consolidation.source)
      const frames: ServerFrame[] = []
      started.manager.subscribe((frame) => frames.push(frame))
      await waitForBatch()
      started.stub.emit(CHARACTER_EVENT)
      started.stub.emit({ kind: "chat-mode-changed", chat: true })
      return { ...started, consolidation, frames }
    }

    it("雑談のターンの終わりに1本だけ起こし、走っているあいだの契機は捨て、走り終えても次のターンの終わりまで起こさない", async () => {
      const { stub, consolidation, frames } = await startInChat()

      stub.emit(TURN_FINISHED)
      expect(consolidation.calls.map((call) => call.packName)).toEqual(["fictional"])

      // 走っているあいだのターンの終わりは捨てる（待ち行列にも積まない）。
      stub.emit(TURN_FINISHED)
      expect(consolidation.calls).toHaveLength(1)

      consolidation.finish({ kind: "written", topics: ["架空の話題"] })
      await waitForBatch()
      // 書けたら、書いたファイルから取った見出しを流す。
      expect(topicEvents(frames)).toEqual([{ kind: "chat-topics-changed", topics: ["架空の話題"] }])
      // 走り終えただけでは次を起こさない。
      expect(consolidation.calls).toHaveLength(1)

      stub.emit(TURN_FINISHED)
      expect(consolidation.calls).toHaveLength(2)
    })

    it("失敗しても落ちずに見出しを流さず、次のターンの終わりに拾い直す。閉じたら走っている1本を中断する", async () => {
      const { manager, stub, consolidation, frames } = await startInChat()

      stub.emit(TURN_FINISHED)
      consolidation.finish({ kind: "failed" })
      await waitForBatch()
      expect(topicEvents(frames)).toEqual([])

      stub.emit(TURN_FINISHED)
      expect(consolidation.calls).toHaveLength(2)
      expect(consolidation.calls[1]?.signal.aborted).toBe(false)

      manager.close()
      expect(consolidation.calls[1]?.signal.aborted).toBe(true)
    })

    it("書けた時点で別のパックに替わっていれば、見出しを流さない", async () => {
      const { stub, consolidation, frames } = await startInChat()

      stub.emit(TURN_FINISHED)
      stub.emit(characterChangedEvent({ pack: "another-fictional" }))
      consolidation.finish({ kind: "written", topics: ["架空の話題"] })
      await waitForBatch()

      expect(topicEvents(frames)).toEqual([])
    })

    it("仕事のターンの終わりにも起こし、書けても話題の見出しは流さない", async () => {
      const consolidation = createManualConsolidation()
      const { manager, stub } = startChatManagerWithStub(NOOP_CHAT_ARCHIVE, consolidation.source)
      const frames: ServerFrame[] = []
      manager.subscribe((frame) => frames.push(frame))
      await waitForBatch()
      stub.emit(CHARACTER_EVENT)
      stub.emit(TURN_FINISHED)

      expect(consolidation.calls.map((call) => call.packName)).toEqual(["fictional"])

      consolidation.finish({ kind: "written", topics: ["架空の話題"] })
      await waitForBatch()

      expect(topicEvents(frames)).toEqual([])
    })
  })

  it("立ち絵を変えるコマンドは駆動へ渡さず、書けたら character-changed を畳んで配る", async () => {
    const { manager, stub, edits } = startManagerWithStub()
    const frames: ServerFrame[] = []
    manager.subscribe((frame) => frames.push(frame))

    expect(
      await manager.commands.characterPack.setPortrait({
        pack: "fictional",
        expression: "proud",
        image: "data:image/png;base64,AAAA",
      }),
    ).toEqual({ ok: true })
    await waitForBatch()

    // 駆動には何も渡らない（セッションは起こし直さない）。
    expect(stub.calls).toEqual([])
    expect(edits.map((edit) => edit.kind)).toEqual(["setPortrait"])
    // サーバ側の状態にも畳まれ、購読者にはイベントとして届く。
    const events = frames.filter((frame) => frame.type === "events").at(-1)
    if (events?.type === "events") {
      expect(events.events.map((stamped) => stamped.event)).toEqual([CHARACTER_EVENT])
    }
    expect(frames.filter((frame) => frame.type === "hello")).toHaveLength(1)
  })

  it("起こし直しに失敗したら定型文の理由を返し、常駐プロセスは落ちない", async () => {
    const manager = createSessionManager({
      now: () => 1_000,
      openFile: () => Promise.resolve(true),
      readAchievementDay: () => Promise.resolve(undefined),
      batchIntervalMs: BATCH_MS,
      chatConsolidation: NO_CHAT_CONSOLIDATION,
      watchTasks: NO_TASK_WATCH,
      visit: NO_VISIT_PORTS,
      diary: NO_DIARY_WRITER,
      chatArchive: NOOP_CHAT_ARCHIVE,
      project: FICTIONAL_PROJECT,
      tokenUsageLog: NOOP_TOKEN_USAGE_LOG,
      experienceMetricLog: NOOP_EXPERIENCE_METRIC_LOG,
      contextUsageLog: NOOP_CONTEXT_USAGE_LOG,
      reportUsageLog: NOOP_REPORT_USAGE_LOG,
      promptImageShelf: createPromptImageShelf(),
      reportImageShelf: createReportImageShelf(),
      readReportImage: () => undefined,
      rememberSessionDefault: (sessionDefault) => ({
        kind: "session-default-changed",
        sessionDefault,
      }),
      rememberVisitEnabled: (visitEnabled) => ({
        kind: "visit-enabled-changed",
        visitEnabled,
      }),
      launchSession: (onEvent, _onRestoredEvents, request) => {
        if (request.selection.by === "initial") {
          const stub = createStubDriver()
          stub.attach(onEvent)
          return Promise.resolve(stub.driver)
        }
        return Promise.reject(new Error("架空の起こし直し失敗"))
      },
      editCharacter: () => Promise.resolve(undefined),
      createCharacter: () => Promise.resolve(undefined),
      deleteCharacter: () => Promise.resolve(undefined),
      forgetRememberedLine: () => Promise.resolve(undefined),
      readPreviousUsageReview: (): PreviousUsageReview => ({ kind: "none" }),
      writePreviousUsageReview: () => {},
      dismissUsageProposal: (dismiss) => ({
        kind: "usage-proposal-dismissed",
        key: usageProposalKey(dismiss),
      }),
    })

    expect(await manager.commands.session.switchCharacter({ name: "fictional" })).toEqual({
      ok: false,
      reason: FRAME_ERROR_REASON.driverFailed,
    })

    // 常駐プロセスは落ちない。subscribe はそのまま動く。
    const frames: ServerFrame[] = []
    manager.subscribe((frame) => frames.push(frame))
    expect(frames).toHaveLength(1)
  })

  it("close で駆動を閉じ、購読も外れる", async () => {
    const { manager, stub } = startManagerWithStub()
    const frames: ServerFrame[] = []
    manager.subscribe((frame) => frames.push(frame))

    manager.close()
    stub.emit({ kind: "speech", text: "閉じたあとのセリフ", expression: "default" })
    await waitForBatch()

    expect(stub.calls).toContain("close")
    expect(frames.filter((frame) => frame.type === "events")).toHaveLength(0)
  })

  describe("会話のアーカイブ", () => {
    // `chatArchive` の実装（ファイルI/O）は adapter のテストが持つ。ここで見るのは
    // 「いつ・何を渡すか」（`session-manager.receive` の分岐）だけ
    // （docs/architecture/chat-mode.md「雑談の会話のアーカイブ」）。

    /** `report` の `SessionEvent`（結論だけ差し替えられる。中身はすべて手で書いた架空のもの）。 */
    function reportEvent(conclusion: string): SessionEvent {
      return {
        kind: "report",
        toolUseId: "toolu_r1",
        conclusion,
        sections: [
          { heading: "", blocks: [{ kind: "text", text: "本文はここに出ない", fold: "" }] },
        ],
        favor: "本文はここに出ない",
        checks: [
          { status: "ok", label: "本文はここに出ない", figure: "", command: "", detail: "" },
        ],
        closing: { kind: "none" },
        unknownBlockCount: 0,
        sessionSummary: undefined,
        task: { kind: "none" },
      }
    }

    function startArchiveManagerWithStub() {
      const stub = createStubDriver()
      const archiveCalls: { readonly packName: string; readonly entry: ChatArchiveEntry }[] = []
      const chatArchive: ChatArchive = {
        ...NOOP_CHAT_ARCHIVE,
        append: (packName, entry) => {
          archiveCalls.push({ packName, entry })
        },
      }
      const manager = createSessionManager({
        now: () => 1_000,
        openFile: () => Promise.resolve(true),
        readAchievementDay: () => Promise.resolve(undefined),
        batchIntervalMs: BATCH_MS,
        chatConsolidation: NO_CHAT_CONSOLIDATION,
        watchTasks: NO_TASK_WATCH,
        visit: NO_VISIT_PORTS,
        diary: NO_DIARY_WRITER,
        chatArchive,
        project: FICTIONAL_PROJECT,
        tokenUsageLog: NOOP_TOKEN_USAGE_LOG,
        experienceMetricLog: NOOP_EXPERIENCE_METRIC_LOG,
        contextUsageLog: NOOP_CONTEXT_USAGE_LOG,
        reportUsageLog: NOOP_REPORT_USAGE_LOG,
        promptImageShelf: createPromptImageShelf(),
        reportImageShelf: createReportImageShelf(),
        readReportImage: () => undefined,
        rememberSessionDefault: (sessionDefault) => ({
          kind: "session-default-changed",
          sessionDefault,
        }),
        rememberVisitEnabled: (visitEnabled) => ({
          kind: "visit-enabled-changed",
          visitEnabled,
        }),
        launchSession: (onEvent, onRestoredEvents) => {
          stub.attach(onEvent)
          stub.attachRestored(onRestoredEvents)
          return Promise.resolve(stub.driver)
        },
        editCharacter: () => Promise.resolve(undefined),
        createCharacter: () => Promise.resolve(undefined),
        deleteCharacter: () => Promise.resolve(undefined),
        forgetRememberedLine: () => Promise.resolve(undefined),
        readPreviousUsageReview: (): PreviousUsageReview => ({ kind: "none" }),
        writePreviousUsageReview: () => {},
        dismissUsageProposal: (dismiss) => ({
          kind: "usage-proposal-dismissed",
          key: usageProposalKey(dismiss),
        }),
      })
      return { manager, stub, archiveCalls }
    }

    it("雑談で駆動から届いた依頼とセリフが、表情つきで1行ずつアーカイブへ渡る", async () => {
      const { stub, archiveCalls } = startArchiveManagerWithStub()
      await waitForBatch()

      stub.emit(CHARACTER_EVENT)
      stub.emit({ kind: "chat-mode-changed", chat: true })
      stub.emit({ kind: "request", text: "架空の依頼", images: [] })
      stub.emit({ kind: "speech", text: "架空のセリフ", expression: "proud" })
      await waitForBatch()

      expect(archiveCalls).toEqual([
        {
          packName: "fictional",
          entry: {
            mode: "chat",
            kind: "request",
            at: 1_000,
            text: "架空の依頼",
            images: undefined,
          },
        },
        {
          packName: "fictional",
          entry: {
            mode: "chat",
            kind: "speech",
            at: 1_000,
            text: "架空のセリフ",
            expression: "proud",
          },
        },
      ])
    })

    it("添えた画像は枚数だけ渡る（控えそのものは渡さない）", async () => {
      const { stub, archiveCalls } = startArchiveManagerWithStub()
      await waitForBatch()

      stub.emit(CHARACTER_EVENT)
      stub.emit({ kind: "chat-mode-changed", chat: true })
      stub.emit({
        kind: "request",
        text: "架空の依頼",
        images: [
          { id: "fictional-id-a", thumbnail: "data:image/png;base64,AAAA" },
          { id: "fictional-id-b", thumbnail: "data:image/png;base64,BBBB" },
        ],
      })
      await waitForBatch()

      expect(archiveCalls).toEqual([
        {
          packName: "fictional",
          entry: { mode: "chat", kind: "request", at: 1_000, text: "架空の依頼", images: 2 },
        },
      ])
    })

    it("仕事のときも、依頼とセリフが project つきでアーカイブへ渡る", async () => {
      const { stub, archiveCalls } = startArchiveManagerWithStub()
      await waitForBatch()

      stub.emit(CHARACTER_EVENT)
      stub.emit({ kind: "request", text: "架空の依頼", images: [] })
      stub.emit({ kind: "speech", text: "架空のセリフ", expression: "default" })
      await waitForBatch()

      expect(archiveCalls).toEqual([
        {
          packName: "fictional",
          entry: {
            mode: "work",
            kind: "request",
            at: 1_000,
            text: "架空の依頼",
            project: FICTIONAL_PROJECT,
            images: undefined,
          },
        },
        {
          packName: "fictional",
          entry: {
            mode: "work",
            kind: "speech",
            at: 1_000,
            text: "架空のセリフ",
            project: FICTIONAL_PROJECT,
            expression: "default",
          },
        },
      ])
    })

    it("仕事の依頼が workExcerptChars を超えると、先頭で切って「…」を付ける", async () => {
      const { stub, archiveCalls } = startArchiveManagerWithStub()
      await waitForBatch()

      const longRequest = "あ".repeat(CHAT_MEMORY_BUDGET.workExcerptChars + 5)
      stub.emit(CHARACTER_EVENT)
      stub.emit({ kind: "request", text: longRequest, images: [] })
      await waitForBatch()

      expect(archiveCalls).toEqual([
        {
          packName: "fictional",
          entry: {
            mode: "work",
            kind: "request",
            at: 1_000,
            text: `${"あ".repeat(CHAT_MEMORY_BUDGET.workExcerptChars)}…`,
            project: FICTIONAL_PROJECT,
            images: undefined,
          },
        },
      ])
    })

    it("そのターンで最後に届いた report の結論が、turn-finished で1行になる", async () => {
      const { stub, archiveCalls } = startArchiveManagerWithStub()
      await waitForBatch()

      stub.emit(CHARACTER_EVENT)
      stub.emit(reportEvent("途中の結論"))
      stub.emit(reportEvent("最後の結論"))
      await waitForBatch()
      // report だけではまだ書かない（turn-finished でどれを書くか決まる）。
      expect(archiveCalls).toEqual([])

      stub.emit({ kind: "turn-finished", outcome: { kind: "completed" } })
      await waitForBatch()

      expect(archiveCalls).toEqual([
        {
          packName: "fictional",
          entry: {
            mode: "work",
            kind: "conclusion",
            at: 1_000,
            text: "最後の結論",
            project: FICTIONAL_PROJECT,
          },
        },
      ])
    })

    it("結論は workExcerptChars を超えると切って「…」を付け、本文（sections・favor・checks）は渡らない", async () => {
      const { stub, archiveCalls } = startArchiveManagerWithStub()
      await waitForBatch()

      const longConclusion = "い".repeat(CHAT_MEMORY_BUDGET.workExcerptChars + 5)
      stub.emit(CHARACTER_EVENT)
      stub.emit(reportEvent(longConclusion))
      stub.emit({ kind: "turn-finished", outcome: { kind: "completed" } })
      await waitForBatch()

      expect(archiveCalls).toEqual([
        {
          packName: "fictional",
          entry: {
            mode: "work",
            kind: "conclusion",
            at: 1_000,
            text: `${"い".repeat(CHAT_MEMORY_BUDGET.workExcerptChars)}…`,
            project: FICTIONAL_PROJECT,
          },
        },
      ])
    })

    it("report 無しで終わったターンは、結論を何も足さない", async () => {
      const { stub, archiveCalls } = startArchiveManagerWithStub()
      await waitForBatch()

      stub.emit(CHARACTER_EVENT)
      stub.emit({ kind: "turn-finished", outcome: { kind: "completed" } })
      await waitForBatch()

      expect(archiveCalls).toEqual([])
    })

    it("パックがまだ分からない（character-changed が届く前）ときは書かない", async () => {
      const { stub, archiveCalls } = startArchiveManagerWithStub()
      await waitForBatch()

      stub.emit({ kind: "chat-mode-changed", chat: true })
      stub.emit({ kind: "request", text: "架空の依頼", images: [] })
      await waitForBatch()

      expect(archiveCalls).toEqual([])
    })

    it("復元で流し直されたイベントは書かない（起こし直しても同じ行が二重に積まれない）", async () => {
      const { stub, archiveCalls } = startArchiveManagerWithStub()
      await waitForBatch()

      // 前のセッションの記録を組み直した再生（`onRestoredEvents`）。
      stub.emitRestored([
        CHARACTER_EVENT,
        { kind: "chat-mode-changed", chat: true },
        { kind: "request", text: "前のセッションの依頼", images: [] },
        { kind: "speech", text: "前のセッションのセリフ", expression: "default" },
      ])
      await waitForBatch()

      expect(archiveCalls).toEqual([])

      // 駆動から新しく届いたぶんは、いつもどおり書く。
      stub.emit({ kind: "request", text: "新しい依頼", images: [] })
      await waitForBatch()

      expect(archiveCalls).toEqual([
        {
          packName: "fictional",
          entry: {
            mode: "chat",
            kind: "request",
            at: 1_000,
            text: "新しい依頼",
            images: undefined,
          },
        },
      ])
    })

    it("復元で流し直された仕事の report・turn-finished は結論を書かない", async () => {
      const { stub, archiveCalls } = startArchiveManagerWithStub()
      await waitForBatch()

      stub.emitRestored([
        CHARACTER_EVENT,
        reportEvent("前のセッションの結論"),
        { kind: "turn-finished", outcome: { kind: "completed" } },
      ])
      await waitForBatch()

      expect(archiveCalls).toEqual([])
    })

    it("本文（レポート）・ツールの入出力は書かない", async () => {
      const { stub, archiveCalls } = startArchiveManagerWithStub()
      await waitForBatch()

      stub.emit(CHARACTER_EVENT)
      stub.emit({ kind: "chat-mode-changed", chat: true })
      stub.emit({ kind: "utterance", text: "本文はここに出ない" })
      stub.emit({
        kind: "tool-started",
        toolUseId: "t-1",
        name: "Bash",
        input: {},
        parentToolUseId: undefined,
      })
      await waitForBatch()

      expect(archiveCalls).toEqual([])
    })
  })

  // トークン消費の記録。数と時刻とモデルの名前だけが
  // 記録へ渡ることを、ここで固定する。
  describe("トークン消費の記録", () => {
    const SESSION_INFO: SessionEvent = {
      kind: "session-info",
      sessionId: "claude-session-1",
      model: "opus",
      permissionMode: "auto",
      slashCommands: [],
      terminalSlashCommands: [],
    }

    /** 架空のステップ1つぶんの使用量。 */
    const STEP_USAGE = {
      inputTokens: 43_145,
      outputTokens: 13_371,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
    }

    /** ツールもステップも無かった持ち場（数はすべて 0）。 */
    const EMPTY_SCOPE: ScopeUsage = {
      steps: 0,
      tokens: {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
      },
      tools: [],
    }

    /** 何も積まずに終わったターンの内訳。 */
    const EMPTY_BREAKDOWN: TurnUsageBreakdown = { main: EMPTY_SCOPE, subagent: EMPTY_SCOPE }

    /** 架空の累計（実物の使用量は使わない）。 */
    function cumulative(input: number, output: number, cost: number): readonly ModelTokenUsage[] {
      return [
        {
          model: "claude-opus-fictional",
          inputTokens: input,
          outputTokens: output,
          thinkingTokens: 0,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0,
          costUsd: cost,
        },
      ]
    }

    function startTokenUsageManagerWithStub() {
      const stub = createStubDriver()
      const entries: TokenUsageEntry[] = []
      const manager = createSessionManager({
        now: () => 1_000,
        openFile: () => Promise.resolve(true),
        readAchievementDay: () => Promise.resolve(undefined),
        batchIntervalMs: BATCH_MS,
        chatConsolidation: NO_CHAT_CONSOLIDATION,
        watchTasks: NO_TASK_WATCH,
        visit: NO_VISIT_PORTS,
        diary: NO_DIARY_WRITER,
        chatArchive: NOOP_CHAT_ARCHIVE,
        project: FICTIONAL_PROJECT,
        tokenUsageLog: {
          append: (entry) => {
            entries.push(entry)
          },
          readRange: () => [],
        },
        experienceMetricLog: NOOP_EXPERIENCE_METRIC_LOG,
        contextUsageLog: NOOP_CONTEXT_USAGE_LOG,
        reportUsageLog: NOOP_REPORT_USAGE_LOG,
        promptImageShelf: createPromptImageShelf(),
        reportImageShelf: createReportImageShelf(),
        readReportImage: () => undefined,
        rememberSessionDefault: (sessionDefault) => ({
          kind: "session-default-changed",
          sessionDefault,
        }),
        rememberVisitEnabled: (visitEnabled) => ({
          kind: "visit-enabled-changed",
          visitEnabled,
        }),
        launchSession: (onEvent, onRestoredEvents) => {
          stub.attach(onEvent)
          stub.attachRestored(onRestoredEvents)
          return Promise.resolve(stub.driver)
        },
        editCharacter: () => Promise.resolve(undefined),
        createCharacter: () => Promise.resolve(undefined),
        deleteCharacter: () => Promise.resolve(undefined),
        forgetRememberedLine: () => Promise.resolve(undefined),
        readPreviousUsageReview: (): PreviousUsageReview => ({ kind: "none" }),
        writePreviousUsageReview: () => {},
        dismissUsageProposal: (dismiss) => ({
          kind: "usage-proposal-dismissed",
          key: usageProposalKey(dismiss),
        }),
      })
      return { manager, stub, entries }
    }

    it("ターンごとに、前の累計との差を1行ぶん渡す", async () => {
      const { stub, entries } = startTokenUsageManagerWithStub()
      await waitForBatch()

      stub.emit(SESSION_INFO)
      stub.emit({ kind: "token-usage", cumulative: cumulative(100, 20, 0.5) })
      stub.emit({ kind: "turn-finished", outcome: { kind: "completed" } })
      stub.emit({ kind: "token-usage", cumulative: cumulative(260, 35, 1.25) })
      stub.emit({ kind: "turn-finished", outcome: { kind: "completed" } })
      await waitForBatch()

      expect(entries).toEqual([
        {
          at: 1_000,
          sessionId: "claude-session-1",
          mode: "work",
          models: cumulative(100, 20, 0.5),
          breakdown: EMPTY_BREAKDOWN,
        },
        {
          at: 1_000,
          sessionId: "claude-session-1",
          mode: "work",
          models: cumulative(160, 15, 0.75),
          breakdown: EMPTY_BREAKDOWN,
        },
      ])
    })

    it("累計が振り出しに戻ったターンでも負を渡さない", async () => {
      const { stub, entries } = startTokenUsageManagerWithStub()
      await waitForBatch()

      stub.emit(SESSION_INFO)
      stub.emit({ kind: "token-usage", cumulative: cumulative(900, 300, 4) })
      // `/clear` で走行合計がリセットされたあとのターン。
      stub.emit({ kind: "conversation-cleared" })
      stub.emit({ kind: "token-usage", cumulative: cumulative(120, 40, 0.6) })
      await waitForBatch()

      expect(entries.map((entry) => entry.models)).toEqual([
        cumulative(900, 300, 4),
        cumulative(120, 40, 0.6),
      ])
    })

    it("増えていないターンは行を渡さない", async () => {
      const { stub, entries } = startTokenUsageManagerWithStub()
      await waitForBatch()

      stub.emit(SESSION_INFO)
      stub.emit({ kind: "token-usage", cumulative: cumulative(100, 20, 0.5) })
      stub.emit({ kind: "token-usage", cumulative: cumulative(100, 20, 0.5) })
      await waitForBatch()

      expect(entries.length).toBe(1)
    })

    it("雑談モードのターンは mode: chat になる", async () => {
      const { stub, entries } = startTokenUsageManagerWithStub()
      await waitForBatch()

      stub.emit(SESSION_INFO)
      stub.emit({ kind: "chat-mode-changed", chat: true })
      stub.emit({ kind: "token-usage", cumulative: cumulative(10, 2, 0.01) })
      await waitForBatch()

      expect(entries.map((entry) => entry.mode)).toEqual(["chat"])
    })

    it("復元で流し直されたぶんは記録しない", async () => {
      const { stub, entries } = startTokenUsageManagerWithStub()
      await waitForBatch()

      stub.emit(SESSION_INFO)
      stub.emitRestored([{ kind: "token-usage", cumulative: cumulative(100, 20, 0.5) }])
      await waitForBatch()

      expect(entries).toEqual([])
    })

    it("そのターンに使ったツールを、名前ごとに畳んで同じ行に入れる", async () => {
      const { stub, entries } = startTokenUsageManagerWithStub()
      await waitForBatch()

      stub.emit(SESSION_INFO)
      stub.emit({
        kind: "tool-started",
        toolUseId: "t-1",
        name: "Bash",
        input: { command: "架空のコマンド" },
        parentToolUseId: undefined,
      })
      stub.emit({ kind: "tool-finished", toolUseId: "t-1", content: "12345", isError: false })
      stub.emit({
        kind: "tool-started",
        toolUseId: "t-2",
        name: "Bash",
        input: { command: "架空のコマンド" },
        parentToolUseId: undefined,
      })
      stub.emit({ kind: "tool-finished", toolUseId: "t-2", content: "123", isError: false })
      stub.emit({ kind: "step-usage", messageId: "msg-1", scope: "main", usage: STEP_USAGE })
      stub.emit({ kind: "token-usage", cumulative: cumulative(100, 20, 0.5) })
      stub.emit({ kind: "turn-finished", outcome: { kind: "completed" } })
      await waitForBatch()

      expect(entries.map((written) => written.breakdown.main)).toEqual([
        { steps: 1, tokens: STEP_USAGE, tools: [{ name: "Bash", calls: 2, resultBytes: 8 }] },
      ])
      expect(entries.map((written) => written.breakdown.subagent)).toEqual([EMPTY_SCOPE])
    })

    it("サブエージェントの中のツールとステップは、同じ行の別立てに入る", async () => {
      const { stub, entries } = startTokenUsageManagerWithStub()
      await waitForBatch()

      stub.emit(SESSION_INFO)
      stub.emit({
        kind: "tool-started",
        toolUseId: "t-1",
        name: "Agent",
        input: { prompt: "架空の依頼" },
        parentToolUseId: undefined,
      })
      stub.emit({
        kind: "tool-started",
        toolUseId: "t-2",
        name: "Grep",
        input: { pattern: "架空の語" },
        parentToolUseId: "t-1",
      })
      stub.emit({ kind: "tool-finished", toolUseId: "t-2", content: "1234", isError: false })
      stub.emit({ kind: "step-usage", messageId: "msg-1", scope: "subagent", usage: STEP_USAGE })
      stub.emit({ kind: "tool-finished", toolUseId: "t-1", content: "123456", isError: false })
      stub.emit({ kind: "token-usage", cumulative: cumulative(100, 20, 0.5) })
      stub.emit({ kind: "turn-finished", outcome: { kind: "completed" } })
      await waitForBatch()

      expect(entries.map((written) => written.breakdown)).toEqual([
        {
          main: {
            steps: 0,
            tokens: EMPTY_SCOPE.tokens,
            tools: [{ name: "Agent", calls: 1, resultBytes: 6 }],
          },
          subagent: {
            steps: 1,
            tokens: STEP_USAGE,
            tools: [{ name: "Grep", calls: 1, resultBytes: 4 }],
          },
        },
      ])
    })

    it("内訳はターンごとに0から積む（前のターンのツールを持ち越さない）", async () => {
      const { stub, entries } = startTokenUsageManagerWithStub()
      await waitForBatch()

      stub.emit(SESSION_INFO)
      stub.emit({
        kind: "tool-started",
        toolUseId: "t-1",
        name: "Bash",
        input: {},
        parentToolUseId: undefined,
      })
      stub.emit({ kind: "tool-finished", toolUseId: "t-1", content: "12345", isError: false })
      stub.emit({ kind: "token-usage", cumulative: cumulative(100, 20, 0.5) })
      stub.emit({ kind: "turn-finished", outcome: { kind: "completed" } })
      stub.emit({ kind: "token-usage", cumulative: cumulative(200, 40, 1) })
      stub.emit({ kind: "turn-finished", outcome: { kind: "completed" } })
      await waitForBatch()

      expect(entries.map((written) => written.breakdown.main.tools)).toEqual([
        [{ name: "Bash", calls: 1, resultBytes: 5 }],
        [],
      ])
    })

    // この検査がいちばん重要（`docs/coding-standards.md`「会話内容の扱い」）。依頼の文面・
    // セリフ・ツールの引数・ツールの結果を同じターンに流しても、記録へ渡る1行にはそのどれも
    // 現れない。
    it("依頼の文面・セリフ・ツールの引数と結果が1文字も入らない", async () => {
      const { stub, entries } = startTokenUsageManagerWithStub()
      await waitForBatch()

      const secrets = [
        "架空の依頼の文面",
        "架空のセリフ",
        "架空のツールの引数",
        "架空のツールの結果",
        "架空の本文",
      ]
      stub.emit(SESSION_INFO)
      stub.emit({ kind: "request", text: secrets[0] ?? "", images: [] })
      stub.emit({
        kind: "tool-started",
        toolUseId: "t-1",
        name: "Bash",
        input: { command: secrets[2] },
        parentToolUseId: undefined,
      })
      stub.emit({
        kind: "tool-finished",
        toolUseId: "t-1",
        content: secrets[3] ?? "",
        isError: false,
      })
      stub.emit({ kind: "speech", text: secrets[1] ?? "", expression: "default" })
      stub.emit({ kind: "utterance", text: secrets[4] ?? "" })
      stub.emit({ kind: "token-usage", cumulative: cumulative(100, 20, 0.5) })
      stub.emit({ kind: "turn-finished", outcome: { kind: "completed" } })
      await waitForBatch()

      expect(entries.length).toBe(1)
      const written = JSON.stringify(entries)
      for (const secret of secrets) {
        expect(written).not.toContain(secret)
      }
    })
  })

  // コンテキストの内訳の記録（`ContextUsageRecord`）。1行 = 1セッションで、
  // 取れなかった回は次のターンで取り直すことを、ここで固定する。
  describe("コンテキストの内訳の記録", () => {
    function sessionInfo(sessionId: string): SessionEvent {
      return {
        kind: "session-info",
        sessionId,
        model: "opus",
        permissionMode: "auto",
        slashCommands: [],
        terminalSlashCommands: [],
      }
    }

    /**
     * 内訳の問い合わせが返す答えを差し替えて起こす。`reports` は呼ばれた順に返し、尽きたら
     * 最後のものを返し続ける（`stub.driver` の既定は常に「取れた」なので、取れない回を
     * 作るにはここで差し替える）。
     */
    function startContextUsageManagerWithStub(reports: readonly ContextUsageReport[]) {
      const stub = createStubDriver()
      const entries: ContextUsageEntry[] = []
      let asked = 0
      const driver: SessionDriver = {
        ...stub.driver,
        readContextUsage: () => {
          const report = reports[Math.min(asked, reports.length - 1)]
          asked += 1
          return Promise.resolve(report ?? UNAVAILABLE_CONTEXT_USAGE)
        },
      }
      const manager = createSessionManager({
        now: () => 1_000,
        openFile: () => Promise.resolve(true),
        readAchievementDay: () => Promise.resolve(undefined),
        batchIntervalMs: BATCH_MS,
        chatConsolidation: NO_CHAT_CONSOLIDATION,
        watchTasks: NO_TASK_WATCH,
        visit: NO_VISIT_PORTS,
        diary: NO_DIARY_WRITER,
        chatArchive: NOOP_CHAT_ARCHIVE,
        project: FICTIONAL_PROJECT,
        tokenUsageLog: NOOP_TOKEN_USAGE_LOG,
        experienceMetricLog: NOOP_EXPERIENCE_METRIC_LOG,
        contextUsageLog: {
          append: (entry) => {
            entries.push(entry)
          },
        },
        reportUsageLog: NOOP_REPORT_USAGE_LOG,
        promptImageShelf: createPromptImageShelf(),
        reportImageShelf: createReportImageShelf(),
        readReportImage: () => undefined,
        rememberSessionDefault: (sessionDefault) => ({
          kind: "session-default-changed",
          sessionDefault,
        }),
        rememberVisitEnabled: (visitEnabled) => ({
          kind: "visit-enabled-changed",
          visitEnabled,
        }),
        launchSession: (onEvent, onRestoredEvents) => {
          stub.attach(onEvent)
          stub.attachRestored(onRestoredEvents)
          return Promise.resolve(driver)
        },
        editCharacter: () => Promise.resolve(undefined),
        createCharacter: () => Promise.resolve(undefined),
        deleteCharacter: () => Promise.resolve(undefined),
        forgetRememberedLine: () => Promise.resolve(undefined),
        readPreviousUsageReview: (): PreviousUsageReview => ({ kind: "none" }),
        writePreviousUsageReview: () => {},
        dismissUsageProposal: (dismiss) => ({
          kind: "usage-proposal-dismissed",
          key: usageProposalKey(dismiss),
        }),
      })
      return { manager, stub, entries, asked: () => asked }
    }

    it("1つのセッションでは、ターンを何度終えても1行だけ書く", async () => {
      const { stub, entries, asked } = startContextUsageManagerWithStub([readyContextUsage()])
      await waitForBatch()

      stub.emit(sessionInfo("claude-session-1"))
      stub.emit({ kind: "turn-finished", outcome: { kind: "completed" } })
      await waitForBatch()
      stub.emit({ kind: "turn-finished", outcome: { kind: "completed" } })
      stub.emit({ kind: "turn-finished", outcome: { kind: "completed" } })
      await waitForBatch()

      expect(entries).toEqual([
        { at: 1_000, sessionId: "claude-session-1", mode: "work", usage: contextUsage() },
      ])
      // 書いたあとは問い合わせにも行かない。
      expect(asked()).toBe(1)
    })

    it("claude 側のセッションIDが変われば、もう1行書く", async () => {
      const { stub, entries } = startContextUsageManagerWithStub([readyContextUsage()])
      await waitForBatch()

      stub.emit(sessionInfo("claude-session-1"))
      stub.emit({ kind: "turn-finished", outcome: { kind: "completed" } })
      await waitForBatch()
      stub.emit(sessionInfo("claude-session-2"))
      stub.emit({ kind: "turn-finished", outcome: { kind: "completed" } })
      await waitForBatch()

      expect(entries.map((entry) => entry.sessionId)).toEqual([
        "claude-session-1",
        "claude-session-2",
      ])
    })

    it("内訳が取れなかったターンは書かず、次のターンで取り直す", async () => {
      const { stub, entries } = startContextUsageManagerWithStub([
        UNAVAILABLE_CONTEXT_USAGE,
        readyContextUsage(),
      ])
      await waitForBatch()

      stub.emit(sessionInfo("claude-session-1"))
      stub.emit({ kind: "turn-finished", outcome: { kind: "completed" } })
      await waitForBatch()

      expect(entries).toEqual([])

      stub.emit({ kind: "turn-finished", outcome: { kind: "completed" } })
      await waitForBatch()

      expect(entries.map((entry) => entry.sessionId)).toEqual(["claude-session-1"])
    })

    it("claude 側のセッションIDが分からないうちは書かない", async () => {
      const { stub, entries, asked } = startContextUsageManagerWithStub([readyContextUsage()])
      await waitForBatch()

      stub.emit({ kind: "turn-finished", outcome: { kind: "completed" } })
      await waitForBatch()

      expect(entries).toEqual([])
      expect(asked()).toBe(0)
    })

    it("雑談モードのセッションは mode: chat で書く", async () => {
      const { stub, entries } = startContextUsageManagerWithStub([readyContextUsage()])
      await waitForBatch()

      stub.emit(sessionInfo("claude-session-1"))
      stub.emit({ kind: "chat-mode-changed", chat: true })
      stub.emit({ kind: "turn-finished", outcome: { kind: "completed" } })
      await waitForBatch()

      expect(entries.map((entry) => entry.mode)).toEqual(["chat"])
    })

    it("復元で流し直されたターンでは書かない", async () => {
      const { stub, entries } = startContextUsageManagerWithStub([readyContextUsage()])
      await waitForBatch()

      stub.emit(sessionInfo("claude-session-1"))
      stub.emitRestored([{ kind: "turn-finished", outcome: { kind: "completed" } }])
      await waitForBatch()

      expect(entries).toEqual([])
    })
  })

  // `report` の塊の使われ方の記録。描いた（差し戻されなかった）report だけが1行になることを
  // ここで固定する（docs/research/report-block.md「回し方（数えて足す・外す）」）。
  describe("report の塊の使われ方の記録", () => {
    function sessionInfo(sessionId: string): SessionEvent {
      return {
        kind: "session-info",
        sessionId,
        model: "opus",
        permissionMode: "auto",
        slashCommands: [],
        terminalSlashCommands: [],
      }
    }

    /** 描いた `report` の `SessionEvent`（中身はすべて手で書いた架空のもの）。 */
    function reportEvent(sections: readonly ReportSection[], unknownBlockCount = 0): SessionEvent {
      return {
        kind: "report",
        toolUseId: "toolu_r1",
        conclusion: "架空の結論。",
        sections,
        favor: "",
        checks: [],
        closing: { kind: "none" },
        unknownBlockCount,
        sessionSummary: undefined,
        task: { kind: "none" },
      }
    }

    function startReportUsageManagerWithStub() {
      const stub = createStubDriver()
      const entries: ReportUsageEntry[] = []
      const manager = createSessionManager({
        now: () => 1_000,
        openFile: () => Promise.resolve(true),
        readAchievementDay: () => Promise.resolve(undefined),
        batchIntervalMs: BATCH_MS,
        chatConsolidation: NO_CHAT_CONSOLIDATION,
        watchTasks: NO_TASK_WATCH,
        visit: NO_VISIT_PORTS,
        diary: NO_DIARY_WRITER,
        chatArchive: NOOP_CHAT_ARCHIVE,
        project: FICTIONAL_PROJECT,
        tokenUsageLog: NOOP_TOKEN_USAGE_LOG,
        experienceMetricLog: NOOP_EXPERIENCE_METRIC_LOG,
        contextUsageLog: NOOP_CONTEXT_USAGE_LOG,
        reportUsageLog: {
          append: (entry) => {
            entries.push(entry)
          },
        },
        promptImageShelf: createPromptImageShelf(),
        reportImageShelf: createReportImageShelf(),
        readReportImage: () => undefined,
        rememberSessionDefault: (sessionDefault) => ({
          kind: "session-default-changed",
          sessionDefault,
        }),
        rememberVisitEnabled: (visitEnabled) => ({
          kind: "visit-enabled-changed",
          visitEnabled,
        }),
        launchSession: (onEvent, onRestoredEvents) => {
          stub.attach(onEvent)
          stub.attachRestored(onRestoredEvents)
          return Promise.resolve(stub.driver)
        },
        editCharacter: () => Promise.resolve(undefined),
        createCharacter: () => Promise.resolve(undefined),
        deleteCharacter: () => Promise.resolve(undefined),
        forgetRememberedLine: () => Promise.resolve(undefined),
        readPreviousUsageReview: (): PreviousUsageReview => ({ kind: "none" }),
        writePreviousUsageReview: () => {},
        dismissUsageProposal: (dismiss) => ({
          kind: "usage-proposal-dismissed",
          key: usageProposalKey(dismiss),
        }),
      })
      return { manager, stub, entries }
    }

    it("描いた report のたびに、塊の種類と時刻・セッションIDを1行書く", async () => {
      const { stub, entries } = startReportUsageManagerWithStub()
      await waitForBatch()

      stub.emit(sessionInfo("claude-session-1"))
      stub.emit(
        reportEvent([{ heading: "", blocks: [{ kind: "text", text: "架空の根拠。", fold: "" }] }]),
      )
      await waitForBatch()

      expect(entries).toEqual([
        {
          at: 1_000,
          sessionId: "claude-session-1",
          blockKinds: ["text"],
          blockFields: [],
          notations: [],
          containedNotations: [],
          escapeNotations: [],
          unknownBlockCount: 0,
          sessionSummary: undefined,
        },
      ])
    })

    it("claude 側のセッションIDが分からないうちは書かない", async () => {
      const { stub, entries } = startReportUsageManagerWithStub()
      await waitForBatch()

      stub.emit(reportEvent([]))
      await waitForBatch()

      expect(entries).toEqual([])
    })

    it("復元で流し直された report では書かない", async () => {
      const { stub, entries } = startReportUsageManagerWithStub()
      await waitForBatch()

      stub.emit(sessionInfo("claude-session-1"))
      stub.emitRestored([reportEvent([])])
      await waitForBatch()

      expect(entries).toEqual([])
    })
  })
})

describe("依頼に添えた画像の棚", () => {
  // 原寸は手で組んだ大きめの架空の data URL（実物の画像は使わない）。hello に載っていれば
  // 長さで分かるように、控えより桁違いに長くしてある。
  function fullImage(label: string): PromptImage {
    return {
      full: `data:image/png;base64,${label.repeat(4096)}`,
      thumbnail: `data:image/png;base64,${label}`,
    }
  }

  /**
   * 本物の駆動と同じく、`prompt` を受けたら控えと id だけを `request` として流す駆動。
   * 受け取った画像（原寸と id つき）も覚える。
   */
  function startManagerWithShelf() {
    const shelf: PromptImageShelf = createPromptImageShelf()
    const prompted: ShelvedPromptImage[][] = []
    const manager = createSessionManager({
      now: () => 1_000,
      openFile: () => Promise.resolve(true),
      readAchievementDay: () => Promise.resolve(undefined),
      batchIntervalMs: BATCH_MS,
      chatConsolidation: NO_CHAT_CONSOLIDATION,
      watchTasks: NO_TASK_WATCH,
      visit: NO_VISIT_PORTS,
      diary: NO_DIARY_WRITER,
      chatArchive: NOOP_CHAT_ARCHIVE,
      project: FICTIONAL_PROJECT,
      tokenUsageLog: NOOP_TOKEN_USAGE_LOG,
      experienceMetricLog: NOOP_EXPERIENCE_METRIC_LOG,
      contextUsageLog: NOOP_CONTEXT_USAGE_LOG,
      reportUsageLog: NOOP_REPORT_USAGE_LOG,
      promptImageShelf: shelf,
      reportImageShelf: createReportImageShelf(),
      readReportImage: () => undefined,
      rememberSessionDefault: (sessionDefault) => ({
        kind: "session-default-changed",
        sessionDefault,
      }),
      rememberVisitEnabled: (visitEnabled) => ({
        kind: "visit-enabled-changed",
        visitEnabled,
      }),
      launchSession: (onEvent) => {
        const stub = createStubDriver()
        stub.attach(onEvent)
        return Promise.resolve({
          ...stub.driver,
          prompt: (text: string, images: readonly ShelvedPromptImage[]) => {
            prompted.push([...images])
            onEvent({ kind: "request", text, images: recordedPromptImages(images) })
            onEvent({ kind: "turn-finished", outcome: { kind: "completed" } })
          },
        })
      },
      editCharacter: () => Promise.resolve(undefined),
      createCharacter: () => Promise.resolve(undefined),
      deleteCharacter: () => Promise.resolve(undefined),
      forgetRememberedLine: () => Promise.resolve(undefined),
      readPreviousUsageReview: (): PreviousUsageReview => ({ kind: "none" }),
      writePreviousUsageReview: () => {},
      dismissUsageProposal: (dismiss) => ({
        kind: "usage-proposal-dismissed",
        key: usageProposalKey(dismiss),
      }),
    })
    const prompt = (images: readonly PromptImage[]) =>
      manager.commands.session.prompt({ text: "架空の依頼", images })
    return { manager, shelf, prompted, prompt }
  }

  function helloOf(frames: readonly ServerFrame[]): string {
    const hello = frames.find((frame) => frame.type === "hello")
    return JSON.stringify(hello)
  }

  it("hello には控えと id だけが載り、原寸の枚数に比例して大きくならない", async () => {
    const one = startManagerWithShelf()
    await one.prompt([fullImage("A")])
    const two = startManagerWithShelf()
    await two.prompt([fullImage("A"), fullImage("B")])
    await two.prompt([fullImage("C"), fullImage("D")])

    const oneFrames: ServerFrame[] = []
    one.manager.subscribe((frame) => oneFrames.push(frame))
    const twoFrames: ServerFrame[] = []
    two.manager.subscribe((frame) => twoFrames.push(frame))

    const oneHello = helloOf(oneFrames)
    const twoHello = helloOf(twoFrames)
    expect(oneHello).not.toContain(fullImage("A").full)
    expect(twoHello).not.toContain(fullImage("D").full)
    expect(twoHello).toContain(fullImage("D").thumbnail)
    // 原寸（1枚 16 KiB 強）が1枚でも載れば、この差には収まらない。
    expect(twoHello.length - oneHello.length).toBeLessThan(fullImage("A").full.length)
  })

  it("記録の窓から依頼が落ちたら、その原寸を棚から捨てる", async () => {
    const { shelf, prompted, prompt } = startManagerWithShelf()

    await prompt([fullImage("old")])
    const oldId = prompted[0]?.[0]?.id ?? ""
    expect(shelf.find(oldId)).toBeDefined()

    // 仕事の窓は MAX_SESSION_STATE_TURNS.work ターン。画像の無い依頼で押し出す。
    for (let turn = 0; turn < MAX_SESSION_STATE_TURNS.work; turn += 1) {
      await prompt([])
    }

    expect(shelf.find(oldId)).toBeUndefined()
  })

  it("起こし直して記録が空に戻ったら、それまでの原寸を棚から捨てる", async () => {
    const { manager, shelf, prompted, prompt } = startManagerWithShelf()

    await prompt([fullImage("A")])
    const id = prompted[0]?.[0]?.id ?? ""
    expect(shelf.find(id)).toBeDefined()

    await manager.commands.session.switchCharacter({ name: "fictional" })

    expect(shelf.find(id)).toBeUndefined()
  })
})

describe("レポートの画像の棚", () => {
  // 画像は架空のバイト列（実物の画像は使わない）。
  const FICTIONAL_IMAGE: ReportImage = {
    mediaType: "image/png",
    content: new Uint8Array([1, 2, 3]),
  }

  function imageReportEvent(toolUseId: string): SessionEvent {
    return {
      kind: "report",
      toolUseId,
      conclusion: "架空の結論。",
      sections: [
        {
          heading: "",
          blocks: [{ kind: "image", path: "fictional/after.png", caption: "", fold: "" }],
        },
      ],
      favor: "",
      checks: [],
      closing: { kind: "none" },
      unknownBlockCount: 0,
      sessionSummary: undefined,
      task: { kind: "none" },
    }
  }

  function startManagerWithReportImageShelf() {
    const stub = createStubDriver()
    const shelf = createReportImageShelf()
    const readPaths: string[] = []
    const manager = createSessionManager({
      now: () => 1_000,
      openFile: () => Promise.resolve(true),
      readAchievementDay: () => Promise.resolve(undefined),
      batchIntervalMs: BATCH_MS,
      chatConsolidation: NO_CHAT_CONSOLIDATION,
      watchTasks: NO_TASK_WATCH,
      visit: NO_VISIT_PORTS,
      diary: NO_DIARY_WRITER,
      chatArchive: NOOP_CHAT_ARCHIVE,
      project: FICTIONAL_PROJECT,
      tokenUsageLog: NOOP_TOKEN_USAGE_LOG,
      experienceMetricLog: NOOP_EXPERIENCE_METRIC_LOG,
      contextUsageLog: NOOP_CONTEXT_USAGE_LOG,
      reportUsageLog: NOOP_REPORT_USAGE_LOG,
      promptImageShelf: createPromptImageShelf(),
      reportImageShelf: shelf,
      readReportImage: (path) => {
        readPaths.push(path)
        return FICTIONAL_IMAGE
      },
      rememberSessionDefault: (sessionDefault) => ({
        kind: "session-default-changed",
        sessionDefault,
      }),
      rememberVisitEnabled: (visitEnabled) => ({ kind: "visit-enabled-changed", visitEnabled }),
      launchSession: (onEvent, onRestoredEvents) => {
        stub.attach(onEvent)
        stub.attachRestored(onRestoredEvents)
        return Promise.resolve(stub.driver)
      },
      editCharacter: () => Promise.resolve(undefined),
      createCharacter: () => Promise.resolve(undefined),
      deleteCharacter: () => Promise.resolve(undefined),
      forgetRememberedLine: () => Promise.resolve(undefined),
      readPreviousUsageReview: (): PreviousUsageReview => ({ kind: "none" }),
      writePreviousUsageReview: () => {},
      dismissUsageProposal: (dismiss) => ({
        kind: "usage-proposal-dismissed",
        key: usageProposalKey(dismiss),
      }),
    })
    return { manager, stub, shelf, readPaths }
  }

  it("駆動から届いた report の画像を棚に置き、復元の再生では読まない", async () => {
    const { stub, shelf, readPaths } = startManagerWithReportImageShelf()
    await waitForBatch()

    stub.emitRestored([imageReportEvent("toolu_restored")])
    stub.emit(imageReportEvent("toolu_live"))
    await waitForBatch()

    expect(readPaths).toEqual(["fictional/after.png"])
    expect(shelf.find("toolu_live", "fictional/after.png")).toEqual(FICTIONAL_IMAGE)
    expect(shelf.find("toolu_restored", "fictional/after.png")).toBeUndefined()
  })

  it("起こし直して記録からレポートが消えたら、その画像を棚から捨てる", async () => {
    const { manager, stub, shelf } = startManagerWithReportImageShelf()
    await waitForBatch()
    stub.emit(imageReportEvent("toolu_live"))
    await waitForBatch()

    await manager.commands.session.switchCharacter({ name: "fictional" })

    expect(shelf.find("toolu_live", "fictional/after.png")).toBeUndefined()
  })
})

describe("createSessionManager（見直し）", () => {
  it("受け付けた見直しの結果は events で画面へ届き、次の hello の姿も結果になる", async () => {
    const { manager, stub } = startManagerWithStub()
    const frames: ServerFrame[] = []
    manager.subscribe((frame) => frames.push(frame))
    const findings = {
      days: 7,
      headline: "架空の冒頭の一言。",
      proposals: [
        {
          kind: "session-length",
          target: "",
          impact: "medium",
          title: "架空の見出し",
          basis: "架空の根拠",
          action: "架空のやること",
          followUp: "delegate",
        },
      ],
    } as const

    stub.emit({ kind: "usage-review-result", findings })
    await waitForBatch()

    expect(frames.filter((frame) => frame.type === "events")).toEqual([
      { type: "events", events: [{ at: 1_000, event: { kind: "usage-review-result", findings } }] },
    ])
    const later: ServerFrame[] = []
    manager.subscribe((frame) => later.push(frame))
    const [hello] = later
    expect(hello?.type === "hello" ? hello.state.usageReview : undefined).toEqual({
      kind: "result",
      reviewedAt: 1_000,
      findings,
    })
  })

  it("受け付けた見直しの結果は previousUsageReview にも同時に載る（ホームへ書く口も1回呼ぶ）", async () => {
    const { manager, stub, writtenPreviousUsageReviews } = startManagerWithStub()
    const findings = {
      days: 7,
      headline: "架空の冒頭の一言。",
      proposals: [],
    } as const

    stub.emit({ kind: "usage-review-result", findings })
    await waitForBatch()

    const frames: ServerFrame[] = []
    manager.subscribe((frame) => frames.push(frame))
    const [hello] = frames
    expect(hello?.type === "hello" ? hello.state.previousUsageReview : undefined).toEqual({
      kind: "found",
      reviewedAt: 1_000,
      findings,
    })
    expect(writtenPreviousUsageReviews).toEqual([[1_000, findings]])
  })

  it("起こしたときにホームから読んだ前回の結果が、最初の hello の previousUsageReview になる", () => {
    const previous = {
      kind: "found" as const,
      reviewedAt: 500,
      findings: { days: 7, headline: "架空の前回の一言。", proposals: [] },
    }
    const manager = createSessionManager({
      now: () => 1_000,
      openFile: () => Promise.resolve(true),
      readAchievementDay: () => Promise.resolve(undefined),
      batchIntervalMs: BATCH_MS,
      chatConsolidation: NO_CHAT_CONSOLIDATION,
      watchTasks: NO_TASK_WATCH,
      visit: NO_VISIT_PORTS,
      diary: NO_DIARY_WRITER,
      chatArchive: NOOP_CHAT_ARCHIVE,
      project: FICTIONAL_PROJECT,
      tokenUsageLog: NOOP_TOKEN_USAGE_LOG,
      experienceMetricLog: NOOP_EXPERIENCE_METRIC_LOG,
      contextUsageLog: NOOP_CONTEXT_USAGE_LOG,
      reportUsageLog: NOOP_REPORT_USAGE_LOG,
      promptImageShelf: createPromptImageShelf(),
      reportImageShelf: createReportImageShelf(),
      readReportImage: () => undefined,
      rememberSessionDefault: (sessionDefault) => ({
        kind: "session-default-changed",
        sessionDefault,
      }),
      rememberVisitEnabled: (visitEnabled) => ({
        kind: "visit-enabled-changed",
        visitEnabled,
      }),
      launchSession: () => Promise.resolve(createStubDriver().driver),
      editCharacter: () => Promise.resolve(undefined),
      createCharacter: () => Promise.resolve(undefined),
      deleteCharacter: () => Promise.resolve(undefined),
      forgetRememberedLine: () => Promise.resolve(undefined),
      readPreviousUsageReview: (): PreviousUsageReview => previous,
      writePreviousUsageReview: () => {},
      dismissUsageProposal: (dismiss) => ({
        kind: "usage-proposal-dismissed",
        key: usageProposalKey(dismiss),
      }),
    })

    const frames: ServerFrame[] = []
    manager.subscribe((frame) => frames.push(frame))
    const [hello] = frames

    expect(hello?.type === "hello" ? hello.state.previousUsageReview : undefined).toEqual(previous)
  })

  it("起こし直しても previousUsageReview は残る（usageReview はふだんへ戻る）", async () => {
    const { manager, stub } = startManagerWithStub()
    const findings = { days: 7, headline: "架空の一言。", proposals: [] } as const
    stub.emit({ kind: "usage-review-result", findings })
    await waitForBatch()

    await manager.commands.session.switchCharacter({ name: "fictional" })

    const frames: ServerFrame[] = []
    manager.subscribe((frame) => frames.push(frame))
    const [hello] = frames
    expect(hello?.type === "hello" ? hello.state.usageReview : undefined).toEqual({ kind: "idle" })
    expect(hello?.type === "hello" ? hello.state.previousUsageReview : undefined).toEqual({
      kind: "found",
      reviewedAt: 1_000,
      findings,
    })
  })

  it("見送るとホームへ書く口が1回呼ばれ、いまの結果と前回の提案の両方から取り除かれる", async () => {
    const { manager, stub, dismissedUsageProposals } = startManagerWithStub()
    const dismissed = {
      kind: "session-length",
      target: "",
      impact: "medium",
      title: "見送られる提案",
      basis: "架空の根拠",
      action: "架空のやること",
      followUp: "delegate",
    } as const
    const kept = {
      ...dismissed,
      kind: "model-choice",
      target: "sonnet",
      title: "残る提案",
    } as const
    const findings = { days: 7, headline: "架空の一言。", proposals: [dismissed, kept] } as const
    stub.emit({ kind: "usage-review-result", findings })
    await waitForBatch()

    const result = await manager.commands.usageReview.dismissProposal({
      kind: dismissed.kind,
      target: dismissed.target,
    })

    expect(result).toEqual({ ok: true })
    expect(dismissedUsageProposals).toEqual([
      {
        kind: dismissed.kind,
        target: dismissed.target,
      },
    ])

    const frames: ServerFrame[] = []
    manager.subscribe((frame) => frames.push(frame))
    const [hello] = frames
    const state = hello?.type === "hello" ? hello.state : undefined
    expect(state?.usageReview).toEqual({
      kind: "result",
      reviewedAt: 1_000,
      findings: { ...findings, proposals: [kept] },
    })
    expect(state?.previousUsageReview).toEqual({
      kind: "found",
      reviewedAt: 1_000,
      findings: { ...findings, proposals: [kept] },
    })
  })
})

describe("タスク一覧の見張り", () => {
  const KNOWN_TASKS = { kind: "known", items: [] } as const

  /** 見張りの起こす・閉じるを数え、流す口を手で握る session-manager。 */
  function startManagerWithTaskWatch() {
    const watchingCalls: boolean[] = []
    const watch = {
      started: 0,
      closed: 0,
      watching: watchingCalls,
      emit: (_event: SessionEvent): void => {},
    }
    const manager = createSessionManager({
      now: () => 1_000,
      openFile: () => Promise.resolve(true),
      readAchievementDay: () => Promise.resolve(undefined),
      batchIntervalMs: BATCH_MS,
      chatConsolidation: NO_CHAT_CONSOLIDATION,
      watchTasks: (onEvent) => {
        watch.started += 1
        watch.emit = onEvent
        return {
          close: () => {
            watch.closed += 1
          },
          setWatching: (watching) => {
            watch.watching.push(watching)
          },
        }
      },
      visit: NO_VISIT_PORTS,
      diary: NO_DIARY_WRITER,
      chatArchive: NOOP_CHAT_ARCHIVE,
      project: FICTIONAL_PROJECT,
      tokenUsageLog: NOOP_TOKEN_USAGE_LOG,
      experienceMetricLog: NOOP_EXPERIENCE_METRIC_LOG,
      contextUsageLog: NOOP_CONTEXT_USAGE_LOG,
      reportUsageLog: NOOP_REPORT_USAGE_LOG,
      promptImageShelf: createPromptImageShelf(),
      reportImageShelf: createReportImageShelf(),
      readReportImage: () => undefined,
      rememberSessionDefault: (sessionDefault) => ({
        kind: "session-default-changed",
        sessionDefault,
      }),
      rememberVisitEnabled: (visitEnabled) => ({
        kind: "visit-enabled-changed",
        visitEnabled,
      }),
      launchSession: () => Promise.resolve(createStubDriver().driver),
      editCharacter: () => Promise.resolve(undefined),
      createCharacter: () => Promise.resolve(undefined),
      deleteCharacter: () => Promise.resolve(undefined),
      forgetRememberedLine: () => Promise.resolve(undefined),
      readPreviousUsageReview: (): PreviousUsageReview => ({ kind: "none" }),
      writePreviousUsageReview: () => {},
      dismissUsageProposal: (dismiss) => ({
        kind: "usage-proposal-dismissed",
        key: usageProposalKey(dismiss),
      }),
    })
    return { manager, watch }
  }

  it("見張りは起こし直しをまたいで1つだけ動き、セッションを閉じたときに閉じる", async () => {
    const { manager, watch } = startManagerWithTaskWatch()

    await manager.commands.session.setChatMode({ chat: true })
    await manager.commands.session.setChatMode({ chat: false })
    expect(watch).toMatchObject({ started: 1, closed: 0 })

    manager.close()
    expect(watch).toMatchObject({ started: 1, closed: 1 })
  })

  it("画面の購読が0から1になったときに見張りを動かし、最後の1人が抜けたときに止める", () => {
    const { manager, watch } = startManagerWithTaskWatch()
    expect(watch.watching.at(-1)).toBeUndefined()

    const first = manager.subscribe(() => {})
    const second = manager.subscribe(() => {})
    expect(watch.watching.at(-1)).toBe(true)
    first()
    expect(watch.watching.at(-1)).toBe(true)
    second()
    expect(watch.watching.at(-1)).toBe(false)
  })

  it("起こし直しの hello にそれまでのタスク一覧が残り、そのあと届いた一覧も新しい代に入る", async () => {
    const { manager, watch } = startManagerWithTaskWatch()
    watch.emit({ kind: "tasks-changed", tasks: KNOWN_TASKS })

    await manager.commands.session.setChatMode({ chat: true })
    const afterRestart: ServerFrame[] = []
    manager.subscribe((frame) => afterRestart.push(frame))
    const [hello] = afterRestart
    expect(hello?.type === "hello" ? hello.state.tasks : undefined).toEqual(KNOWN_TASKS)

    watch.emit({ kind: "tasks-changed", tasks: { kind: "unknown" } })
    await waitForBatch()
    const later: ServerFrame[] = []
    manager.subscribe((frame) => later.push(frame))
    const [laterHello] = later
    expect(laterHello?.type === "hello" ? laterHello.state.tasks : undefined).toEqual({
      kind: "unknown",
    })
  })
})

describe("訪問", () => {
  const SCRIPT: VisitScript = [
    { speaker: "guest", expression: "curious", text: "架空の客の一言目" },
    { speaker: "host", expression: "sad", text: "架空のあるじの返事" },
    { speaker: "guest", expression: "bored", text: "架空の客の二言目" },
  ]
  const GUESTS: readonly VisitGuest[] = [
    {
      pack: "fictional-guest",
      visit: { peek: undefined, farewell: ["架空の帰りの一言"], scripts: [SCRIPT] },
    },
  ]

  /** 手で進める時計で訪問を回す session-manager（`guests` が空なら客は来ない）。 */
  function startManagerWithVisit(guests: readonly VisitGuest[]) {
    const manual = createManualClock()
    const drivers: StubDriver[] = []
    const manager = createSessionManager({
      now: manual.now,
      openFile: () => Promise.resolve(true),
      readAchievementDay: () => Promise.resolve(undefined),
      batchIntervalMs: BATCH_MS,
      chatConsolidation: NO_CHAT_CONSOLIDATION,
      watchTasks: NO_TASK_WATCH,
      visit: {
        timing: VISIT_TIMING,
        clock: manual.clock,
        listGuests: () => guests,
        random: () => 0,
        scriptSource: { kind: "pack-only" },
      },
      diary: NO_DIARY_WRITER,
      chatArchive: NOOP_CHAT_ARCHIVE,
      project: FICTIONAL_PROJECT,
      tokenUsageLog: NOOP_TOKEN_USAGE_LOG,
      experienceMetricLog: NOOP_EXPERIENCE_METRIC_LOG,
      contextUsageLog: NOOP_CONTEXT_USAGE_LOG,
      reportUsageLog: NOOP_REPORT_USAGE_LOG,
      promptImageShelf: createPromptImageShelf(),
      reportImageShelf: createReportImageShelf(),
      readReportImage: () => undefined,
      rememberSessionDefault: (sessionDefault) => ({
        kind: "session-default-changed",
        sessionDefault,
      }),
      rememberVisitEnabled: (visitEnabled) => ({
        kind: "visit-enabled-changed",
        visitEnabled,
      }),
      launchSession: (onEvent) => {
        const stub = createStubDriver()
        stub.attach(onEvent)
        drivers.push(stub)
        return Promise.resolve(stub.driver)
      },
      editCharacter: () => Promise.resolve(undefined),
      createCharacter: () => Promise.resolve(undefined),
      deleteCharacter: () => Promise.resolve(undefined),
      forgetRememberedLine: () => Promise.resolve(undefined),
      readPreviousUsageReview: (): PreviousUsageReview => ({ kind: "none" }),
      writePreviousUsageReview: () => {},
      dismissUsageProposal: (dismiss) => ({
        kind: "usage-proposal-dismissed",
        key: usageProposalKey(dismiss),
      }),
    })
    const emit = (event: SessionEvent): void => {
      drivers.at(-1)?.emit(event)
    }
    /** いまの snapshot（接続し直したタブが受け取る `hello` の状態）。 */
    const snapshot = (): SessionState => {
      const frames: ServerFrame[] = []
      manager.subscribe((frame) => frames.push(frame))()
      const [hello] = frames
      if (hello?.type !== "hello") {
        throw new Error("hello が届いていない")
      }
      return hello.state
    }
    return { manager, emit, snapshot, advance: manual.advance, pendingTimers: manual.pending }
  }

  /** ツールを走らせたまま、訪問が来るしきい値まで待つところまで進める。 */
  function waitForVisit(run: ReturnType<typeof startManagerWithVisit>): void {
    run.emit(CHARACTER_EVENT)
    run.emit({ kind: "request", text: "架空の依頼", images: [] })
    run.emit({ kind: "speech", text: "架空の前のセリフ", expression: "proud" })
    run.emit({
      kind: "tool-started",
      toolUseId: "fictional-tool-1",
      name: "Bash",
      input: { command: "fictional-long-command" },
      parentToolUseId: undefined,
    })
    run.advance(VISIT_TIMING.waitMs)
  }

  it("接続し直したタブの snapshot には、いま出している台本の行がそのまま載る", async () => {
    const run = startManagerWithVisit(GUESTS)
    await Promise.resolve()
    waitForVisit(run)

    run.advance(VISIT_LINE_MIN_INTERVAL_MS)

    expect(run.snapshot().visit).toEqual({
      kind: "visiting",
      guest: "fictional-guest",
      script: SCRIPT,
      line: 1,
      farewell: "架空の帰りの一言",
    })
  })

  it("訪問の最中に speak が届くと帰り、speechExpression と records は訪問が無かったときと同じ", async () => {
    const visited = startManagerWithVisit(GUESTS)
    const unvisited = startManagerWithVisit([])
    await Promise.resolve()
    const speech: SessionEvent = {
      kind: "speech",
      text: "架空の新しいセリフ",
      expression: "flustered",
    }

    for (const run of [visited, unvisited]) {
      waitForVisit(run)
      run.advance(VISIT_LINE_MIN_INTERVAL_MS)
    }
    const during = visited.snapshot()
    for (const run of [visited, unvisited]) {
      run.emit(speech)
    }
    const after = visited.snapshot()
    const without = unvisited.snapshot()

    expect(during.visit.kind).toBe("visiting")
    expect(during.speechExpression).toBe("proud")
    expect(after.visit).toEqual({
      kind: "left",
      guest: "fictional-guest",
      farewell: "架空の帰りの一言",
      leftAt: VISIT_TIMING.waitMs + VISIT_LINE_MIN_INTERVAL_MS,
    })
    expect(after.speechExpression).toBe("flustered")
    expect({ ...after, visit: without.visit }).toEqual(without)
  })

  it("起こし直すと訪問は消え、前の代の時計はもう何も起こさない", async () => {
    const run = startManagerWithVisit(GUESTS)
    await Promise.resolve()
    // ターン中は切り替えを断るので、背景のタスクだけが動いている待ち（信号 A）で来させる。
    run.emit(CHARACTER_EVENT)
    run.emit({ kind: "request", text: "架空の依頼", images: [] })
    run.emit({
      kind: "background-tasks-changed",
      tasks: [{ taskId: "fictional-bg-1", kind: "shell", description: "架空の待ち" }],
    })
    run.emit({ kind: "turn-finished", outcome: { kind: "completed" } })
    run.advance(VISIT_TIMING.waitMs)
    expect(run.snapshot().visit.kind).toBe("visiting")

    await run.manager.commands.session.switchCharacter({ name: "fictional" })
    run.advance(VISIT_LINE_MIN_INTERVAL_MS * 10)

    expect(run.snapshot().visit).toEqual({ kind: "none" })
    expect(run.pendingTimers()).toBe(0)
  })

  // 歯車の「訪問」のオン・オフ（`docs/architecture/screen-design.md`「設定の置き場所」「画面のナビゲーション」）。
  it("歯車をオフにすると訪問中でもその場で帰り、visitEnabled も画面へ流れる", async () => {
    const run = startManagerWithVisit(GUESTS)
    await Promise.resolve()
    waitForVisit(run)
    run.advance(VISIT_LINE_MIN_INTERVAL_MS)
    expect(run.snapshot().visit.kind).toBe("visiting")

    const result = await run.manager.commands.visit.setEnabled({ enabled: false })

    expect(result).toEqual({ ok: true })
    const after = run.snapshot()
    expect(after.visitEnabled).toBe(false)
    expect(after.visit).toEqual({
      kind: "left",
      guest: "fictional-guest",
      farewell: "架空の帰りの一言",
      leftAt: VISIT_TIMING.waitMs + VISIT_LINE_MIN_INTERVAL_MS,
    })
  })

  it("歯車がオフのあいだは、しきい値に届いても来ない", async () => {
    const run = startManagerWithVisit(GUESTS)
    await Promise.resolve()
    await run.manager.commands.visit.setEnabled({ enabled: false })

    waitForVisit(run)

    expect(run.snapshot().visit).toEqual({ kind: "none" })
  })
})
