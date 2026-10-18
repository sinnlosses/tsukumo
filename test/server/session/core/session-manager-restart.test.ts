import { describe, expect, it } from "vitest"

import type { SessionLaunchRequest } from "../../../../src/server/session/core/session-launch.ts"
import { FRAME_ERROR_REASON, type ServerFrame } from "../../../../src/shared/frame.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"
import { INITIAL_SESSION_STATE } from "../../../../src/shared/session/session-state.ts"
import { createStubDriver, type StubDriver } from "../../../fixture/session-driver.ts"
import {
  CHARACTER_EVENT,
  createSessionManager,
  startManagerWithStub,
  waitForBatch,
} from "../../../fixture/session-manager.ts"

describe("createSessionManager", () => {
  it("session.switchCharacter で駆動を閉じ、別のパックで起こし直して新しい hello を配る", async () => {
    // 起こされた駆動を、渡された要求と一緒に順に覚える。
    const started: { readonly request: SessionLaunchRequest; readonly stub: StubDriver }[] = []
    const manager = createSessionManager({
      launchSession: (onEvent, _onRestoredEvents, request) => {
        const stub = createStubDriver()
        stub.attach(onEvent)
        started.push({ request, stub })
        return Promise.resolve(stub.driver)
      },
    })

    const frames: ServerFrame[] = []
    manager.subscribe((frame) => frames.push(frame))
    started[0]?.stub.emit({ kind: "speech", text: "切り替える前のセリフ", expression: "default" })
    await waitForBatch()

    expect(await manager.commands.session.switchCharacter({ name: "fictional" })).toEqual({
      ok: true,
    })

    // 起動の1代目は初期パック・新規のセッション（どちらも覚えない側）。
    expect(started[0]?.request).toEqual({
      selection: { by: "initial" },
      chat: undefined,
      resume: { by: "new" },
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

  it("起こし直したあとの迎えの挨拶は、前の代の挨拶の記録を残さず新しい1件で積む", async () => {
    const stubs: StubDriver[] = []
    const manager = createSessionManager({
      launchSession: (onEvent) => {
        const stub = createStubDriver()
        stub.attach(onEvent)
        stubs.push(stub)
        return Promise.resolve(stub.driver)
      },
    })
    const greeted = (withoutCard: string): SessionEvent => ({
      kind: "welcome-greeting-changed",
      state: {
        kind: "written",
        greeting: { withCard: "架空の挨拶、{札} からどう？", withoutCard, expression: "curious" },
      },
    })
    const welcomeTexts = (): readonly string[] =>
      manager.commandSession
        .state()
        .records.flatMap((record) =>
          record.kind === "reaction" && record.reaction === "welcome" ? [record.text] : [],
        )

    stubs[0]?.emit(CHARACTER_EVENT)
    stubs[0]?.emit(greeted("前の代の架空の挨拶"))
    await waitForBatch()
    await manager.commands.session.recordWelcomeGreeting({
      text: "前の代の架空の挨拶",
      expression: "curious",
    })
    await waitForBatch()
    expect(welcomeTexts()).toEqual(["前の代の架空の挨拶"])

    await manager.commands.session.switchCharacter({ name: "fictional" })
    stubs[1]?.emit(CHARACTER_EVENT)
    stubs[1]?.emit(greeted("次の代の架空の挨拶"))
    await waitForBatch()

    expect(
      await manager.commands.session.recordWelcomeGreeting({
        text: "前の代の架空の挨拶",
        expression: "curious",
      }),
    ).toEqual({ ok: false, reason: FRAME_ERROR_REASON.welcomeGreetingNotShown })
    await manager.commands.session.recordWelcomeGreeting({
      text: "架空の挨拶、T-1 からどう？",
      expression: "curious",
    })
    await waitForBatch()

    expect(welcomeTexts()).toEqual(["架空の挨拶、T-1 からどう？"])
  })

  it("起こし直しの間に新しい駆動が流したイベントは、新しい hello より先に配らない", async () => {
    // 起き上がりに時間がかかる駆動（本物の claude は起動に数秒かかる）。その間に
    // `chat-mode-changed` などが先に流れると、ブラウザは前のセッションの状態のまま雑談へ
    // 切り替わり、前の立ち絵が一瞬出てから新しい hello で入れ替わる。
    const releases: (() => void)[] = []
    const manager = createSessionManager({
      launchSession: (onEvent, _onRestoredEvents, request) => {
        const stub = createStubDriver()
        stub.attach(onEvent)
        onEvent({ kind: "chat-mode-changed", chat: request.chat ?? false })
        return new Promise((resolve) => {
          releases.push(() => resolve(stub.driver))
        })
      },
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
      launchSession: async (onEvent) => {
        const stub = createStubDriver()
        stub.attach(onEvent)
        await waitForBatch()
        started.push(stub)
        return stub.driver
      },
    })

    const frames: ServerFrame[] = []
    manager.subscribe((frame) => frames.push(frame))

    // 起き上がる前に届いた依頼も、待ってから渡る（取りこぼさない）。
    expect(await manager.commands.session.prompt({ text: "架空の依頼", images: [] })).toEqual({
      ok: true,
    })
    expect(started[0]?.calls).toEqual(["prompt:request:架空の依頼"])

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
      launchSession: (onEvent, _onRestoredEvents, request) => {
        if (request.selection.by === "initial") {
          const stub = createStubDriver()
          stub.attach(onEvent)
          return Promise.resolve(stub.driver)
        }
        return Promise.reject(new Error("架空の起こし直し失敗"))
      },
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
})
