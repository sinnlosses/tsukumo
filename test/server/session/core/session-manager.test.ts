import { describe, expect, it } from "vitest"

import type {
  ChatArchive,
  ChatArchiveEntry,
} from "../../../../src/server/chat/core/chat-archive-port.ts"
import type {
  ChatConsolidationOutcome,
  ChatConsolidationSource,
} from "../../../../src/server/chat/core/chat-consolidation-writer.ts"
import type { NumstatOutput } from "../../../../src/server/core/change-count-git.ts"
import type { SessionLaunchRequest } from "../../../../src/server/session/core/session-launch.ts"
import type { SessionManagerOptions } from "../../../../src/server/session/core/session-manager.ts"
import type { DiagnosticEntry } from "../../../../src/shared/diagnostic/diagnostic-record.ts"
import {
  FRAME_ERROR_REASON,
  PROTOCOL_VERSION,
  type ServerFrame,
} from "../../../../src/shared/frame.ts"
import { UNAVAILABLE_SESSION_DIGEST } from "../../../../src/shared/session/session-digest.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"
import {
  applyRestoredEvents,
  INITIAL_SESSION_STATE,
} from "../../../../src/shared/session/session-state.ts"
import { characterChangedEvent } from "../../../fixture/character.ts"
import { NOOP_CHAT_ARCHIVE } from "../../../fixture/chat.ts"
import { readyContextUsage } from "../../../fixture/context-usage.ts"
import { reportEvent } from "../../../fixture/report-event.ts"
import { knownRestored } from "../../../fixture/restored-event.ts"
import {
  createStubDriver,
  FAKE_SESSION_DIGEST,
  type StubDriver,
} from "../../../fixture/session-driver.ts"
import {
  CHARACTER_EVENT,
  createSessionManager,
  FICTIONAL_PROJECT,
  RESTORED_REPLAY,
  startManagerWithStub,
  waitForBatch,
} from "../../../fixture/session-manager.ts"

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
          worktree: "fictional-tree",
          inCurrentWorktree: true,
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
      expect(hello.state.speeches).toEqual([
        {
          text: "先に流れたセリフ",
          expression: "proud",
          time: { kind: "stamped", at: 1000 },
        },
      ])
      expect(hello.state.speechExpression).toBe("proud")
    }
  })

  describe("見届けた設定の合図", () => {
    const confirmed = (value: string): SessionEvent => ({
      kind: "setting-confirmed",
      setting: "model",
      value,
    })
    const eventsOf = (frames: readonly ServerFrame[]) =>
      frames.flatMap((frame) => (frame.type === "events" ? frame.events.map((e) => e.event) : []))

    it("同じ値が続くときは最初の1回だけ流し、値が変わればまた流す", async () => {
      const { manager, stub } = startManagerWithStub()
      const frames: ServerFrame[] = []
      manager.subscribe((frame) => frames.push(frame))

      stub.emit(confirmed("fake-model-a"))
      stub.emit(confirmed("fake-model-a"))
      stub.emit(confirmed("fake-model-b"))
      stub.emit(confirmed("fake-model-b"))
      await waitForBatch()

      expect(eventsOf(frames)).toEqual([confirmed("fake-model-a"), confirmed("fake-model-b")])
    })

    it("起こし直した代の最初の1回は、前の代と同じ値でも流す", async () => {
      const { manager, stub } = startManagerWithStub()
      const frames: ServerFrame[] = []
      manager.subscribe((frame) => frames.push(frame))
      stub.emit(confirmed("fake-model-a"))
      await waitForBatch()

      await manager.commands.session.setChatMode({ chat: true })
      stub.emit(confirmed("fake-model-a"))
      await waitForBatch()

      expect(eventsOf(frames).filter((e) => e.kind === "setting-confirmed")).toHaveLength(2)
    })

    it("同じ値を落とす経路でも、受け付けた値は見届けられて confirmed になる", async () => {
      const { manager, stub } = startManagerWithStub()
      const frames: ServerFrame[] = []
      manager.subscribe((frame) => frames.push(frame))
      stub.emit({
        kind: "session-info",
        sessionId: "fake-session",
        model: "fake-model-a",
        permissionMode: "default",
        slashCommands: [],
        terminalSlashCommands: [],
        skillNames: [],
        agentNames: [],
      })
      stub.emit(confirmed("fake-model-a"))
      stub.emit({ kind: "model-changed", model: "fake-model-b" })
      stub.emit(confirmed("fake-model-a"))
      stub.emit(confirmed("fake-model-b"))
      stub.emit(confirmed("fake-model-b"))
      await waitForBatch()

      const hello = (() => {
        const late: ServerFrame[] = []
        manager.subscribe((frame) => late.push(frame))
        return late[0]
      })()
      expect(hello?.type === "hello" && hello.state.settingMarks.model).toMatchObject({
        kind: "confirmed",
        value: "fake-model-b",
      })
      expect(eventsOf(frames).filter((e) => e.kind === "setting-confirmed")).toEqual([
        confirmed("fake-model-a"),
        confirmed("fake-model-a"),
        confirmed("fake-model-b"),
      ])
    })
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
    stub.emitRestored(knownRestored(RESTORED_REPLAY))
    await waitForBatch()

    expect(frames.slice(before)).toEqual([
      {
        type: "hello",
        protocolVersion: PROTOCOL_VERSION,
        state: applyRestoredEvents(stateBeforeReplay, knownRestored(RESTORED_REPLAY), 1_000),
      },
    ])
  })

  it("起こし直しの間に届いた再生は、起き上がったあとの hello 1枚に入る", async () => {
    const releases: (() => void)[] = []
    const manager = createSessionManager({
      launchSession: (onEvent, onRestoredEvents, request) => {
        const stub = createStubDriver()
        stub.attach(onEvent)
        if (request.chat === true) {
          onRestoredEvents(knownRestored(RESTORED_REPLAY))
        }
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
    expect(hello?.type === "hello" && hello.state.records).toEqual(
      applyRestoredEvents(INITIAL_SESSION_STATE, knownRestored(RESTORED_REPLAY), 1_000).records,
    )
  })

  it("起こし直したあと、閉じた代の onEvent は false を返し、いまの代の onEvent は true を返す", async () => {
    const sinks: ((event: SessionEvent) => boolean)[] = []
    const manager = createSessionManager({
      launchSession: (onEvent) => {
        sinks.push(onEvent)
        return Promise.resolve(createStubDriver().driver)
      },
    })

    expect(await manager.commands.session.setChatMode({ chat: true })).toEqual({ ok: true })

    const ended = { kind: "session-ended", reason: "架空の終了" } satisfies SessionEvent
    const [closedGeneration, currentGeneration] = sinks
    expect(closedGeneration?.(ended)).toBe(false)
    expect(currentGeneration?.(ended)).toBe(true)
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

  describe("モードを戻したときの続き", () => {
    /** 起こした駆動ごとに、渡された要求と、そのセッションの ID を名乗らせる口を持つ。 */
    function startManagerRecordingLaunches() {
      const launches: { readonly request: SessionLaunchRequest; readonly stub: StubDriver }[] = []
      const manager = createSessionManager({
        launchSession: (onEvent, _onRestoredEvents, request) => {
          const stub = createStubDriver()
          stub.attach(onEvent)
          launches.push({ request, stub })
          return Promise.resolve(stub.driver)
        },
      })
      // 本物の駆動が起きたときに流す2つ（モードと、名乗るセッション）を代わりに流す。
      const identify = (index: number, sessionId: string): void => {
        launches[index]?.stub.emit({
          kind: "chat-mode-changed",
          chat: launches[index].request.chat === true,
        })
        launches[index]?.stub.emit({
          kind: "session-info",
          sessionId,
          model: undefined,
          permissionMode: undefined,
          slashCommands: [],
          terminalSlashCommands: [],
          skillNames: [],
          agentNames: [],
        })
      }
      return { manager, launches, identify }
    }

    it("仕事 → 雑談 → 仕事で、2回目の仕事は最初の仕事のセッションの続きになる", async () => {
      const { manager, launches, identify } = startManagerRecordingLaunches()
      identify(0, "架空の仕事")

      await manager.commands.session.setChatMode({ chat: true })
      expect(launches[1]?.request.resume).toEqual({ by: "new" })
      identify(1, "架空の雑談")
      await manager.commands.session.setChatMode({ chat: false })

      expect(launches[2]?.request).toEqual({
        selection: { by: "current" },
        chat: false,
        resume: { by: "id", sessionId: "架空の仕事" },
      })
    })

    it("雑談 → 仕事 → 雑談でも、直前の雑談の続きになる", async () => {
      const { manager, launches, identify } = startManagerRecordingLaunches()
      identify(0, "架空の仕事")
      await manager.commands.session.setChatMode({ chat: true })
      identify(1, "架空の雑談")
      await manager.commands.session.setChatMode({ chat: false })
      identify(2, "架空の仕事の続き")

      await manager.commands.session.setChatMode({ chat: true })

      expect(launches[3]?.request.resume).toEqual({ by: "id", sessionId: "架空の雑談" })
    })

    it("キャラクターの切り替えは新規のままで、別のパックでは覚えたセッションを使わない", async () => {
      const { manager, launches, identify } = startManagerRecordingLaunches()
      identify(0, "架空の仕事")
      await manager.commands.session.setChatMode({ chat: true })
      identify(1, "架空の雑談")

      await manager.commands.session.switchCharacter({ name: "fictional" })
      expect(launches[2]?.request.resume).toEqual({ by: "new" })

      // 仕事(パックA) → 雑談 → 切り替え(パックB) → 仕事: Aの仕事は戻さない
      identify(2, "架空の別の雑談")
      await manager.commands.session.setChatMode({ chat: false })
      expect(launches[3]?.request.resume).toEqual({ by: "new" })
    })

    it("パックを切り替えたあとは、そのパックで覚え直した雑談の続きになる", async () => {
      const { manager, launches, identify } = startManagerRecordingLaunches()
      identify(0, "架空の仕事")
      await manager.commands.session.switchCharacter({ name: "fictional" })
      identify(1, "架空の別パックの仕事")
      await manager.commands.session.setChatMode({ chat: true })
      identify(2, "架空の別パックの雑談")

      await manager.commands.session.setChatMode({ chat: false })

      expect(launches[3]?.request.resume).toEqual({
        by: "id",
        sessionId: "架空の別パックの仕事",
      })
    })
  })

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

  describe("定着", () => {
    function startChatManagerWithStub(
      overrides: Partial<
        Pick<SessionManagerOptions, "chatArchive" | "chatConsolidation" | "diagnosticLog">
      > = {},
    ) {
      const stub = createStubDriver()
      const manager = createSessionManager({
        ...overrides,
        launchSession: (onEvent) => {
          stub.attach(onEvent)
          return Promise.resolve(stub.driver)
        },
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

    function startWithDiagnostics() {
      const entries: DiagnosticEntry[] = []
      const consolidation = createManualConsolidation()
      const { stub } = startChatManagerWithStub({
        chatConsolidation: consolidation.source,
        diagnosticLog: {
          append: (appended) => entries.push(...appended),
          readRange: () => [],
        },
      })
      stub.emit(CHARACTER_EVENT)
      return { stub, consolidation, entries }
    }

    async function startInChat() {
      const consolidation = createManualConsolidation()
      const started = startChatManagerWithStub({ chatConsolidation: consolidation.source })
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

      consolidation.finish({
        kind: "written",
        topics: ["架空の話題"],
        droppedLines: 0,
        shrinkWaived: false,
      })
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
      consolidation.finish({ kind: "failed", reason: "aborted" })
      await waitForBatch()
      expect(topicEvents(frames)).toEqual([])

      stub.emit(TURN_FINISHED)
      expect(consolidation.calls).toHaveLength(2)
      expect(consolidation.calls[1]?.signal.aborted).toBe(false)

      manager.close()
      expect(consolidation.calls[1]?.signal.aborted).toBe(true)
    })

    it("失敗は、理由の語と error.name・code の1行を診断ログへ書く（message は入らない）", async () => {
      const { stub, consolidation, entries } = startWithDiagnostics()

      stub.emit(TURN_FINISHED)
      consolidation.finish({
        kind: "failed",
        reason: "threw",
        error: Object.assign(new Error("架空の失敗文"), { name: "TypeError", code: "EACCES" }),
      })
      await waitForBatch()
      stub.emit(TURN_FINISHED)
      consolidation.finish({ kind: "failed", reason: "summary-write" })
      await waitForBatch()

      expect(entries.filter((entry) => entry.flow === "swallowed-failure")).toEqual([
        {
          flow: "swallowed-failure",
          at: 1_000,
          place: { feature: "chat", place: "consolidation-threw" },
          errorName: "TypeError",
          errorCode: "EACCES",
        },
        {
          flow: "swallowed-failure",
          at: 1_000,
          place: { feature: "chat", place: "consolidation-summary-write" },
          errorName: "other",
          errorCode: "none",
        },
      ])
      expect(JSON.stringify(entries)).not.toContain("架空の失敗文")
    })

    it("あらすじの古い行を落として書けたときだけ、落とした行数を診断ログへ書く", async () => {
      const { stub, consolidation, entries } = startWithDiagnostics()

      stub.emit(TURN_FINISHED)
      consolidation.finish({ kind: "written", topics: [], droppedLines: 0, shrinkWaived: false })
      await waitForBatch()
      stub.emit(TURN_FINISHED)
      consolidation.finish({ kind: "written", topics: [], droppedLines: 3, shrinkWaived: false })
      await waitForBatch()

      expect(entries.filter((entry) => entry.flow === "synopsis-trim")).toEqual([
        { flow: "synopsis-trim", at: 1_000, droppedLines: 3 },
      ])
    })

    it("検査に落ちた理由と、縮みの検査を外して書いたことを、場所の語で診断ログへ書く（本文は入らない）", async () => {
      const { stub, consolidation, entries } = startWithDiagnostics()

      const rejections = [
        "shape",
        "synopsis-empty",
        "synopsis-too-long",
        "synopsis-reserved-tag",
        "synopsis-shrunk",
      ] as const
      for (const rejection of rejections) {
        stub.emit(TURN_FINISHED)
        consolidation.finish({ kind: "failed", reason: "unreadable-result", rejection })
        await waitForBatch()
      }
      stub.emit(TURN_FINISHED)
      consolidation.finish({
        kind: "written",
        topics: ["架空の話題"],
        droppedLines: 0,
        shrinkWaived: true,
      })
      await waitForBatch()

      expect(
        entries
          .filter((entry) => entry.flow === "swallowed-failure")
          .map((entry) => entry.place.place),
      ).toEqual([
        "consolidation-unreadable-result",
        "consolidation-synopsis-empty",
        "consolidation-synopsis-too-long",
        "consolidation-synopsis-reserved-tag",
        "consolidation-synopsis-shrunk",
        "consolidation-synopsis-shrink-waived",
      ])
      expect(JSON.stringify(entries)).not.toContain("架空の話題")
    })

    it("定着の口が拒否しても、失敗として記録して次のターンの終わりでまた起こす", async () => {
      const entries: DiagnosticEntry[] = []
      const calls: string[] = []
      const source: ChatConsolidationSource = {
        kind: "consolidate",
        consolidate: (packName) => {
          calls.push(packName)
          return Promise.reject(new TypeError("架空の失敗文"))
        },
      }
      const { stub } = startChatManagerWithStub({
        chatConsolidation: source,
        diagnosticLog: {
          append: (appended) => entries.push(...appended),
          readRange: () => [],
        },
      })
      stub.emit(CHARACTER_EVENT)

      stub.emit(TURN_FINISHED)
      await waitForBatch()
      stub.emit(TURN_FINISHED)
      await waitForBatch()

      expect(calls).toEqual(["fictional", "fictional"])
      expect(entries.filter((entry) => entry.flow === "swallowed-failure")).toMatchObject([
        { place: { feature: "chat", place: "consolidation-threw" }, errorName: "TypeError" },
        { place: { feature: "chat", place: "consolidation-threw" }, errorName: "TypeError" },
      ])
      expect(JSON.stringify(entries)).not.toContain("架空の失敗文")
    })

    it("書けた時点で別のパックに替わっていれば、見出しを流さない", async () => {
      const { stub, consolidation, frames } = await startInChat()

      stub.emit(TURN_FINISHED)
      stub.emit(characterChangedEvent({ pack: "another-fictional" }))
      consolidation.finish({
        kind: "written",
        topics: ["架空の話題"],
        droppedLines: 0,
        shrinkWaived: false,
      })
      await waitForBatch()

      expect(topicEvents(frames)).toEqual([])
    })

    it("仕事のターンの終わりにも起こし、書けても話題の見出しは流さない", async () => {
      const consolidation = createManualConsolidation()
      const { manager, stub } = startChatManagerWithStub({
        chatConsolidation: consolidation.source,
      })
      const frames: ServerFrame[] = []
      manager.subscribe((frame) => frames.push(frame))
      await waitForBatch()
      stub.emit(CHARACTER_EVENT)
      stub.emit(TURN_FINISHED)

      expect(consolidation.calls.map((call) => call.packName)).toEqual(["fictional"])

      consolidation.finish({
        kind: "written",
        topics: ["架空の話題"],
        droppedLines: 0,
        shrinkWaived: false,
      })
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

  describe("会話のアーカイブ", () => {
    // `chatArchive` の実装（ファイルI/O）は adapter のテストが持つ。ここで見るのは
    // 「いつ・何を渡すか」（`session-manager.receive` の分岐）だけ
    // （docs/architecture/chat-mode.md「会話のアーカイブ」）。

    /** `report` の `SessionEvent`（結論だけ差し替えられる。中身はすべて手で書いた架空のもの）。 */
    function reportWithConclusion(conclusion: string): SessionEvent {
      return reportEvent({
        toolUseId: "toolu_r1",
        conclusion,
        sections: [
          {
            heading: "",
            blocks: [{ kind: "text", text: "本文はここに出ない", fold: "", aside: "" }],
          },
        ],
        favor: "本文はここに出ない",
        checks: [
          {
            status: "ok",
            label: "本文はここに出ない",
            figure: "",
            command: "",
            detail: "",
            howToVerify: "",
          },
        ],
      })
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
        chatArchive,
        launchSession: (onEvent, onRestoredEvents) => {
          stub.attach(onEvent)
          stub.attachRestored(onRestoredEvents)
          return Promise.resolve(stub.driver)
        },
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

    it("そのターンで最後に届いた report の結論が、turn-finished で1行になる", async () => {
      const { stub, archiveCalls } = startArchiveManagerWithStub()
      await waitForBatch()

      stub.emit(CHARACTER_EVENT)
      stub.emit(reportWithConclusion("途中の結論"))
      stub.emit(reportWithConclusion("最後の結論"))
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

    it("report 無しで終わったターンは、結論を何も足さない", async () => {
      const { stub, archiveCalls } = startArchiveManagerWithStub()
      await waitForBatch()

      stub.emit(CHARACTER_EVENT)
      stub.emit({ kind: "turn-finished", outcome: { kind: "completed" } })
      await waitForBatch()

      expect(archiveCalls).toEqual([])
    })
  })

  describe("変更の札", () => {
    it("report は数を待たずに配られ、数は report-change-summary であとから届いて記録に畳まれる", async () => {
      const stub = createStubDriver()
      let resolveNumstat: (output: NumstatOutput) => void = () => {}
      const manager = createSessionManager({
        launchSession: (onEvent) => {
          stub.attach(onEvent)
          return Promise.resolve(stub.driver)
        },
        changeCountGit: {
          readHead: () => Promise.resolve({ kind: "known", sha: "aaaa111" }),
          diffNumstatSince: () =>
            new Promise((resolve) => {
              resolveNumstat = resolve
            }),
          commitsSince: () => Promise.resolve({ kind: "output", commits: [] }),
          numstatOfCommit: () => Promise.resolve({ kind: "unavailable" }),
        },
      })
      const frames: ServerFrame[] = []
      manager.subscribe((frame) => frames.push(frame))
      const deliveredKinds = (): readonly string[] =>
        frames.flatMap((frame) =>
          frame.type === "events" ? frame.events.map(({ event }) => event.kind) : [],
        )

      stub.emit({ kind: "request", text: "架空の依頼", images: [] })
      stub.emit(
        reportEvent({
          toolUseId: "fictional-task-report",
          task: {
            kind: "task",
            id: "t-001",
            name: "架空の作業",
            outcome: "finished",
            genre: "work",
          },
        }),
      )
      await waitForBatch()

      expect(deliveredKinds()).toEqual(["request", "report"])

      resolveNumstat({ kind: "output", text: "3\t1\tsrc/a.ts\n" })
      await waitForBatch()

      expect(deliveredKinds()).toEqual(["request", "report", "report-change-summary"])
      expect(manager.commandSession.state().records.at(-1)).toMatchObject({
        kind: "report",
        changeSummary: { kind: "counted", files: 1, added: 3, removed: 1, mixed: false },
      })
    })
  })
})
