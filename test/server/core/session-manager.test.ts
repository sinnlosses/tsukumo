import { describe, expect, it } from "bun:test"

import { type CharacterSelection } from "../../../src/server/core/character-selection.ts"
import { CHAT_NUDGE_PROMPT } from "../../../src/server/core/chat-nudge.ts"
import {
  type ContextUsageEntry,
  type ContextUsageLog,
} from "../../../src/server/core/context-usage.ts"
import {
  createPromptImageShelf,
  type PromptImageShelf,
  recordedPromptImages,
  type ShelvedPromptImage,
} from "../../../src/server/core/prompt-image-shelf.ts"
import {
  type ChatArchive,
  type ChatArchiveEntry,
  type SessionDriver,
} from "../../../src/server/core/session-driver.ts"
import { type SessionLaunchRequest } from "../../../src/server/core/session-launch.ts"
import { createSessionManager } from "../../../src/server/core/session-manager.ts"
import { type TokenUsageEntry, type TokenUsageLog } from "../../../src/server/core/token-usage.ts"
import { CHAT_COMPACT_THRESHOLD_BYTES } from "../../../src/shared/chat-log.ts"
import {
  type CharacterCreateCommand,
  type CharacterDeleteCommand,
  type CharacterEditCommand,
  type DismissUsageProposalCommand,
} from "../../../src/shared/command.ts"
import {
  type ContextUsageReport,
  UNAVAILABLE_CONTEXT_USAGE,
} from "../../../src/shared/context-usage.ts"
import {
  FRAME_ERROR_REASON,
  PROTOCOL_VERSION,
  type ServerFrame,
} from "../../../src/shared/frame.ts"
import { type PromptImage } from "../../../src/shared/prompt-image.ts"
import { type SessionDefault } from "../../../src/shared/session-default.ts"
import { type SessionEvent } from "../../../src/shared/session-event.ts"
import {
  INITIAL_SESSION_STATE,
  MAX_SESSION_STATE_TURNS,
} from "../../../src/shared/session-state.ts"
import {
  type ModelTokenUsage,
  type ScopeUsage,
  type TurnUsageBreakdown,
} from "../../../src/shared/token-usage.ts"
import { type PreviousUsageReview, usageProposalKey } from "../../../src/shared/usage-review.ts"
import {
  characterChangedEvent,
  shownOutfitAccents,
  shownPortraits,
} from "../../fixture/character.ts"
import { contextUsage, readyContextUsage } from "../../fixture/context-usage.ts"

// 疑似セッションもセリフも手で書いた架空のもの（docs/coding-standards.md「会話内容の扱い」）。
const BATCH_MS = 5

/** 雑談の会話のアーカイブを気にしないテストに渡す、何もしない書き込み口。 */
const NOOP_CHAT_ARCHIVE: ChatArchive = {
  append: () => {},
  keep: () => {},
  finishTurn: () => {},
  writeIndex: () => {},
  recall: () => ({ kind: "not-found" }),
  readRecent: () => ({ kept: [], recent: [] }),
}

/** トークン消費の記録を気にしないテストに渡す、何もしない書き込み口。 */
const NOOP_TOKEN_USAGE_LOG: TokenUsageLog = { append: () => {}, readRange: () => [] }

/** コンテキストの内訳の記録を気にしないテストに渡す、何もしない書き込み口。 */
const NOOP_CONTEXT_USAGE_LOG: ContextUsageLog = { append: () => {} }

/** 呼ばれた回数と引数だけを覚える、テスト用の駆動。**本物の claude は起こさない。** */
type StubDriver = {
  readonly driver: SessionDriver
  readonly emit: (event: SessionEvent) => void
  readonly attach: (onEvent: (event: SessionEvent) => void) => void
  /** 復元の再生（`onRestoredEvent`）を流す。**駆動由来（`emit`）とは別の口**（`docs/design.md` 7章）。 */
  readonly emitRestored: (event: SessionEvent) => void
  readonly attachRestored: (onRestoredEvent: (event: SessionEvent) => void) => void
  readonly calls: string[]
  answerable: boolean
}

function createStubDriver(): StubDriver {
  const calls: string[] = []
  let onEvent: (event: SessionEvent) => void = () => {}
  let onRestoredEvent: (event: SessionEvent) => void = () => {}
  const stub = {
    driver: {
      prompt: (text: string) => calls.push(`prompt:${text}`),
      promptWithoutRecord: (text: string) => calls.push(`promptWithoutRecord:${text}`),
      interrupt: () => {
        calls.push("interrupt")
        return Promise.resolve()
      },
      answer: (id: string) => {
        calls.push(`answer:${id}`)
        return stub.answerable
      },
      pending: () => [],
      readContextUsage: () => {
        calls.push("readContextUsage")
        return Promise.resolve(readyContextUsage())
      },
      setModel: (model: string | undefined) => {
        calls.push(`setModel:${model ?? ""}`)
        return Promise.resolve()
      },
      setPermissionMode: (mode: string) => {
        calls.push(`setPermissionMode:${mode}`)
        return Promise.resolve()
      },
      close: () => calls.push("close"),
    },
    emit: (event: SessionEvent) => onEvent(event),
    attach: (next: (event: SessionEvent) => void) => {
      onEvent = next
    },
    emitRestored: (event: SessionEvent) => onRestoredEvent(event),
    attachRestored: (next: (event: SessionEvent) => void) => {
      onRestoredEvent = next
    },
    calls,
    answerable: true,
  }
  return stub
}

/**
 * 見た目の編集で流し直す `character-changed`（手で書いた架空のパック）。**書き込みそのものは
 * 配線層の仕事**なので、ここでは「書けた/書けなかった」だけを差し替える。
 */
const CHARACTER_EVENT: SessionEvent = characterChangedEvent({
  ...shownPortraits({ default: "/character/default.png?v=fictional@2" }),
  outfitAccents: shownOutfitAccents({ default: "#b8c7ff" }),
})

/** 覚えたことを1行消したあとに流し直す `remembered-lines-changed`（作り物の1行）。 */
const REMEMBERED_LINES_EVENT: SessionEvent = {
  kind: "remembered-lines-changed",
  lines: ["架空の残った1行"],
}

