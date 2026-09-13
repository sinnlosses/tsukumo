import { describe, expect, it } from "bun:test"

import { type SessionDriver } from "../../src/core/session-driver.ts"
import { createSessionManager } from "../../src/core/session-manager.ts"
import { FRAME_ERROR_REASON, PROTOCOL_VERSION, type ServerFrame } from "../../src/protocol/frame.ts"
import { type SessionEvent } from "../../src/protocol/session-event.ts"

// 台本もセリフも手で書いた架空のもの（docs/coding-standards.md「会話内容の扱い」）。
const SESSION_ID = "s-test"
const BATCH_MS = 5

/** 呼ばれた回数と引数だけを覚える、テスト用の駆動。**本物の claude は起こさない。** */
function createStubDriver(): {
  readonly driver: SessionDriver
  readonly emit: (event: SessionEvent) => void
  readonly attach: (onEvent: (event: SessionEvent) => void) => void
  readonly calls: string[]
  answerable: boolean
} {
  const calls: string[] = []
  let onEvent: (event: SessionEvent) => void = () => {}
  const stub = {
    driver: {
      prompt: (text: string) => calls.push(`prompt:${text}`),
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
    calls,
    answerable: true,
  }
  return stub
}

function startManagerWithStub() {
  const stub = createStubDriver()
  const manager = createSessionManager({ now: () => 1_000, batchIntervalMs: BATCH_MS })
  manager.create({
    sessionId: SESSION_ID,
    startDriver: (onEvent) => {
      stub.attach(onEvent)
      return stub.driver
    },
  })
  return { manager, stub }
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
      await manager.dispatch(SESSION_ID, { type: "prompt", commandId: "c-1", text: "架空の依頼" }),
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
})
