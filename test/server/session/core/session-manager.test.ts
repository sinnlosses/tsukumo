import { describe, expect, it } from "vitest"

import type { NumstatOutput } from "../../../../src/server/core/change-count-git.ts"
import type { SessionLaunchRequest } from "../../../../src/server/session/core/session-launch.ts"
import { PROTOCOL_VERSION, type ServerFrame } from "../../../../src/shared/frame.ts"
import { applyRestoredEvents } from "../../../../src/shared/session/restored-event.ts"
import { UNAVAILABLE_SESSION_DIGEST } from "../../../../src/shared/session/session-digest.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"
import { INITIAL_SESSION_STATE } from "../../../../src/shared/session/session-state.ts"
import { readyContextUsage } from "../../../fixture/context-usage.ts"
import { reportEvent } from "../../../fixture/report-event.ts"
import { knownRestored } from "../../../fixture/restored-event.ts"
import {
  createStubDriver,
  FAKE_SESSION_DIGEST,
  type StubDriver,
} from "../../../fixture/session-driver.ts"
import {
  createSessionManager,
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
