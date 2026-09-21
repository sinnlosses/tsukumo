import { describe, expect, it } from "bun:test"

import { type CharacterSelection } from "../../../src/server/core/character-selection.ts"
import { CHAT_NUDGE_PROMPT } from "../../../src/server/core/chat-nudge.ts"
import {
  type ChatArchive,
  type ChatArchiveEntry,
  type SessionDriver,
} from "../../../src/server/core/session-driver.ts"
import { type SessionLaunchRequest } from "../../../src/server/core/session-launch.ts"
import { createSessionManager } from "../../../src/server/core/session-manager.ts"
import { CHAT_COMPACT_THRESHOLD_BYTES } from "../../../src/shared/chat-log.ts"
import {
  type CharacterCreateCommand,
  type CharacterEditCommand,
} from "../../../src/shared/command.ts"
import {
  FRAME_ERROR_REASON,
  PROTOCOL_VERSION,
  type ServerFrame,
} from "../../../src/shared/frame.ts"
import { type SessionEvent } from "../../../src/shared/session-event.ts"
import { INITIAL_SESSION_STATE } from "../../../src/shared/session-state.ts"

// 疑似セッションもセリフも手で書いた架空のもの（docs/coding-standards.md「会話内容の扱い」）。
const SESSION_ID = "s-test"
const BATCH_MS = 5

/** 雑談の会話のアーカイブを気にしないテストに渡す、何もしない書き込み口。 */
const NOOP_CHAT_ARCHIVE: ChatArchive = { append: () => {}, readRecent: () => [] }

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
const CHARACTER_EVENT: SessionEvent = {
  kind: "character-changed",
  pack: "fictional",
  name: "架空の精霊",
  accent: undefined,
  speechMarker: undefined,
  editable: true,
  expressions: [{ name: "default", label: "通常" }],
  portraits: {
    default: "/character/default.png?v=fictional@2",
    thinking: undefined,
    proud: undefined,
    flustered: undefined,
    serious: undefined,
    curious: undefined,
    sad: undefined,
    excited: undefined,
  },
  mini: undefined,
  outfitAccents: { default: "#b8c7ff", light: undefined, normal: undefined, heavy: undefined },
  background: undefined,
  packs: [{ name: "fictional", label: "架空の精霊" }],
}

function startManagerWithStub(writeResult: "written" | "rejected" = "written") {
  const stub = createStubDriver()
  const edits: CharacterEditCommand[] = []
  const creates: CharacterCreateCommand[] = []
  const written = (): SessionEvent | undefined =>
    writeResult === "written" ? CHARACTER_EVENT : undefined
  const manager = createSessionManager({
    now: () => 1_000,
    batchIntervalMs: BATCH_MS,
    chatCompactThresholdBytes: CHAT_COMPACT_THRESHOLD_BYTES,
    chatArchive: NOOP_CHAT_ARCHIVE,
  })
  manager.create({
    sessionId: SESSION_ID,
    startDriver: (onEvent) => {
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
  })
  return { manager, stub, edits, creates }
}

function waitForBatch(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, BATCH_MS * 4))
}

