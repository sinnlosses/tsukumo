import { describe, expect, it } from "vitest"

import type { CommandSession } from "../src/server/session/core/command-session.ts"
import { FRAME_ERROR_REASON } from "../src/shared/frame.ts"
import type { SessionEvent } from "../src/shared/session/session-event.ts"
import { createCommandClient } from "./fixture/command-client.ts"
import {
  CHAT_MODE_EVENT,
  createFakeSession,
  createRecordingPorts,
  NO_DIARY_WRITER,
  REQUEST_EVENT,
  startRouter,
} from "./fixture/command-router.ts"

const TURN_FINISHED_EVENT = {
  kind: "turn-finished",
  outcome: { kind: "completed" },
} satisfies SessionEvent

describe("createSocketRouter（session）", () => {
  it("switchCharacter は画面から選ばれた名前で、いまのモードのまま、最新の続きから起こし直す", async () => {
    const { commands, restarts, observe } = startRouter()
    observe(CHAT_MODE_EVENT)

    expect(await commands.session.switchCharacter({ name: "fictional" })).toEqual({ ok: true })

    // 名前で渡すのは画面から選ばれたときだけ（＝覚える側。docs/architecture/screen-design.md「設定の置き場所」）。
    expect(restarts).toEqual([
      { selection: { by: "name", name: "fictional" }, chat: true, resume: { by: "new" } },
    ])
  })

  it("ターン進行中の session.switchCharacter は定型文の理由で受け付けず、駆動を閉じない", async () => {
    const { commands, restarts, observe } = startRouter()

    expect(await commands.session.prompt({ text: "架空の依頼", images: [] })).toEqual({
      ok: true,
    })
    observe(REQUEST_EVENT)

    expect(await commands.session.switchCharacter({ name: "fictional" })).toEqual({
      ok: false,
      reason: FRAME_ERROR_REASON.switchDuringTurn,
    })
    expect(restarts).toEqual([])

    observe(TURN_FINISHED_EVENT)

    expect(await commands.session.switchCharacter({ name: "fictional" })).toEqual({ ok: true })
    expect(restarts).toHaveLength(1)
  })

  it("session.switchSession で、選ばれたIDの続きから起こし直す（パックもモードも変えない）", async () => {
    const { commands, restarts } = startRouter()

    expect(await commands.session.switchSession({ sessionId: "架空の別セッション" })).toEqual({
      ok: true,
    })

    // 変わるのは「どの transcript の続きから始めるか」だけ。
    // パックは「いま出しているまま」（名前で渡すと覚えた値が書き換わる。docs/architecture/screen-design.md「設定の置き場所」）。
    expect(restarts).toEqual([
      {
        selection: { by: "current" },
        chat: false,
        resume: { by: "id", sessionId: "架空の別セッション" },
      },
    ])
  })

  it("別の窓が占有ファイルに書いているセッションへの session.switchSession は定型文の理由で断り、起こし直さない", async () => {
    const { commands, restarts, occupiedElsewhere, reserved, stub } = startRouter()
    occupiedElsewhere.add("架空の別の窓のセッション")

    expect(await commands.session.switchSession({ sessionId: "架空の別の窓のセッション" })).toEqual(
      { ok: false, reason: FRAME_ERROR_REASON.sessionOccupied },
    )
    expect(reserved).toEqual(["架空の別の窓のセッション"])
    expect(restarts).toEqual([])
    expect(stub.calls).toEqual([])
  })

  it("session.switchSession の起こし直しに失敗したら、占有ファイルを消す", async () => {
    const fake = createFakeSession(undefined, {
      ok: false,
      reason: FRAME_ERROR_REASON.driverFailed,
    })
    const recorded = createRecordingPorts(
      "written",
      () => Promise.resolve(undefined),
      NO_DIARY_WRITER,
    )
    const commands = createCommandClient(recorded.ports, fake.session)

    expect(await commands.session.switchSession({ sessionId: "架空の別セッション" })).toEqual({
      ok: false,
      reason: FRAME_ERROR_REASON.driverFailed,
    })
    expect(recorded.withdrawCount()).toBe(1)
  })

  it("ターン進行中の session.switchSession は定型文の理由で受け付けず、駆動を閉じない", async () => {
    const { commands, restarts, observe } = startRouter()
    observe(REQUEST_EVENT)

    expect(await commands.session.switchSession({ sessionId: "架空の別セッション" })).toEqual({
      ok: false,
      reason: FRAME_ERROR_REASON.sessionSwitchDuringTurn,
    })
    expect(restarts).toEqual([])

    observe(TURN_FINISHED_EVENT)

    expect(await commands.session.switchSession({ sessionId: "架空の別セッション" })).toEqual({
      ok: true,
    })
    expect(restarts).toHaveLength(1)
  })

  it("session.setChatMode で雑談を指定して起こし直し、いま出しているパックは保つ", async () => {
    // 雑談の切り替えは `systemPrompt` の差し替えなので、`session.switchCharacter` と同じ起こし直しに
    // なる（docs/architecture/chat-mode.md「雑談モード」）。パックは変えないことをここで見る。
    const { commands, restarts } = startRouter()

    expect(await commands.session.setChatMode({ chat: true })).toEqual({ ok: true })

    // パックは「いま出しているまま」として渡す（名前では渡さない）。名前で渡すと画面から
    // 選ばれたのと区別がつかず、モードを切り替えただけで覚えた値が書き換わる
    // （docs/architecture/screen-design.md「設定の置き場所」）。
    expect(restarts).toEqual([{ selection: { by: "current" }, chat: true, resume: { by: "new" } }])
  })

  it("雑談から仕事へ戻すときも起こし直す", async () => {
    const { commands, restarts } = startRouter()

    await commands.session.setChatMode({ chat: true })
    await commands.session.setChatMode({ chat: false })

    expect(restarts.map((request) => request.chat)).toEqual([true, false])
  })

  describe("session.setChatMode が戻す先のモードに覚えがあるとき", () => {
    /** 雑談に居て、仕事の直前のセッションを覚えている口。 */
    function rememberingWorkSession(session: CommandSession): CommandSession {
      return {
        ...session,
        state: () => ({ ...session.state(), chatMode: true }),
        modeSession: (chat) =>
          chat ? { kind: "none" } : { kind: "remembered", sessionId: "架空の仕事" },
      }
    }

    function startRouterRemembering() {
      const fake = createFakeSession()
      const recorded = createRecordingPorts(
        "written",
        () => Promise.resolve(undefined),
        NO_DIARY_WRITER,
      )
      const session = rememberingWorkSession(fake.session)
      return { ...fake, ...recorded, commands: createCommandClient(recorded.ports, session) }
    }

    it("その続きから起こす", async () => {
      const { commands, restarts, reserved } = startRouterRemembering()

      expect(await commands.session.setChatMode({ chat: false })).toEqual({ ok: true })

      expect(reserved).toEqual(["架空の仕事"])
      expect(restarts).toEqual([
        {
          selection: { by: "current" },
          chat: false,
          resume: { by: "id", sessionId: "架空の仕事" },
        },
      ])
    })

    it("使用中なら新規で起こす", async () => {
      const { commands, restarts, occupiedElsewhere } = startRouterRemembering()
      occupiedElsewhere.add("架空の仕事")

      expect(await commands.session.setChatMode({ chat: false })).toEqual({ ok: true })

      expect(restarts).toEqual([
        { selection: { by: "current" }, chat: false, resume: { by: "new" } },
      ])
    })

    it("起こし直しに失敗したら占有ファイルを消す", async () => {
      const fake = createFakeSession(undefined, {
        ok: false,
        reason: FRAME_ERROR_REASON.driverFailed,
      })
      const recorded = createRecordingPorts(
        "written",
        () => Promise.resolve(undefined),
        NO_DIARY_WRITER,
      )
      const commands = createCommandClient(recorded.ports, rememberingWorkSession(fake.session))

      await commands.session.setChatMode({ chat: false })

      expect(recorded.withdrawCount()).toBe(1)
    })
  })

  it("ターン進行中の session.setChatMode は定型文の理由で受け付けず、駆動を閉じない", async () => {
    const { commands, restarts, observe } = startRouter()

    expect(await commands.session.prompt({ text: "架空の依頼", images: [] })).toEqual({
      ok: true,
    })
    observe(REQUEST_EVENT)

    expect(await commands.session.setChatMode({ chat: true })).toEqual({
      ok: false,
      reason: FRAME_ERROR_REASON.chatModeSwitchDuringTurn,
    })
    expect(restarts).toEqual([])
  })

  describe("ターンが終わっていても委譲先が動いている間", () => {
    const BACKGROUND_TASKS_EVENT = {
      kind: "background-tasks-changed",
      tasks: [{ taskId: "t1", kind: "shell", description: "架空の背景" }],
    } satisfies SessionEvent

    it("駆動を起こし直す4つのコマンドは定型文の理由で受け付けず、駆動を閉じない", async () => {
      const { commands, restarts, observe } = startRouter()
      observe(REQUEST_EVENT)
      observe(TURN_FINISHED_EVENT)
      observe(BACKGROUND_TASKS_EVENT)

      expect(await commands.session.switchCharacter({ name: "fictional" })).toEqual({
        ok: false,
        reason: FRAME_ERROR_REASON.switchDuringTurn,
      })
      expect(await commands.session.setChatMode({ chat: true })).toEqual({
        ok: false,
        reason: FRAME_ERROR_REASON.chatModeSwitchDuringTurn,
      })
      expect(await commands.session.switchSession({ sessionId: "架空の別セッション" })).toEqual({
        ok: false,
        reason: FRAME_ERROR_REASON.sessionSwitchDuringTurn,
      })
      expect(await commands.session.startNewSession()).toEqual({
        ok: false,
        reason: FRAME_ERROR_REASON.sessionSwitchDuringTurn,
      })
      expect(restarts).toEqual([])
    })

    it("nudge は断られない（起こし直さないので、ターン中かどうかだけを見る）", async () => {
      const { commands, observe } = startRouter()
      observe(CHAT_MODE_EVENT)
      observe(REQUEST_EVENT)
      observe(TURN_FINISHED_EVENT)
      observe(BACKGROUND_TASKS_EVENT)

      expect(await commands.session.nudge()).toEqual({ ok: true })
    })
  })
})
