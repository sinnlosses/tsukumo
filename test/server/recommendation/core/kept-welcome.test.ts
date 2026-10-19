import { describe, expect, it } from "vitest"

import {
  createWelcomeKeeper,
  type WelcomeKeeper,
  type WelcomeWritingEvent,
} from "../../../../src/server/recommendation/core/kept-welcome.ts"
import type { WrittenReactions } from "../../../../src/shared/recommendation/reaction.ts"
import type { WelcomeGreeting } from "../../../../src/shared/recommendation/welcome-greeting.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"

// すべて手で書いた架空の挨拶と反応の行。

const GREETING = {
  withCard: "架空の挨拶、{札} から",
  withoutCard: "架空の挨拶",
  expression: "default",
} as const satisfies WelcomeGreeting

const REWRITTEN = {
  withCard: "架空の書き直し、{札} から",
  withoutCard: "架空の書き直し",
  expression: "default",
} as const satisfies WelcomeGreeting

const REACTIONS = {
  retrying: { text: "架空の再試行", expression: "default" },
  failed: { text: "架空の失敗", expression: "default" },
  limited: { text: "架空の上限", expression: "default" },
  idle: { text: "架空の待ち", expression: "default" },
} as const satisfies WrittenReactions

const GREETING_WRITTEN = greetingWritten(GREETING)

const REACTIONS_WRITTEN = {
  kind: "reactions-written",
  reactions: REACTIONS,
} as const satisfies WelcomeWritingEvent

describe("createWelcomeKeeper", () => {
  it("新規の代が書けた挨拶と反応の行を、同じセッションの続きへ戻る代で書かせずに流し直す", () => {
    const keeper = createWelcomeKeeper()
    const first = keeper.noteLaunched({ kind: "new" }, ignore)
    first.emit({ kind: "welcome-greeting-changed", state: { kind: "writing" } })
    first.observe(sessionInfo("s1"))
    first.emit(GREETING_WRITTEN)
    first.emit(REACTIONS_WRITTEN)

    const back = recorded(keeper, "s1")

    expect(back.replay()).toBe(true)
    expect(back.events).toEqual([GREETING_WRITTEN, REACTIONS_WRITTEN])
  })

  it("書き手の出来事はその代の受け取り口へそのまま流す", () => {
    const received: WelcomeWritingEvent[] = []
    const launch = createWelcomeKeeper().noteLaunched({ kind: "new" }, (event) => {
      received.push(event)
    })

    launch.emit(GREETING_WRITTEN)
    launch.emit(REACTIONS_WRITTEN)

    expect(received).toEqual([GREETING_WRITTEN, REACTIONS_WRITTEN])
  })

  it("雑談へ切り替えたあとに書き終えた挨拶も、戻る代で流し直す", () => {
    const keeper = createWelcomeKeeper()
    const first = keeper.noteLaunched({ kind: "resume", sessionId: "s1" }, ignore)
    keeper.noteLaunched({ kind: "new" }, ignore)
    first.emit(GREETING_WRITTEN)

    const back = recorded(keeper, "s1")

    expect(back.replay()).toBe(true)
    expect(back.events).toEqual([GREETING_WRITTEN])
  })

  it("/clear のあとは覚えた挨拶を外し、書き直した挨拶が書けたらそれを流し直す", () => {
    const keeper = createWelcomeKeeper()
    const first = keeper.noteLaunched({ kind: "resume", sessionId: "s1" }, ignore)
    first.emit(GREETING_WRITTEN)
    first.emit(REACTIONS_WRITTEN)
    first.observe({ kind: "conversation-cleared" })

    expect(recorded(keeper, "s1").replay()).toBe(false)

    first.emit(greetingWritten(REWRITTEN))
    const back = recorded(keeper, "s1")
    back.replay()

    expect(back.events).toEqual([greetingWritten(REWRITTEN), REACTIONS_WRITTEN])
  })

  it("覚えていないセッション・新しく始める代・書けなかった挨拶では流し直さない", () => {
    const keeper = createWelcomeKeeper()
    const unwritten = keeper.noteLaunched({ kind: "resume", sessionId: "s2" }, ignore)
    unwritten.emit({ kind: "welcome-greeting-changed", state: { kind: "unwritten" } })
    unwritten.emit(REACTIONS_WRITTEN)
    keeper.noteLaunched({ kind: "resume", sessionId: "s1" }, ignore).emit(GREETING_WRITTEN)

    const restartedProcess = recorded(createWelcomeKeeper(), "s1")
    const received: WelcomeWritingEvent[] = []
    const fresh = keeper.noteLaunched({ kind: "new" }, (event) => {
      received.push(event)
    })
    const notWritten = recorded(keeper, "s2")

    expect(restartedProcess.replay()).toBe(false)
    expect(fresh.replay()).toBe(false)
    expect(notWritten.replay()).toBe(false)
    expect([...restartedProcess.events, ...received, ...notWritten.events]).toEqual([])
  })
})

/** 続きから `sessionId` へ戻る代を起こし、その代の受け取り口に流れた出来事を `events` に貯める。 */
function recorded(
  keeper: WelcomeKeeper,
  sessionId: string,
): { readonly replay: () => boolean; readonly events: readonly WelcomeWritingEvent[] } {
  const events: WelcomeWritingEvent[] = []
  const launch = keeper.noteLaunched({ kind: "resume", sessionId }, (event) => {
    events.push(event)
  })
  return { replay: launch.replay, events }
}

function greetingWritten(greeting: WelcomeGreeting): WelcomeWritingEvent {
  return { kind: "welcome-greeting-changed", state: { kind: "written", greeting } }
}

function sessionInfo(sessionId: string): SessionEvent {
  return {
    kind: "session-info",
    sessionId,
    model: undefined,
    permissionMode: undefined,
    slashCommands: [],
    terminalSlashCommands: [],
    skillNames: [],
    agentNames: [],
  }
}

function ignore(): void {
  // 受け取り口が捨てる（閉じた代）。
}