describe("createSessionManager", () => {
  it("subscribe した直後に hello（snapshot）が届き、以降は events が続く", async () => {
    const { manager, stub } = startManagerWithStub()
    const frames: ServerFrame[] = []

    manager.subscribe(SESSION_ID, (frame) => frames.push(frame))
    stub.emit({ kind: "speech", text: "架空のセリフ", expression: "default" })
    await waitForBatch()

    const [hello, events] = frames
    expect(hello).toEqual({
      type: "hello",
      protocolVersion: PROTOCOL_VERSION,
      sessionId: SESSION_ID,
      state: expect.objectContaining({ speeches: [] }),
    })
    expect(events).toEqual({
      type: "events",
      events: [
        { at: 1_000, event: { kind: "speech", text: "架空のセリフ", expression: "default" } },
      ],
    })
  })

  it("hello の snapshot は、それまでのイベントをサーバ側でも畳んだ姿", async () => {
    const { manager, stub } = startManagerWithStub()
    stub.emit({ kind: "speech", text: "先に流れたセリフ", expression: "proud" })
    await waitForBatch()

    const frames: ServerFrame[] = []
    manager.subscribe(SESSION_ID, (frame) => frames.push(frame))

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
    manager.subscribe(SESSION_ID, (frame) => frames.push(frame))

    stub.emit({ kind: "partial-utterance", text: "架空の" })
    stub.emit({ kind: "partial-utterance", text: "本文" })
    stub.emit({ kind: "turn-finished", status: "success" })
    await waitForBatch()

    const events = frames.filter((frame) => frame.type === "events")
    expect(events).toHaveLength(1)
    const first = events[0]
    if (first?.type === "events") {
      expect(first.events.map((stamped) => stamped.event)).toEqual([
        { kind: "partial-utterance", text: "架空の本文" },
        { kind: "turn-finished", status: "success" },
      ])
    }
  })

  it("dispatch がコマンドを駆動へ渡す（分岐はここだけ）", async () => {
    const { manager, stub } = startManagerWithStub()

    expect(
      await manager.dispatch(SESSION_ID, {
        type: "prompt",
        commandId: "c-1",
        text: "架空の依頼",
        images: [],
      }),
    ).toEqual({ ok: true })
    expect(await manager.dispatch(SESSION_ID, { type: "interrupt", commandId: "c-2" })).toEqual({
      ok: true,
    })
    expect(
      await manager.dispatch(SESSION_ID, { type: "set-model", commandId: "c-3", model: "sonnet" }),
    ).toEqual({ ok: true })
    expect(
      await manager.dispatch(SESSION_ID, {
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

  it("知らないセッション・解決済みの答え待ちは、定型文の理由で受け付けない", async () => {
    const { manager, stub } = startManagerWithStub()
    stub.answerable = false

    expect(await manager.dispatch("s-unknown", { type: "interrupt", commandId: "c-1" })).toEqual({
      ok: false,
      reason: FRAME_ERROR_REASON.noSession,
    })
    expect(
      await manager.dispatch(SESSION_ID, {
        type: "answer",
        commandId: "c-2",
        id: "toolu_gone",
        answer: { kind: "allow" },
      }),
    ).toEqual({ ok: false, reason: FRAME_ERROR_REASON.unresolvedAnswer })
  })

  it("switch-character で駆動を閉じ、別のパックで起こし直して新しい hello を配る", async () => {
    // 起こされた駆動を順に覚える（`startDriver` に渡るパックの決め方もここで見る）。
    const started: { readonly selection: CharacterSelection; readonly stub: StubDriver }[] = []
    const manager = createSessionManager({
      now: () => 1_000,
      batchIntervalMs: BATCH_MS,
      chatCompactThresholdBytes: CHAT_COMPACT_THRESHOLD_BYTES,
      chatArchive: NOOP_CHAT_ARCHIVE,
    })
    manager.create({
      sessionId: SESSION_ID,
      startDriver: (onEvent, _onRestoredEvent, request) => {
        const stub = createStubDriver()
        stub.attach(onEvent)
        started.push({ selection: request.selection, stub })
        return Promise.resolve(stub.driver)
      },
      editCharacter: () => Promise.resolve(undefined),
      createCharacter: () => Promise.resolve(undefined),
    })

    const frames: ServerFrame[] = []
    manager.subscribe(SESSION_ID, (frame) => frames.push(frame))
    started[0]?.stub.emit({ kind: "speech", text: "切り替える前のセリフ", expression: "default" })
    await waitForBatch()

    expect(
      await manager.dispatch(SESSION_ID, {
        type: "switch-character",
        commandId: "c-1",
        name: "fictional",
      }),
    ).toEqual({ ok: true })

    // 前の駆動は閉じ、新しい駆動が**画面から選ばれた名前**で起きている（＝覚える側。
    // docs/design.md 13.6）。
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
      await manager.dispatch(SESSION_ID, {
        type: "prompt",
        commandId: "c-1",
        text: "架空の依頼",
        images: [],
      }),
    ).toEqual({ ok: true })
    stub.emit({ kind: "request", text: "架空の依頼", images: [] })
    await waitForBatch()

    expect(
      await manager.dispatch(SESSION_ID, {
        type: "switch-character",
        commandId: "c-2",
        name: "fictional",
      }),
    ).toEqual({ ok: false, reason: FRAME_ERROR_REASON.switchDuringTurn })
    expect(stub.calls).not.toContain("close")

    stub.emit({ kind: "turn-finished", status: "success" })
    await waitForBatch()

    expect(
      await manager.dispatch(SESSION_ID, {
        type: "switch-character",
        commandId: "c-3",
        name: "fictional",
      }),
    ).toEqual({ ok: true })
    expect(stub.calls).toContain("close")
  })

  it("set-chat-mode で雑談を指定して起こし直し、いま出しているパックは保つ", async () => {
    // 雑談の切り替えは `systemPrompt` の差し替えなので、`switch-character` と同じ起こし直しに
    // なる（docs/requirements.md 4.9）。**パックは変えない**ことをここで見る。
    const started: SessionLaunchRequest[] = []
    const manager = createSessionManager({
      now: () => 1_000,
      batchIntervalMs: BATCH_MS,
      chatCompactThresholdBytes: CHAT_COMPACT_THRESHOLD_BYTES,
      chatArchive: NOOP_CHAT_ARCHIVE,
    })
    manager.create({
      sessionId: SESSION_ID,
      startDriver: (onEvent, _onRestoredEvent, request) => {
        const stub = createStubDriver()
        stub.attach(onEvent)
        started.push(request)
        return Promise.resolve(stub.driver)
      },
      editCharacter: () => Promise.resolve(undefined),
      createCharacter: () => Promise.resolve(undefined),
    })
    manager.subscribe(SESSION_ID, () => {})

    expect(
      await manager.dispatch(SESSION_ID, { type: "set-chat-mode", commandId: "c-1", chat: true }),
    ).toEqual({ ok: true })

    expect(started).toHaveLength(2)
    expect(started[1]?.chat).toBe(true)
    // **パックは「いま出しているまま」として渡す**（名前では渡さない）。名前で渡すと画面から
    // 選ばれたのと区別がつかず、モードを切り替えただけで覚えた値が書き換わる
    // （docs/design.md 13.6）。
    expect(started[1]?.selection).toEqual({ by: "current" })
    // 起動の1回目は初期パック（こちらも覚えない側）。
    expect(started[0]?.selection).toEqual({ by: "initial" })
  })

  it("雑談から仕事へ戻すときも起こし直す", async () => {
    const started: SessionLaunchRequest[] = []
    const manager = createSessionManager({
      now: () => 1_000,
      batchIntervalMs: BATCH_MS,
      chatCompactThresholdBytes: CHAT_COMPACT_THRESHOLD_BYTES,
      chatArchive: NOOP_CHAT_ARCHIVE,
    })
    manager.create({
      sessionId: SESSION_ID,
      startDriver: (onEvent, _onRestoredEvent, request) => {
        const stub = createStubDriver()
        stub.attach(onEvent)
        started.push(request)
        return Promise.resolve(stub.driver)
      },
      editCharacter: () => Promise.resolve(undefined),
      createCharacter: () => Promise.resolve(undefined),
    })
    manager.subscribe(SESSION_ID, () => {})

    await manager.dispatch(SESSION_ID, { type: "set-chat-mode", commandId: "c-1", chat: true })
    await manager.dispatch(SESSION_ID, { type: "set-chat-mode", commandId: "c-2", chat: false })

    expect(started.map((request) => request.chat)).toEqual([undefined, true, false])
  })

  it("ターン進行中の set-chat-mode は定型文の理由で受け付けず、駆動を閉じない", async () => {
    const { manager, stub } = startManagerWithStub()

    expect(
      await manager.dispatch(SESSION_ID, {
        type: "prompt",
        commandId: "c-1",
        text: "架空の依頼",
        images: [],
      }),
    ).toEqual({ ok: true })
    stub.emit({ kind: "request", text: "架空の依頼", images: [] })
    await waitForBatch()

    expect(
      await manager.dispatch(SESSION_ID, { type: "set-chat-mode", commandId: "c-2", chat: true }),
    ).toEqual({ ok: false, reason: FRAME_ERROR_REASON.switchDuringTurn })
    expect(stub.calls).not.toContain("close")
  })

  it("駆動が起き上がるのを待ってから、新しい hello を配る（続きから始めるセッションを探す間）", async () => {
    // 駆動を起こすのに外の世界（transcript の一覧）を読むので、`startDriver` は待てる形で返る。
    const started: StubDriver[] = []
    const manager = createSessionManager({
      now: () => 1_000,
      batchIntervalMs: BATCH_MS,
      chatCompactThresholdBytes: CHAT_COMPACT_THRESHOLD_BYTES,
      chatArchive: NOOP_CHAT_ARCHIVE,
    })
    manager.create({
      sessionId: SESSION_ID,
      startDriver: async (onEvent) => {
        const stub = createStubDriver()
        stub.attach(onEvent)
        await waitForBatch()
        started.push(stub)
        return stub.driver
      },
      editCharacter: () => Promise.resolve(undefined),
      createCharacter: () => Promise.resolve(undefined),
    })

    const frames: ServerFrame[] = []
    manager.subscribe(SESSION_ID, (frame) => frames.push(frame))

    // 起き上がる前に届いた依頼も、待ってから渡る（取りこぼさない）。
    expect(
      await manager.dispatch(SESSION_ID, {
        type: "prompt",
        commandId: "c-1",
        text: "架空の依頼",
        images: [],
      }),
    ).toEqual({ ok: true })
    expect(started[0]?.calls).toEqual(["prompt:架空の依頼"])

    expect(
      await manager.dispatch(SESSION_ID, {
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

      expect(await manager.dispatch(SESSION_ID, { type: "nudge", commandId: "c-1" })).toEqual({
        ok: true,
      })

      // 渡るのは `promptWithoutRecord`（記録に残さない口）だけで、`prompt` は呼ばれない
      // ——ログにも記録にも雑談の会話のアーカイブにも残らない（docs/design.md 13.7）。
      expect(stub.calls).toEqual([`promptWithoutRecord:${CHAT_NUDGE_PROMPT}`])
    })

    it("仕事のモードでは受け付けない（メインビューにキャラクター発のターンを混ぜない）", async () => {
      const { manager, stub } = startManagerWithStub()
      await waitForBatch()

      expect(await manager.dispatch(SESSION_ID, { type: "nudge", commandId: "c-1" })).toEqual({
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

      expect(await manager.dispatch(SESSION_ID, { type: "nudge", commandId: "c-1" })).toEqual({
        ok: false,
        reason: FRAME_ERROR_REASON.nudgeDuringTurn,
      })
      expect(stub.calls).toEqual([])
    })
  })

  describe("雑談の記憶の圧縮", () => {
    // 本番の閾値（32 KiB）だと架空の短い文面では届かないので、**`SessionManagerOptions` の
    // フィールドに小さい閾値を渡して**テストする（`batchIntervalMs` と同じ形。
    // docs/requirements.md 4.9）。
    const TINY_THRESHOLD_BYTES = 10

    function startChatManagerWithStub(thresholdBytes: number) {
      const stub = createStubDriver()
      const manager = createSessionManager({
        now: () => 1_000,
        batchIntervalMs: BATCH_MS,
        chatCompactThresholdBytes: thresholdBytes,
        chatArchive: NOOP_CHAT_ARCHIVE,
      })
      manager.create({
        sessionId: SESSION_ID,
        startDriver: (onEvent) => {
          stub.attach(onEvent)
          return Promise.resolve(stub.driver)
        },
        editCharacter: () => Promise.resolve(undefined),
        createCharacter: () => Promise.resolve(undefined),
      })
      return { manager, stub }
    }

    it("閾値を超えたターンの終わりに /compact を1回だけ送る", async () => {
      const { stub } = startChatManagerWithStub(TINY_THRESHOLD_BYTES)
      // 駆動が起き上がる（`live` が入る）のを待ってから、雑談へ入って往復する。
      await waitForBatch()

      stub.emit({ kind: "chat-mode-changed", chat: true })
      stub.emit({ kind: "request", text: "架空の依頼です", images: [] })
      stub.emit({ kind: "speech", text: "架空のセリフです", expression: "default" })
      stub.emit({ kind: "turn-finished", status: "success" })
      await waitForBatch()

      const compactCalls = stub.calls.filter((call) => call.startsWith("prompt:/compact "))
      expect(compactCalls).toHaveLength(1)

      // 送ったら走行合計が0に戻るので、続けて終わっただけの次のターンでは再送しない
      // （「投げたら数え直す」）。
      stub.emit({ kind: "request", text: "b", images: [] })
      stub.emit({ kind: "turn-finished", status: "success" })
      await waitForBatch()

      expect(stub.calls.filter((call) => call.startsWith("prompt:/compact "))).toHaveLength(1)
    })

    it("閾値を超えていなければ送らない", async () => {
      const { stub } = startChatManagerWithStub(1_000_000)
      await waitForBatch()

      stub.emit({ kind: "chat-mode-changed", chat: true })
      stub.emit({ kind: "request", text: "架空の依頼です", images: [] })
      stub.emit({ kind: "speech", text: "架空のセリフです", expression: "default" })
      stub.emit({ kind: "turn-finished", status: "success" })
      await waitForBatch()

      expect(stub.calls.some((call) => call.startsWith("prompt:/compact "))).toBe(false)
    })

    it("仕事のモード（雑談に入っていない）では、閾値を超えていても送らない", async () => {
      const { stub } = startChatManagerWithStub(TINY_THRESHOLD_BYTES)
      await waitForBatch()

      // chat-mode-changed を流さないので chatMode は既定の false のまま。
      stub.emit({ kind: "request", text: "架空の依頼です", images: [] })
      stub.emit({ kind: "speech", text: "架空のセリフです", expression: "default" })
      stub.emit({ kind: "turn-finished", status: "success" })
      await waitForBatch()

      expect(stub.calls.some((call) => call.startsWith("prompt:/compact "))).toBe(false)
    })

    it("画面の窓（雑談は直近100ターン）で state.records が切り詰められたあとでも、走行合計は届く", async () => {
      // 1ターンあたり "xxxxx"（5バイト）+ "yyyyy"（5バイト）＝10バイト。
      // 閾値 1,200 は「窓に残る直近100ターンぶん」（1,000バイト）より大きく、
      // 「150ターン分の総量」（1,500バイト）より小さい —
      // `state.records`（`trimToRecentTurns` で直近100ターンに切り詰められる）から数えていたら
      // 一生届かない値を、あえて選んでいる（`docs/requirements.md` 4.9）。
      const { stub } = startChatManagerWithStub(1_200)
      await waitForBatch()

      stub.emit({ kind: "chat-mode-changed", chat: true })
      for (let turn = 0; turn < 150; turn += 1) {
        stub.emit({ kind: "request", text: "xxxxx", images: [] })
        stub.emit({ kind: "speech", text: "yyyyy", expression: "default" })
        stub.emit({ kind: "turn-finished", status: "success" })
      }
      await waitForBatch()

      expect(stub.calls.filter((call) => call.startsWith("prompt:/compact "))).toHaveLength(1)
    })
  })

  it("立ち絵を変えるコマンドは駆動へ渡さず、書けたら character-changed を畳んで配る", async () => {
    const { manager, stub, edits } = startManagerWithStub()
    const frames: ServerFrame[] = []
    manager.subscribe(SESSION_ID, (frame) => frames.push(frame))

    expect(
      await manager.dispatch(SESSION_ID, {
        type: "set-portrait",
        commandId: "c-1",
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

  it("差し色を変えるコマンドも同じ経路を通る", async () => {
    const { manager, edits } = startManagerWithStub()

    expect(
      await manager.dispatch(SESSION_ID, {
        type: "set-outfit-accent",
        commandId: "c-1",
        outfit: "heavy",
        color: "#ffb3a7",
      }),
    ).toEqual({ ok: true })

    expect(edits.map((edit) => edit.type)).toEqual(["set-outfit-accent"])
  })

  it("新しいパックを作るコマンドも駆動へ渡さず、選択肢の増えた character-changed を配る", async () => {
    const { manager, stub, edits, creates } = startManagerWithStub()
    const frames: ServerFrame[] = []
    manager.subscribe(SESSION_ID, (frame) => frames.push(frame))

    expect(
      await manager.dispatch(SESSION_ID, {
        type: "create-character",
        commandId: "c-1",
        name: "fictional-2",
        portraits: {
          default: "data:image/png;base64,AAAA",
        },
        accent: "#b8c7ff",
      }),
    ).toEqual({ ok: true })
    await waitForBatch()

    // 駆動には何も渡らない（**作っただけでは切り替えない**ので、起こし直しも起きない）。
    expect(stub.calls).toEqual([])
    expect(edits).toEqual([])
    expect(creates.map((create) => create.name)).toEqual(["fictional-2"])
    const events = frames.filter((frame) => frame.type === "events").at(-1)
    if (events?.type === "events") {
      expect(events.events.map((stamped) => stamped.event)).toEqual([CHARACTER_EVENT])
    }
    expect(frames.filter((frame) => frame.type === "hello")).toHaveLength(1)
  })

  it("パックを作れなかったら、作る側の定型文の理由を返す", async () => {
    const { manager } = startManagerWithStub("rejected")

    expect(
      await manager.dispatch(SESSION_ID, {
        type: "create-character",
        commandId: "c-1",
        name: "fictional",
        portraits: {
          default: "data:image/png;base64,AAAA",
        },
        accent: "#b8c7ff",
      }),
    ).toEqual({ ok: false, reason: FRAME_ERROR_REASON.characterCreateFailed })
  })

  it("書き込みが受け付けられなかったら定型文の理由を返し、状態は動かさない", async () => {
    const { manager } = startManagerWithStub("rejected")
    const frames: ServerFrame[] = []
    manager.subscribe(SESSION_ID, (frame) => frames.push(frame))

    expect(
      await manager.dispatch(SESSION_ID, {
        type: "clear-portrait",
        commandId: "c-1",
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
    })
    manager.create({
      sessionId: SESSION_ID,
      startDriver: (onEvent, _onRestoredEvent, request) => {
        if (request.selection.by === "initial") {
          const stub = createStubDriver()
          stub.attach(onEvent)
          return Promise.resolve(stub.driver)
        }
        return Promise.reject(new Error("架空の起こし直し失敗"))
      },
      editCharacter: () => Promise.resolve(undefined),
      createCharacter: () => Promise.resolve(undefined),
    })

    expect(
      await manager.dispatch(SESSION_ID, {
        type: "switch-character",
        commandId: "c-1",
        name: "fictional",
      }),
    ).toEqual({ ok: false, reason: FRAME_ERROR_REASON.driverFailed })

    // 常駐プロセスは落ちない。subscribe はそのまま動く。
    const frames: ServerFrame[] = []
    manager.subscribe(SESSION_ID, (frame) => frames.push(frame))
    expect(frames).toHaveLength(1)
  })

  it("キャラクターへの書き込みが例外を投げても定型文の理由を返す", async () => {
    const manager = createSessionManager({
      now: () => 1_000,
      batchIntervalMs: BATCH_MS,
      chatCompactThresholdBytes: CHAT_COMPACT_THRESHOLD_BYTES,
      chatArchive: NOOP_CHAT_ARCHIVE,
    })
    const stub = createStubDriver()
    manager.create({
      sessionId: SESSION_ID,
      startDriver: (onEvent) => {
        stub.attach(onEvent)
        return Promise.resolve(stub.driver)
      },
      editCharacter: () => Promise.reject(new Error("架空の書き込み失敗")),
      createCharacter: () => Promise.resolve(undefined),
    })

    expect(
      await manager.dispatch(SESSION_ID, {
        type: "clear-portrait",
        commandId: "c-1",
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
    })
    manager.create({
      sessionId: SESSION_ID,
      startDriver: () =>
        Promise.resolve({
          prompt: () => {},
          promptWithoutRecord: () => {},
          interrupt: () => Promise.reject(new Error("架空の駆動エラー")),
          answer: () => true,
          pending: () => [],
          setModel: () => Promise.resolve(),
          setPermissionMode: () => Promise.resolve(),
          close: () => {},
        }),
      editCharacter: () => Promise.resolve(undefined),
      createCharacter: () => Promise.resolve(undefined),
    })

    expect(await manager.dispatch(SESSION_ID, { type: "interrupt", commandId: "c-1" })).toEqual({
      ok: false,
      reason: FRAME_ERROR_REASON.driverFailed,
    })

    // 落ちていないので、次のコマンドも受け付ける。
    expect(
      await manager.dispatch(SESSION_ID, {
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
    manager.subscribe(SESSION_ID, (frame) => frames.push(frame))

    manager.close()
    stub.emit({ kind: "speech", text: "閉じたあとのセリフ", expression: "default" })
    await waitForBatch()

    expect(stub.calls).toContain("close")
    expect(frames.filter((frame) => frame.type === "events")).toHaveLength(0)
  })

  describe("雑談の会話のアーカイブ", () => {
    // `chatArchive` の実装（ファイルI/O）は adapter のテストが持つ。ここで見るのは
    // 「いつ・何を渡すか」（`session-manager.receive` の分岐）だけ（docs/requirements.md 4.9）。

    function startArchiveManagerWithStub() {
      const stub = createStubDriver()
      const archiveCalls: { readonly packName: string; readonly entry: ChatArchiveEntry }[] = []
      const chatArchive: ChatArchive = {
        append: (packName, entry) => {
          archiveCalls.push({ packName, entry })
        },
        // 読み戻しは起こすときの配線（`src/session-start.ts`）が使う口で、ここは通らない。
        readRecent: () => [],
      }
      const manager = createSessionManager({
        now: () => 1_000,
        batchIntervalMs: BATCH_MS,
        chatCompactThresholdBytes: CHAT_COMPACT_THRESHOLD_BYTES,
        chatArchive,
      })
      manager.create({
        sessionId: SESSION_ID,
        startDriver: (onEvent, onRestoredEvent) => {
          stub.attach(onEvent)
          stub.attachRestored(onRestoredEvent)
          return Promise.resolve(stub.driver)
        },
        editCharacter: () => Promise.resolve(undefined),
        createCharacter: () => Promise.resolve(undefined),
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
        images: ["data:image/png;base64,AAAA", "data:image/png;base64,BBBB"],
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
})