function startManagerWithStub(writeResult: "written" | "rejected" = "written") {
  const stub = createStubDriver()
  const edits: CharacterEditCommand[] = []
  const creates: CharacterCreateCommand[] = []
  const deletes: CharacterDeleteCommand[] = []
  /** 覚えた「新しいセッションの既定」（覚え先は配線層なので、ここでは積むだけ）。 */
  const remembered: SessionDefault[] = []
  /** 画面の「編集」から消そうとした行（書き先は配線層なので、ここでは積むだけ）。 */
  const forgottenLines: string[] = []
  /** ホームへ書いた「前回の見直しの結果」（書き先は配線層なので、ここでは積むだけ）。 */
  const writtenPreviousUsageReviews: readonly [number, unknown][] = []
  /** 見送った提案の識別子（書き先は配線層なので、ここでは積むだけ）。 */
  const dismissedUsageProposals: DismissUsageProposalCommand[] = []
  const written = (): SessionEvent | undefined =>
    writeResult === "written" ? CHARACTER_EVENT : undefined
  const writtenRemembered = (): SessionEvent | undefined =>
    writeResult === "written" ? REMEMBERED_LINES_EVENT : undefined
  const manager = createSessionManager({
    now: () => 1_000,
    batchIntervalMs: BATCH_MS,
    chatCompactThresholdBytes: CHAT_COMPACT_THRESHOLD_BYTES,
    chatArchive: NOOP_CHAT_ARCHIVE,
    tokenUsageLog: NOOP_TOKEN_USAGE_LOG,
    contextUsageLog: NOOP_CONTEXT_USAGE_LOG,
    promptImageShelf: createPromptImageShelf(),
    rememberSessionDefault: (sessionDefault) => {
      remembered.push(sessionDefault)
      return { kind: "session-default-changed", sessionDefault }
    },
    launchSession: (onEvent) => {
      stub.attach(onEvent)
      return Promise.resolve(stub.driver)
    },
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
    forgetRememberedLine: (line) => {
      forgottenLines.push(line)
      return Promise.resolve(writtenRemembered())
    },
    readPreviousUsageReview: (): PreviousUsageReview => ({ kind: "none" }),
    writePreviousUsageReview: (reviewedAt, findings) => {
      ;(writtenPreviousUsageReviews as [number, unknown][]).push([reviewedAt, findings])
    },
    dismissUsageProposal: (dismiss) => {
      dismissedUsageProposals.push(dismiss)
      return { kind: "usage-proposal-dismissed", key: usageProposalKey(dismiss) }
    },
  })
  return {
    manager,
    stub,
    edits,
    creates,
    deletes,
    remembered,
    forgottenLines,
    writtenPreviousUsageReviews,
    dismissedUsageProposals,
  }
}

function waitForBatch(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, BATCH_MS * 4))
}

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

  it("hello の snapshot は、それまでのイベントをサーバ側でも畳んだ姿", async () => {
    const { manager, stub } = startManagerWithStub()
    stub.emit({ kind: "speech", text: "先に流れたセリフ", expression: "proud" })
    await waitForBatch()

    const frames: ServerFrame[] = []
    manager.subscribe((frame) => frames.push(frame))

    const [hello] = frames
    expect(hello?.type).toBe("hello")
    if (hello?.type === "hello") {
      expect(hello.state.speeches).toEqual(["先に流れたセリフ"])
      expect(hello.state.speechExpression).toBe("proud")
    }
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

  it("dispatch がコマンドを駆動へ渡す（分岐はここだけ）", async () => {
    const { manager, stub } = startManagerWithStub()

    expect(
      await manager.dispatch({
        type: "prompt",
        commandId: "c-1",
        text: "架空の依頼",
        images: [],
      }),
    ).toEqual({ ok: true })
    expect(await manager.dispatch({ type: "interrupt", commandId: "c-2" })).toEqual({
      ok: true,
    })
    expect(
      await manager.dispatch({ type: "set-model", commandId: "c-3", model: "sonnet" }),
    ).toEqual({ ok: true })
    expect(
      await manager.dispatch({
        type: "set-permission-mode",
        commandId: "c-4",
        mode: "plan",
      }),
    ).toEqual({ ok: true })

    expect(stub.calls).toEqual([
      "prompt:架空の依頼",
      "interrupt",
      "setModel:sonnet",
      "setPermissionMode:plan",
    ])
  })

  it("解決済みの答え待ちは、定型文の理由で受け付けない", async () => {
    const { manager, stub } = startManagerWithStub()
    stub.answerable = false

    expect(
      await manager.dispatch({
        type: "answer",
        commandId: "c-2",
        id: "toolu_gone",
        answer: { kind: "allow" },
      }),
    ).toEqual({ ok: false, reason: FRAME_ERROR_REASON.unresolvedAnswer })
  })

  it("switch-character で駆動を閉じ、別のパックで起こし直して新しい hello を配る", async () => {
    // 起こされた駆動を順に覚える（`launchSession` に渡るパックの決め方もここで見る）。
    const started: { readonly selection: CharacterSelection; readonly stub: StubDriver }[] = []
    const manager = createSessionManager({
      now: () => 1_000,
      batchIntervalMs: BATCH_MS,
      chatCompactThresholdBytes: CHAT_COMPACT_THRESHOLD_BYTES,
      chatArchive: NOOP_CHAT_ARCHIVE,
      tokenUsageLog: NOOP_TOKEN_USAGE_LOG,
      contextUsageLog: NOOP_CONTEXT_USAGE_LOG,
      promptImageShelf: createPromptImageShelf(),
      rememberSessionDefault: (sessionDefault) => ({
        kind: "session-default-changed",
        sessionDefault,
      }),
      launchSession: (onEvent, _onRestoredEvent, request) => {
        const stub = createStubDriver()
        stub.attach(onEvent)
        started.push({ selection: request.selection, stub })
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

    expect(
      await manager.dispatch({
        type: "switch-character",
        commandId: "c-1",
        name: "fictional",
      }),
    ).toEqual({ ok: true })

    // 前の駆動は閉じ、新しい駆動が**画面から選ばれた名前**で起きている（＝覚える側。
    // docs/screen-design.md 13.6）。
    expect(started[0]?.stub.calls).toContain("close")
    expect(started).toHaveLength(2)
    expect(started[1]?.selection).toEqual({ by: "name", name: "fictional" })

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

  it("ターン進行中の switch-character は定型文の理由で受け付けず、駆動を閉じない", async () => {
    const { manager, stub } = startManagerWithStub()

    expect(
      await manager.dispatch({
        type: "prompt",
        commandId: "c-1",
        text: "架空の依頼",
        images: [],
      }),
    ).toEqual({ ok: true })
    stub.emit({ kind: "request", text: "架空の依頼", images: [] })
    await waitForBatch()

    expect(
      await manager.dispatch({
        type: "switch-character",
        commandId: "c-2",
        name: "fictional",
      }),
    ).toEqual({ ok: false, reason: FRAME_ERROR_REASON.switchDuringTurn })
    expect(stub.calls).not.toContain("close")

    stub.emit({ kind: "turn-finished", outcome: { kind: "completed" } })
    await waitForBatch()

    expect(
      await manager.dispatch({
        type: "switch-character",
        commandId: "c-3",
        name: "fictional",
      }),
    ).toEqual({ ok: true })
    expect(stub.calls).toContain("close")
  })

  it("switch-session で、選ばれたIDの続きから起こし直す（パックもモードも変えない）", async () => {
    const started: SessionLaunchRequest[] = []
    const manager = createSessionManager({
      now: () => 1_000,
      batchIntervalMs: BATCH_MS,
      chatCompactThresholdBytes: CHAT_COMPACT_THRESHOLD_BYTES,
      chatArchive: NOOP_CHAT_ARCHIVE,
      tokenUsageLog: NOOP_TOKEN_USAGE_LOG,
      contextUsageLog: NOOP_CONTEXT_USAGE_LOG,
      promptImageShelf: createPromptImageShelf(),
      rememberSessionDefault: (sessionDefault) => ({
        kind: "session-default-changed",
        sessionDefault,
      }),
      launchSession: (onEvent, _onRestoredEvent, request) => {
        const stub = createStubDriver()
        stub.attach(onEvent)
        started.push(request)
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
    manager.subscribe(() => {})

    expect(
      await manager.dispatch({
        type: "switch-session",
        commandId: "c-1",
        sessionId: "架空の別セッション",
      }),
    ).toEqual({ ok: true })

    expect(started).toHaveLength(2)
    // 変わるのは「どの transcript の続きから始めるか」だけ。
    expect(started[1]?.resume).toEqual({ by: "id", sessionId: "架空の別セッション" })
    // **パックは「いま出しているまま」**（名前で渡すと覚えた値が書き換わる。docs/screen-design.md 13.6）。
    expect(started[1]?.selection).toEqual({ by: "current" })
    expect(started[1]?.chat).toBe(false)
    // 起動の1回目は今までどおり印から探す。
    expect(started[0]?.resume).toEqual({ by: "latest" })
  })

  it("ターン進行中の switch-session は定型文の理由で受け付けず、駆動を閉じない", async () => {
    const { manager, stub } = startManagerWithStub()

    stub.emit({ kind: "request", text: "架空の依頼", images: [] })
    await waitForBatch()

    expect(
      await manager.dispatch({
        type: "switch-session",
        commandId: "c-1",
        sessionId: "架空の別セッション",
      }),
    ).toEqual({ ok: false, reason: FRAME_ERROR_REASON.sessionSwitchDuringTurn })
    expect(stub.calls).not.toContain("close")

    stub.emit({ kind: "turn-finished", outcome: { kind: "completed" } })
    await waitForBatch()

    expect(
      await manager.dispatch({
        type: "switch-session",
        commandId: "c-2",
        sessionId: "架空の別セッション",
      }),
    ).toEqual({ ok: true })
    expect(stub.calls).toContain("close")
  })

  it("set-chat-mode で雑談を指定して起こし直し、いま出しているパックは保つ", async () => {
    // 雑談の切り替えは `systemPrompt` の差し替えなので、`switch-character` と同じ起こし直しに
    // なる（docs/chat-mode.md 4.9）。**パックは変えない**ことをここで見る。
    const started: SessionLaunchRequest[] = []
    const manager = createSessionManager({
      now: () => 1_000,
      batchIntervalMs: BATCH_MS,
      chatCompactThresholdBytes: CHAT_COMPACT_THRESHOLD_BYTES,
      chatArchive: NOOP_CHAT_ARCHIVE,
      tokenUsageLog: NOOP_TOKEN_USAGE_LOG,
      contextUsageLog: NOOP_CONTEXT_USAGE_LOG,
      promptImageShelf: createPromptImageShelf(),
      rememberSessionDefault: (sessionDefault) => ({
        kind: "session-default-changed",
        sessionDefault,
      }),
      launchSession: (onEvent, _onRestoredEvent, request) => {
        const stub = createStubDriver()
        stub.attach(onEvent)
        started.push(request)
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
    manager.subscribe(() => {})

    expect(await manager.dispatch({ type: "set-chat-mode", commandId: "c-1", chat: true })).toEqual(
      { ok: true },
    )

    expect(started).toHaveLength(2)
    expect(started[1]?.chat).toBe(true)
    // **パックは「いま出しているまま」として渡す**（名前では渡さない）。名前で渡すと画面から
    // 選ばれたのと区別がつかず、モードを切り替えただけで覚えた値が書き換わる
    // （docs/screen-design.md 13.6）。
    expect(started[1]?.selection).toEqual({ by: "current" })
    // 起動の1回目は初期パック（こちらも覚えない側）。
    expect(started[0]?.selection).toEqual({ by: "initial" })
  })

  it("起こし直しの間に新しい駆動が流したイベントは、新しい hello より先に配らない", async () => {
    // 起き上がりに時間がかかる駆動（本物の claude は起動に数秒かかる）。その間に
    // `chat-mode-changed` などが先に流れると、ブラウザは前のセッションの姿のまま雑談へ
    // 切り替わり、前の立ち絵が一瞬出てから新しい hello で入れ替わる。
    const releases: (() => void)[] = []
    const manager = createSessionManager({
      now: () => 1_000,
      batchIntervalMs: BATCH_MS,
      chatCompactThresholdBytes: CHAT_COMPACT_THRESHOLD_BYTES,
      chatArchive: NOOP_CHAT_ARCHIVE,
      tokenUsageLog: NOOP_TOKEN_USAGE_LOG,
      contextUsageLog: NOOP_CONTEXT_USAGE_LOG,
      promptImageShelf: createPromptImageShelf(),
      rememberSessionDefault: (sessionDefault) => ({
        kind: "session-default-changed",
        sessionDefault,
      }),
      launchSession: (onEvent, _onRestoredEvent, request) => {
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

    const switched = manager.dispatch({ type: "set-chat-mode", commandId: "c-1", chat: true })
    await waitForBatch()
    expect(frames.slice(before)).toEqual([])

    releases[1]?.()
    expect(await switched).toEqual({ ok: true })
    await waitForBatch()
    expect(frames.slice(before).map((frame) => frame.type)).toEqual(["hello"])
    const hello = frames[before]
    expect(hello?.type === "hello" && hello.state.chatMode).toBe(true)
  })

  it("雑談から仕事へ戻すときも起こし直す", async () => {
    const started: SessionLaunchRequest[] = []
    const manager = createSessionManager({
      now: () => 1_000,
      batchIntervalMs: BATCH_MS,
      chatCompactThresholdBytes: CHAT_COMPACT_THRESHOLD_BYTES,
      chatArchive: NOOP_CHAT_ARCHIVE,
      tokenUsageLog: NOOP_TOKEN_USAGE_LOG,
      contextUsageLog: NOOP_CONTEXT_USAGE_LOG,
      promptImageShelf: createPromptImageShelf(),
      rememberSessionDefault: (sessionDefault) => ({
        kind: "session-default-changed",
        sessionDefault,
      }),
      launchSession: (onEvent, _onRestoredEvent, request) => {
        const stub = createStubDriver()
        stub.attach(onEvent)
        started.push(request)
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
    manager.subscribe(() => {})

    await manager.dispatch({ type: "set-chat-mode", commandId: "c-1", chat: true })
    await manager.dispatch({ type: "set-chat-mode", commandId: "c-2", chat: false })

    expect(started.map((request) => request.chat)).toEqual([undefined, true, false])
  })

  it("ターン進行中の set-chat-mode は定型文の理由で受け付けず、駆動を閉じない", async () => {
    const { manager, stub } = startManagerWithStub()

    expect(
      await manager.dispatch({
        type: "prompt",
        commandId: "c-1",
        text: "架空の依頼",
        images: [],
      }),
    ).toEqual({ ok: true })
    stub.emit({ kind: "request", text: "架空の依頼", images: [] })
    await waitForBatch()

    expect(await manager.dispatch({ type: "set-chat-mode", commandId: "c-2", chat: true })).toEqual(
      { ok: false, reason: FRAME_ERROR_REASON.chatModeSwitchDuringTurn },
    )
    expect(stub.calls).not.toContain("close")
  })

  it("駆動が起き上がるのを待ってから、新しい hello を配る（続きから始めるセッションを探す間）", async () => {
    // 駆動を起こすのに外の世界（transcript の一覧）を読むので、`launchSession` は待てる形で返る。
    const started: StubDriver[] = []
    const manager = createSessionManager({
      now: () => 1_000,
      batchIntervalMs: BATCH_MS,
      chatCompactThresholdBytes: CHAT_COMPACT_THRESHOLD_BYTES,
      chatArchive: NOOP_CHAT_ARCHIVE,
      tokenUsageLog: NOOP_TOKEN_USAGE_LOG,
      contextUsageLog: NOOP_CONTEXT_USAGE_LOG,
      promptImageShelf: createPromptImageShelf(),
      rememberSessionDefault: (sessionDefault) => ({
        kind: "session-default-changed",
        sessionDefault,
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
    expect(
      await manager.dispatch({
        type: "prompt",
        commandId: "c-1",
        text: "架空の依頼",
        images: [],
      }),
    ).toEqual({ ok: true })
    expect(started[0]?.calls).toEqual(["prompt:架空の依頼"])

    expect(
      await manager.dispatch({
        type: "switch-character",
        commandId: "c-2",
        name: "fictional",
      }),
    ).toEqual({ ok: true })

    // 切り替え先の駆動が起き上がったあとで hello が配られている。
    expect(started).toHaveLength(2)
    expect(started[0]?.calls).toContain("close")
    expect(frames.filter((frame) => frame.type === "hello")).toHaveLength(2)
  })

  describe("キャラクターから話しかけてもらう（nudge）", () => {
    it("雑談モードなら、記録に残さない口へ core が持つ文面を渡す（依頼としては送らない）", async () => {
      const { manager, stub } = startManagerWithStub()
      await waitForBatch()
      stub.emit({ kind: "chat-mode-changed", chat: true })

      expect(await manager.dispatch({ type: "nudge", commandId: "c-1" })).toEqual({
        ok: true,
      })

      // 渡るのは `promptWithoutRecord`（記録に残さない口）だけで、`prompt` は呼ばれない
      // ——ログにも記録にも雑談の会話のアーカイブにも残らない（docs/screen-design.md 13.7）。
      expect(stub.calls).toEqual([`promptWithoutRecord:${CHAT_NUDGE_PROMPT}`])
    })

    it("仕事のモードでは受け付けない（メインビューにキャラクター発のターンを混ぜない）", async () => {
      const { manager, stub } = startManagerWithStub()
      await waitForBatch()

      expect(await manager.dispatch({ type: "nudge", commandId: "c-1" })).toEqual({
        ok: false,
        reason: FRAME_ERROR_REASON.nudgeOutsideChat,
      })
      expect(stub.calls).toEqual([])
    })

    it("ターン進行中は受け付けない（画面のボタンと同じ条件をサーバでも見る）", async () => {
      const { manager, stub } = startManagerWithStub()
      await waitForBatch()
      stub.emit({ kind: "chat-mode-changed", chat: true })
      stub.emit({ kind: "request", text: "架空の依頼", images: [] })

      expect(await manager.dispatch({ type: "nudge", commandId: "c-1" })).toEqual({
        ok: false,
        reason: FRAME_ERROR_REASON.nudgeDuringTurn,
      })
      expect(stub.calls).toEqual([])
    })
  })

  describe("雑談の記憶の圧縮", () => {
    // 本番の閾値（128 KiB）だと架空の短い文面では届かないので、**`SessionManagerOptions` の
    // フィールドに小さい閾値を渡して**テストする（`batchIntervalMs` と同じ形。
    // docs/chat-mode.md 4.9）。
    const TINY_THRESHOLD_BYTES = 10

    /** 追記された内容を覚える、テスト用の雑談の会話のアーカイブ。 */
    function createCapturingChatArchive(): ChatArchive & { readonly entries: ChatArchiveEntry[] } {
      const entries: ChatArchiveEntry[] = []
      return {
        entries,
        append: (_packName, entry) => {
          entries.push(entry)
        },
        keep: () => {},
        finishTurn: () => {},
        writeIndex: () => {},
        recall: () => ({ kind: "not-found" }),
        readRecent: () => ({ kept: [], recent: [] }),
      }
    }

    function startChatManagerWithStub(
      thresholdBytes: number,
      archive: ChatArchive = NOOP_CHAT_ARCHIVE,
    ) {
      const stub = createStubDriver()
      const manager = createSessionManager({
        now: () => 1_000,
        batchIntervalMs: BATCH_MS,
        chatCompactThresholdBytes: thresholdBytes,
        chatArchive: archive,
        tokenUsageLog: NOOP_TOKEN_USAGE_LOG,
        contextUsageLog: NOOP_CONTEXT_USAGE_LOG,
        promptImageShelf: createPromptImageShelf(),
        rememberSessionDefault: (sessionDefault) => ({
          kind: "session-default-changed",
          sessionDefault,
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

    it("閾値を超えたターンの終わりに /compact を1回だけ、記録に残さない口で送る", async () => {
      const { stub } = startChatManagerWithStub(TINY_THRESHOLD_BYTES)
      // 駆動が起き上がる（`live` が入る）のを待ってから、雑談へ入って往復する。
      await waitForBatch()

      stub.emit({ kind: "chat-mode-changed", chat: true })
      stub.emit({ kind: "request", text: "架空の依頼です", images: [] })
      stub.emit({ kind: "speech", text: "架空のセリフです", expression: "default" })
      stub.emit({ kind: "turn-finished", outcome: { kind: "completed" } })
      await waitForBatch()

      const compactCalls = stub.calls.filter((call) =>
        call.startsWith("promptWithoutRecord:/compact "),
      )
      expect(compactCalls).toHaveLength(1)
      // `prompt`（`request` の記録を積む口）は一度も呼ばない —
      // 利用者が打っていない `/compact` の文面が雑談のログにもアーカイブにも並ばない
      // （docs/chat-mode.md 4.9「記憶の圧縮と忘却」）。
      expect(stub.calls.some((call) => call.startsWith("prompt:"))).toBe(false)

      // 送ったら走行合計が0に戻るので、続けて終わっただけの次のターンでは再送しない
      // （「投げたら数え直す」）。
      stub.emit({ kind: "request", text: "b", images: [] })
      stub.emit({ kind: "turn-finished", outcome: { kind: "completed" } })
      await waitForBatch()

      expect(
        stub.calls.filter((call) => call.startsWith("promptWithoutRecord:/compact ")),
      ).toHaveLength(1)
    })

    it("圧縮を送っても、雑談の会話のアーカイブに /compact の文面は積まれない", async () => {
      const archive = createCapturingChatArchive()
      const { stub } = startChatManagerWithStub(TINY_THRESHOLD_BYTES, archive)
      await waitForBatch()

      stub.emit(CHARACTER_EVENT)
      stub.emit({ kind: "chat-mode-changed", chat: true })
      stub.emit({ kind: "request", text: "架空の依頼です", images: [] })
      stub.emit({ kind: "speech", text: "架空のセリフです", expression: "default" })
      stub.emit({ kind: "turn-finished", outcome: { kind: "completed" } })
      await waitForBatch()

      // 圧縮は `promptWithoutRecord` で送るので `request` イベントを一切生まない
      // （`session-driver.ts` の契約）。アーカイブへ積まれるのは実際に届いた依頼とセリフの
      // 2件だけで、`/compact` の文面は混ざらない。
      expect(archive.entries).toHaveLength(2)
      expect(archive.entries.map((entry) => entry.text)).toEqual([
        "架空の依頼です",
        "架空のセリフです",
      ])
    })

    it("圧縮を送っても、T-250 の圧縮の区切り（compact-boundary）はいままでどおり events に乗る", async () => {
      const { manager, stub } = startChatManagerWithStub(TINY_THRESHOLD_BYTES)
      const frames: ServerFrame[] = []
      manager.subscribe((frame) => frames.push(frame))
      await waitForBatch()

      stub.emit({ kind: "chat-mode-changed", chat: true })
      stub.emit({ kind: "request", text: "架空の依頼です", images: [] })
      stub.emit({ kind: "speech", text: "架空のセリフです", expression: "default" })
      stub.emit({ kind: "turn-finished", outcome: { kind: "completed" } })
      await waitForBatch()

      expect(
        stub.calls.filter((call) => call.startsWith("promptWithoutRecord:/compact ")),
      ).toHaveLength(1)

      // T-250: 実際に本体が圧縮した合図（SDK の `compact_boundary`）は、`/compact` の依頼文面とは
      // 別に `sdk-message.ts` が `compact-boundary` へ変換して流す。ここでは駆動から届いたその
      // イベントが、記録に残さない口へ差し替えたあとも変わらず events に乗ることを見る。
      stub.emit({ kind: "compact-boundary" })
      await waitForBatch()

      const events = frames
        .filter(
          (frame): frame is Extract<ServerFrame, { type: "events" }> => frame.type === "events",
        )
        .flatMap((frame) => frame.events.map((stamped) => stamped.event))
      expect(events).toContainEqual({ kind: "compact-boundary" })
    })

    it("閾値を超えていなければ送らない", async () => {
      const { stub } = startChatManagerWithStub(1_000_000)
      await waitForBatch()

      stub.emit({ kind: "chat-mode-changed", chat: true })
      stub.emit({ kind: "request", text: "架空の依頼です", images: [] })
      stub.emit({ kind: "speech", text: "架空のセリフです", expression: "default" })
      stub.emit({ kind: "turn-finished", outcome: { kind: "completed" } })
      await waitForBatch()

      expect(stub.calls.some((call) => call.startsWith("promptWithoutRecord:/compact "))).toBe(
        false,
      )
    })

    it("仕事のモード（雑談に入っていない）では、閾値を超えていても送らない", async () => {
      const { stub } = startChatManagerWithStub(TINY_THRESHOLD_BYTES)
      await waitForBatch()

      // chat-mode-changed を流さないので chatMode は既定の false のまま。
      stub.emit({ kind: "request", text: "架空の依頼です", images: [] })
      stub.emit({ kind: "speech", text: "架空のセリフです", expression: "default" })
      stub.emit({ kind: "turn-finished", outcome: { kind: "completed" } })
      await waitForBatch()

      expect(stub.calls.some((call) => call.startsWith("promptWithoutRecord:/compact "))).toBe(
        false,
      )
    })

    it("画面の窓（雑談は直近100ターン）で state.records が切り詰められたあとでも、走行合計は届く", async () => {
      // 1ターンあたり "xxxxx"（5バイト）+ "yyyyy"（5バイト）＝10バイト。
      // 閾値 1,200 は「窓に残る直近100ターンぶん」（1,000バイト）より大きく、
      // 「150ターン分の総量」（1,500バイト）より小さい —
      // `state.records`（`trimToRecentTurns` で直近100ターンに切り詰められる）から数えていたら
      // 一生届かない値を、あえて選んでいる（`docs/chat-mode.md` 4.9）。
      const { stub } = startChatManagerWithStub(1_200)
      await waitForBatch()

      stub.emit({ kind: "chat-mode-changed", chat: true })
      for (let turn = 0; turn < 150; turn += 1) {
        stub.emit({ kind: "request", text: "xxxxx", images: [] })
        stub.emit({ kind: "speech", text: "yyyyy", expression: "default" })
        stub.emit({ kind: "turn-finished", outcome: { kind: "completed" } })
      }
      await waitForBatch()

      expect(
        stub.calls.filter((call) => call.startsWith("promptWithoutRecord:/compact ")),
      ).toHaveLength(1)
    })
  })

  it("立ち絵を変えるコマンドは駆動へ渡さず、書けたら character-changed を畳んで配る", async () => {
    const { manager, stub, edits } = startManagerWithStub()
    const frames: ServerFrame[] = []
    manager.subscribe((frame) => frames.push(frame))

    expect(
      await manager.dispatch({
        type: "set-portrait",
        commandId: "c-1",
        pack: "fictional",
        expression: "proud",
        image: "data:image/png;base64,AAAA",
      }),
    ).toEqual({ ok: true })
    await waitForBatch()

    // 駆動には何も渡らない（セッションは起こし直さない）。
    expect(stub.calls).toEqual([])
    expect(edits.map((edit) => edit.type)).toEqual(["set-portrait"])
    // サーバ側の状態にも畳まれ、購読者にはイベントとして届く。
    const events = frames.filter((frame) => frame.type === "events").at(-1)
    if (events?.type === "events") {
      expect(events.events.map((stamped) => stamped.event)).toEqual([CHARACTER_EVENT])
    }
    expect(frames.filter((frame) => frame.type === "hello")).toHaveLength(1)
  })

  it("使用中でないパックを変えるコマンドも起こし直さず、書き込み先へ pack をそのまま渡す", async () => {
    const { manager, stub, edits } = startManagerWithStub()
    const frames: ServerFrame[] = []
    manager.subscribe((frame) => frames.push(frame))

    expect(
      await manager.dispatch({
        type: "set-background",
        commandId: "c-1",
        pack: "fictional-other",
        image: "data:image/png;base64,AAAA",
      }),
    ).toEqual({ ok: true })
    await waitForBatch()

    expect(stub.calls).toEqual([])
    expect(edits.map((edit) => edit.pack)).toEqual(["fictional-other"])
    expect(frames.filter((frame) => frame.type === "hello")).toHaveLength(1)
  })

  it("差し色を変えるコマンドも同じ経路を通る", async () => {
    const { manager, edits } = startManagerWithStub()

    expect(
      await manager.dispatch({
        type: "set-outfit-accent",
        commandId: "c-1",
        pack: "fictional",
        outfit: "heavy",
        color: "#ffb3a7",
      }),
    ).toEqual({ ok: true })

    expect(edits.map((edit) => edit.type)).toEqual(["set-outfit-accent"])
  })

  it("名前とプロフィールを変えるコマンド（set-profile）も同じ経路を通る", async () => {
    const { manager, edits } = startManagerWithStub()

    expect(
      await manager.dispatch({
        type: "set-profile",
        commandId: "c-1",
        pack: "fictional",
        name: "新しい表示名",
        tagline: "ひとこと",
      }),
    ).toEqual({ ok: true })

    expect(edits.map((edit) => edit.type)).toEqual(["set-profile"])
  })

  it("新しいパックを作るコマンドも駆動へ渡さず、選択肢の増えた character-changed を配る", async () => {
    const { manager, stub, edits, creates } = startManagerWithStub()
    const frames: ServerFrame[] = []
    manager.subscribe((frame) => frames.push(frame))

    expect(
      await manager.dispatch({
        type: "create-character",
        commandId: "c-1",
        id: "fictional-2",
        name: "",
        portraits: {
          default: "data:image/png;base64,AAAA",
        },
        accent: "#b8c7ff",
        chatAccent: "#eaa77a",
      }),
    ).toEqual({ ok: true })
    await waitForBatch()

    // 駆動には何も渡らない（**作っただけでは切り替えない**ので、起こし直しも起きない）。
    expect(stub.calls).toEqual([])
    expect(edits).toEqual([])
    expect(creates.map((create) => create.id)).toEqual(["fictional-2"])
    const events = frames.filter((frame) => frame.type === "events").at(-1)
    if (events?.type === "events") {
      expect(events.events.map((stamped) => stamped.event)).toEqual([CHARACTER_EVENT])
    }
    expect(frames.filter((frame) => frame.type === "hello")).toHaveLength(1)
  })

  it("パックを作れなかったら、作る側の定型文の理由を返す", async () => {
    const { manager } = startManagerWithStub("rejected")

    expect(
      await manager.dispatch({
        type: "create-character",
        commandId: "c-1",
        id: "fictional",
        name: "",
        portraits: {
          default: "data:image/png;base64,AAAA",
        },
        accent: "#b8c7ff",
        chatAccent: "#eaa77a",
      }),
    ).toEqual({ ok: false, reason: FRAME_ERROR_REASON.characterCreateFailed })
  })

  it("パックを消すコマンドも駆動へ渡さず、ターン中でも選択肢の減った character-changed を配る", async () => {
    const { manager, stub, deletes } = startManagerWithStub()
    stub.emit({ kind: "request", text: "架空の依頼", images: [] })
    await waitForBatch()
    const frames: ServerFrame[] = []
    manager.subscribe((frame) => frames.push(frame))

    expect(
      await manager.dispatch({ type: "delete-character", commandId: "c-1", pack: "fictional-2" }),
    ).toEqual({ ok: true })
    await waitForBatch()

    // 使用中のパックは消せないので、起こし直しも駆動への受け渡しも起きない。
    expect(stub.calls).toEqual([])
    expect(deletes.map((remove) => remove.pack)).toEqual(["fictional-2"])
    const events = frames.filter((frame) => frame.type === "events").at(-1)
    if (events?.type === "events") {
      expect(events.events.map((stamped) => stamped.event)).toEqual([CHARACTER_EVENT])
    }
  })

  it("パックを消せなかったら、消す側の定型文の理由を返す", async () => {
    const { manager } = startManagerWithStub("rejected")

    expect(
      await manager.dispatch({ type: "delete-character", commandId: "c-1", pack: "fictional" }),
    ).toEqual({ ok: false, reason: FRAME_ERROR_REASON.characterDeleteFailed })
  })

  describe("画面の「編集」から覚えたことを1行消す", () => {
    it("雑談モードなら、消したい行を渡して流し直しを配る（駆動には渡らない）", async () => {
      const { manager, stub, forgottenLines } = startManagerWithStub()
      stub.emit({ kind: "chat-mode-changed", chat: true })
      await waitForBatch()
      const frames: ServerFrame[] = []
      manager.subscribe((frame) => frames.push(frame))

      expect(
        await manager.dispatch({
          type: "forget-remembered-line",
          commandId: "c-1",
          line: "架空の消したい1行",
        }),
      ).toEqual({ ok: true })
      await waitForBatch()

      expect(forgottenLines).toEqual(["架空の消したい1行"])
      expect(stub.calls).toEqual([])
      const events = frames.filter((frame) => frame.type === "events").at(-1)
      if (events?.type === "events") {
        expect(events.events.map((stamped) => stamped.event)).toEqual([
          { kind: "remembered-lines-changed", lines: ["架空の残った1行"] },
        ])
      }
    })

    it("仕事のモードでは受け付けない（サイドバーの「覚えていること」自体が雑談中にしか出ない）", async () => {
      const { manager, forgottenLines } = startManagerWithStub()

      expect(
        await manager.dispatch({
          type: "forget-remembered-line",
          commandId: "c-1",
          line: "架空の消したい1行",
        }),
      ).toEqual({ ok: false, reason: FRAME_ERROR_REASON.forgetRememberedLineOutsideChat })
      expect(forgottenLines).toEqual([])
    })

    it("消せなかったら、消す側の定型文の理由を返す", async () => {
      const { manager, stub } = startManagerWithStub("rejected")
      stub.emit({ kind: "chat-mode-changed", chat: true })

      expect(
        await manager.dispatch({
          type: "forget-remembered-line",
          commandId: "c-1",
          line: "架空の消したい1行",
        }),
      ).toEqual({ ok: false, reason: FRAME_ERROR_REASON.forgetRememberedLineFailed })
    })
  })

  it("書き込みが受け付けられなかったら定型文の理由を返し、状態は動かさない", async () => {
    const { manager } = startManagerWithStub("rejected")
    const frames: ServerFrame[] = []
    manager.subscribe((frame) => frames.push(frame))

    expect(
      await manager.dispatch({
        type: "clear-portrait",
        commandId: "c-1",
        pack: "fictional",
        expression: "proud",
      }),
    ).toEqual({ ok: false, reason: FRAME_ERROR_REASON.characterEditFailed })
    await waitForBatch()

    expect(frames.filter((frame) => frame.type === "events")).toEqual([])
  })

  it("起こし直しに失敗したら定型文の理由を返し、常駐プロセスは落ちない", async () => {
    const manager = createSessionManager({
      now: () => 1_000,
      batchIntervalMs: BATCH_MS,
      chatCompactThresholdBytes: CHAT_COMPACT_THRESHOLD_BYTES,
      chatArchive: NOOP_CHAT_ARCHIVE,
      tokenUsageLog: NOOP_TOKEN_USAGE_LOG,
      contextUsageLog: NOOP_CONTEXT_USAGE_LOG,
      promptImageShelf: createPromptImageShelf(),
      rememberSessionDefault: (sessionDefault) => ({
        kind: "session-default-changed",
        sessionDefault,
      }),
      launchSession: (onEvent, _onRestoredEvent, request) => {
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

    expect(
      await manager.dispatch({
        type: "switch-character",
        commandId: "c-1",
        name: "fictional",
      }),
    ).toEqual({ ok: false, reason: FRAME_ERROR_REASON.driverFailed })

    // 常駐プロセスは落ちない。subscribe はそのまま動く。
    const frames: ServerFrame[] = []
    manager.subscribe((frame) => frames.push(frame))
    expect(frames).toHaveLength(1)
  })

  it("キャラクターへの書き込みが例外を投げても定型文の理由を返す", async () => {
    const stub = createStubDriver()
    const manager = createSessionManager({
      now: () => 1_000,
      batchIntervalMs: BATCH_MS,
      chatCompactThresholdBytes: CHAT_COMPACT_THRESHOLD_BYTES,
      chatArchive: NOOP_CHAT_ARCHIVE,
      tokenUsageLog: NOOP_TOKEN_USAGE_LOG,
      contextUsageLog: NOOP_CONTEXT_USAGE_LOG,
      promptImageShelf: createPromptImageShelf(),
      rememberSessionDefault: (sessionDefault) => ({
        kind: "session-default-changed",
        sessionDefault,
      }),
      launchSession: (onEvent) => {
        stub.attach(onEvent)
        return Promise.resolve(stub.driver)
      },
      editCharacter: () => Promise.reject(new Error("架空の書き込み失敗")),
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

    expect(
      await manager.dispatch({
        type: "clear-portrait",
        commandId: "c-1",
        pack: "fictional",
        expression: "proud",
      }),
    ).toEqual({ ok: false, reason: FRAME_ERROR_REASON.characterEditFailed })
  })

  it("駆動が例外を投げても定型文の理由を返し、常駐プロセスは落ちない", async () => {
    const manager = createSessionManager({
      now: () => 1_000,
      batchIntervalMs: BATCH_MS,
      chatCompactThresholdBytes: CHAT_COMPACT_THRESHOLD_BYTES,
      chatArchive: NOOP_CHAT_ARCHIVE,
      tokenUsageLog: NOOP_TOKEN_USAGE_LOG,
      contextUsageLog: NOOP_CONTEXT_USAGE_LOG,
      promptImageShelf: createPromptImageShelf(),
      rememberSessionDefault: (sessionDefault) => ({
        kind: "session-default-changed",
        sessionDefault,
      }),
      launchSession: () =>
        Promise.resolve({
          prompt: () => {},
          promptWithoutRecord: () => {},
          interrupt: () => Promise.reject(new Error("架空の駆動エラー")),
          answer: () => true,
          pending: () => [],
          readContextUsage: () => Promise.resolve(UNAVAILABLE_CONTEXT_USAGE),
          setModel: () => Promise.resolve(),
          setPermissionMode: () => Promise.resolve(),
          close: () => {},
        }),
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

    expect(await manager.dispatch({ type: "interrupt", commandId: "c-1" })).toEqual({
      ok: false,
      reason: FRAME_ERROR_REASON.driverFailed,
    })

    // 落ちていないので、次のコマンドも受け付ける。
    expect(
      await manager.dispatch({
        type: "prompt",
        commandId: "c-2",
        text: "架空の依頼",
        images: [],
      }),
    ).toEqual({ ok: true })
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

  describe("雑談の会話のアーカイブ", () => {
    // `chatArchive` の実装（ファイルI/O）は adapter のテストが持つ。ここで見るのは
    // 「いつ・何を渡すか」（`session-manager.receive` の分岐）だけ（docs/chat-mode.md 4.9）。

    function startArchiveManagerWithStub() {
      const stub = createStubDriver()
      const archiveCalls: { readonly packName: string; readonly entry: ChatArchiveEntry }[] = []
      const finishTurnCalls = { count: 0 }
      const chatArchive: ChatArchive = {
        append: (packName, entry) => {
          archiveCalls.push({ packName, entry })
        },
        keep: () => {},
        finishTurn: () => {
          finishTurnCalls.count += 1
        },
        writeIndex: () => {},
        recall: () => ({ kind: "not-found" }),
        // 読み戻しは起こすときの配線（`src/session-start.ts`）が使う口で、ここは通らない。
        readRecent: () => ({ kept: [], recent: [] }),
      }
      const manager = createSessionManager({
        now: () => 1_000,
        batchIntervalMs: BATCH_MS,
        chatCompactThresholdBytes: CHAT_COMPACT_THRESHOLD_BYTES,
        chatArchive,
        tokenUsageLog: NOOP_TOKEN_USAGE_LOG,
        contextUsageLog: NOOP_CONTEXT_USAGE_LOG,
        promptImageShelf: createPromptImageShelf(),
        rememberSessionDefault: (sessionDefault) => ({
          kind: "session-default-changed",
          sessionDefault,
        }),
        launchSession: (onEvent, onRestoredEvent) => {
          stub.attach(onEvent)
          stub.attachRestored(onRestoredEvent)
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
      return { manager, stub, archiveCalls, finishTurnCalls }
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
          entry: { speaker: "user", at: 1_000, text: "架空の依頼", images: undefined },
        },
        {
          packName: "fictional",
          entry: { speaker: "character", at: 1_000, text: "架空のセリフ", expression: "proud" },
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
          entry: { speaker: "user", at: 1_000, text: "架空の依頼", images: 2 },
        },
      ])
    })

    it("仕事のとき（雑談に入っていない）は1バイトも書かない", async () => {
      const { stub, archiveCalls } = startArchiveManagerWithStub()
      await waitForBatch()

      stub.emit(CHARACTER_EVENT)
      stub.emit({ kind: "request", text: "架空の依頼", images: [] })
      stub.emit({ kind: "speech", text: "架空のセリフ", expression: "default" })
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

      // 前のセッションの記録を組み直した再生（`onRestoredEvent`）。
      stub.emitRestored(CHARACTER_EVENT)
      stub.emitRestored({ kind: "chat-mode-changed", chat: true })
      stub.emitRestored({ kind: "request", text: "前のセッションの依頼", images: [] })
      stub.emitRestored({ kind: "speech", text: "前のセッションのセリフ", expression: "default" })
      await waitForBatch()

      expect(archiveCalls).toEqual([])

      // 駆動から新しく届いたぶんは、いつもどおり書く。
      stub.emit({ kind: "request", text: "新しい依頼", images: [] })
      await waitForBatch()

      expect(archiveCalls).toEqual([
        {
          packName: "fictional",
          entry: { speaker: "user", at: 1_000, text: "新しい依頼", images: undefined },
        },
      ])
    })

    it("ターンの終わりにアーカイブへ合図を出す（旗の立った1往復を書く機会がここ）", async () => {
      const { stub, finishTurnCalls } = startArchiveManagerWithStub()
      await waitForBatch()

      stub.emit(CHARACTER_EVENT)
      stub.emit({ kind: "chat-mode-changed", chat: true })
      stub.emit({ kind: "request", text: "架空の依頼", images: [] })
      await waitForBatch()
      expect(finishTurnCalls.count).toBe(0)

      stub.emit({ kind: "turn-finished", outcome: { kind: "completed" } })
      await waitForBatch()

      expect(finishTurnCalls.count).toBe(1)
    })

    it("復元で流し直されたターンの終わりでは合図を出さない", async () => {
      const { stub, finishTurnCalls } = startArchiveManagerWithStub()
      await waitForBatch()

      stub.emitRestored(CHARACTER_EVENT)
      stub.emitRestored({ kind: "chat-mode-changed", chat: true })
      stub.emitRestored({ kind: "turn-finished", outcome: { kind: "completed" } })
      await waitForBatch()

      expect(finishTurnCalls.count).toBe(0)
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

  // トークン消費の記録。**数と時刻とモデルの名前だけ**が
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
        batchIntervalMs: BATCH_MS,
        chatCompactThresholdBytes: CHAT_COMPACT_THRESHOLD_BYTES,
        chatArchive: NOOP_CHAT_ARCHIVE,
        tokenUsageLog: {
          append: (entry) => {
            entries.push(entry)
          },
          readRange: () => [],
        },
        contextUsageLog: NOOP_CONTEXT_USAGE_LOG,
        promptImageShelf: createPromptImageShelf(),
        rememberSessionDefault: (sessionDefault) => ({
          kind: "session-default-changed",
          sessionDefault,
        }),
        launchSession: (onEvent, onRestoredEvent) => {
          stub.attach(onEvent)
          stub.attachRestored(onRestoredEvent)
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
      stub.emitRestored({ kind: "token-usage", cumulative: cumulative(100, 20, 0.5) })
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

    // **この検査がいちばん重要**（`docs/coding-standards.md`「会話内容の扱い」）。依頼の文面・
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

  // コンテキストの内訳の記録（`src/shared/context-usage-record.ts`）。**1行 = 1セッション**で、
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
        batchIntervalMs: BATCH_MS,
        chatCompactThresholdBytes: CHAT_COMPACT_THRESHOLD_BYTES,
        chatArchive: NOOP_CHAT_ARCHIVE,
        tokenUsageLog: NOOP_TOKEN_USAGE_LOG,
        contextUsageLog: {
          append: (entry) => {
            entries.push(entry)
          },
        },
        promptImageShelf: createPromptImageShelf(),
        rememberSessionDefault: (sessionDefault) => ({
          kind: "session-default-changed",
          sessionDefault,
        }),
        launchSession: (onEvent, onRestoredEvent) => {
          stub.attach(onEvent)
          stub.attachRestored(onRestoredEvent)
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
      stub.emitRestored({ kind: "turn-finished", outcome: { kind: "completed" } })
      await waitForBatch()

      expect(entries).toEqual([])
    })
  })
})

// 新しいセッションの既定（docs/screen-design.md 13.6）。**覚えるのは配線層**（`src/session-start.ts`）で、
// ここが持つのは「受け取ったら覚えさせて、姿へ流し直す」「いまのセッションは起こし直さない」の2つ。
describe("createSessionManager（新しいセッションの既定）", () => {
  it("set-session-default を覚えさせ、姿に載せて配る", async () => {
    const { manager, remembered } = startManagerWithStub()
    const frames: ServerFrame[] = []
    manager.subscribe((frame) => frames.push(frame))

    const result = await manager.dispatch({
      type: "set-session-default",
      commandId: "c-1",
      model: "sonnet",
      permissionMode: "plan",
    })
    await waitForBatch()

    expect(result).toEqual({ ok: true })
    expect(remembered).toEqual([{ model: "sonnet", permissionMode: "plan" }])
    expect(frames.at(-1)).toEqual({
      type: "events",
      events: [
        {
          at: 1_000,
          event: {
            kind: "session-default-changed",
            sessionDefault: { model: "sonnet", permissionMode: "plan" },
          },
        },
      ],
    })
  })

  // 帯のドロップダウンはセッション限り（`docs/screen-design.md` 13.6）。**既定は書き換わらない。**
  it("帯の set-model / set-permission-mode では既定を覚えない", async () => {
    const { manager, stub, remembered } = startManagerWithStub()

    await manager.dispatch({ type: "set-model", commandId: "c-1", model: "haiku" })
    await manager.dispatch({
      type: "set-permission-mode",
      commandId: "c-2",
      mode: "bypassPermissions",
    })

    expect(remembered).toEqual([])
    expect(stub.calls).toEqual(["setModel:haiku", "setPermissionMode:bypassPermissions"])
  })
})

describe("依頼に添えた画像の棚", () => {
  // 原寸は**手で組んだ大きめの架空の data URL**（実物の画像は使わない）。hello に載っていれば
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
      batchIntervalMs: BATCH_MS,
      chatCompactThresholdBytes: CHAT_COMPACT_THRESHOLD_BYTES,
      chatArchive: NOOP_CHAT_ARCHIVE,
      tokenUsageLog: NOOP_TOKEN_USAGE_LOG,
      contextUsageLog: NOOP_CONTEXT_USAGE_LOG,
      promptImageShelf: shelf,
      rememberSessionDefault: (sessionDefault) => ({
        kind: "session-default-changed",
        sessionDefault,
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
      manager.dispatch({ type: "prompt", commandId: "c", text: "架空の依頼", images })
    return { manager, shelf, prompted, prompt }
  }

  function helloOf(frames: readonly ServerFrame[]): string {
    const hello = frames.find((frame) => frame.type === "hello")
    return JSON.stringify(hello)
  }

  it("prompt の原寸を棚に置き、振った id を駆動へ渡す（棚から同じ原寸が引ける）", async () => {
    const { shelf, prompted, prompt } = startManagerWithShelf()

    await prompt([fullImage("A")])

    const [shelved] = prompted[0] ?? []
    expect(shelved?.full).toBe(fullImage("A").full)
    expect(shelf.find(shelved?.id ?? "")).toBe(fullImage("A").full)
  })

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

    await manager.dispatch({
      type: "switch-character",
      commandId: "c-switch",
      name: "fictional",
    })

    expect(shelf.find(id)).toBeUndefined()
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
      batchIntervalMs: BATCH_MS,
      chatCompactThresholdBytes: CHAT_COMPACT_THRESHOLD_BYTES,
      chatArchive: NOOP_CHAT_ARCHIVE,
      tokenUsageLog: NOOP_TOKEN_USAGE_LOG,
      contextUsageLog: NOOP_CONTEXT_USAGE_LOG,
      promptImageShelf: createPromptImageShelf(),
      rememberSessionDefault: (sessionDefault) => ({
        kind: "session-default-changed",
        sessionDefault,
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

    await manager.dispatch({ type: "switch-character", commandId: "c-switch", name: "fictional" })

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

    const result = await manager.dispatch({
      type: "dismiss-usage-proposal",
      commandId: "c-dismiss",
      kind: dismissed.kind,
      target: dismissed.target,
    })

    expect(result).toEqual({ ok: true })
    expect(dismissedUsageProposals).toEqual([
      {
        type: "dismiss-usage-proposal",
        commandId: "c-dismiss",
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
