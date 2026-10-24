import { describe, expect, it } from "vitest"

import type { WrittenReactions } from "../../../src/shared/recommendation/reaction.ts"
import { diffTaskSummary } from "../../../src/shared/repository/task-summary-change.ts"
import type { TaskSummaryItem } from "../../../src/shared/repository/task-summary.ts"
import type { SessionEvent } from "../../../src/shared/session/session-event.ts"
import { applySessionEvent } from "../../../src/shared/session/session-fold.ts"
import { INITIAL_SESSION_STATE } from "../../../src/shared/session/session-state.ts"
import { characterChangedEvent, characterInfo, shownPortraits } from "../../fixture/character.ts"
import { apply, runningSession, sessionIdOf } from "../../fixture/session-state.ts"

/** 架空のキャラクターパックが決まったところ。 */
const CHARACTER_FIXTURE: SessionEvent = characterChangedEvent()

const WRITTEN_REACTIONS = {
  retrying: { text: "架空の再試行", expression: "default" },
  failed: { text: "架空の失敗", expression: "default" },
  limited: { text: "架空の上限", expression: "default" },
  idle: { text: "架空の待ち", expression: "default" },
} as const satisfies WrittenReactions

describe("applySessionEvent", () => {
  it("conversation-cleared で吹き出しと記録を空にする（/clear。キャラクターとセッション情報は残す）", () => {
    const before = apply(
      CHARACTER_FIXTURE,
      {
        kind: "session-info",
        sessionId: "session-dummy",
        model: "claude-opus-5",
        permissionMode: "auto",
        slashCommands: ["clear"],
        terminalSlashCommands: [],
        skillNames: [],
        agentNames: [],
      },
      {
        kind: "welcome-greeting-changed",
        state: {
          kind: "written",
          greeting: {
            withCard: "架空の挨拶 {札}",
            withoutCard: "架空の挨拶",
            expression: "proud",
          },
        },
      },
      { kind: "reactions-written", reactions: WRITTEN_REACTIONS },
      { kind: "request", text: "架空の依頼", images: [] },
      { kind: "speech", text: "架空のセリフ", expression: "proud" },
      { kind: "utterance", text: "架空のレポート" },
      { kind: "request", text: "/clear", images: [] },
    )
    // "/clear" 自体も request なので、この時点で吹き出しはすでに空（record は残る）。
    expect(before.speeches).toEqual([])
    expect(before.records.length).toBeGreaterThan(0)
    expect(before.welcomeGreeting.kind).toBe("written")

    const cleared = applySessionEvent(before, { kind: "conversation-cleared" }, 0)

    expect(cleared.speeches).toEqual([])
    expect(cleared.speechExpression).toBe("default")
    expect(cleared.speechCalledInTurn).toBe(false)
    expect(cleared.records).toEqual([])
    expect(cleared.partialUtterance).toBe("")
    // 古い挨拶を出さない（すぐ後にサーバから新しい代の `writing` が届く）。
    expect(cleared.welcomeGreeting).toEqual({ kind: "none" })
    // 反応の行は代につき1回だけ書くので、`/clear` では消さない。
    expect(cleared.writtenReactions).toEqual({ kind: "written", reactions: WRITTEN_REACTIONS })
    // 画面が壊れないように、キャラクターとセッション情報は残す。
    expect(cleared.character).toEqual(before.character)
    expect(cleared.characterPacks).toEqual(before.characterPacks)
    expect(runningSession(cleared).sessionId).toBe("session-dummy")
    expect(cleared.model).toBe("claude-opus-5")
    expect(runningSession(cleared).permissionMode).toBe("auto")
    expect(cleared.slashCommands).toEqual(["clear"])
  })

  it("tasks-changed で .tw/tasks.json の一覧を持ち、届くまでは読み込み中", () => {
    expect(INITIAL_SESSION_STATE.tasks).toEqual({ kind: "loading" })

    const items: readonly TaskSummaryItem[] = [
      {
        id: "X-001",
        summary: "架空のタスク",
        status: { kind: "known", status: "todo" },
        dependencies: [],
        waitingFor: [],
        labels: [],
        difficulty: undefined,
        loopable: undefined,
        body: "",
        location: { kind: "none" },
      },
    ]
    const known = { kind: "known", items, omittedClosedCount: 0 } as const
    const withTasks = apply({
      kind: "tasks-changed",
      tasks: diffTaskSummary(INITIAL_SESSION_STATE.tasks, known),
    })
    expect(withTasks.tasks).toEqual(known)

    const cleared = applySessionEvent(
      withTasks,
      { kind: "tasks-changed", tasks: { kind: "unknown" } },
      0,
    )
    expect(cleared.tasks).toEqual({ kind: "unknown" })
  })

  it("sessions-changed で切り替え先の一覧を持ち、届くまでは空", () => {
    expect(INITIAL_SESSION_STATE.sessions).toEqual([])

    const sessions = [
      {
        viewPort: 7328,
        sessionId: "s-架空-2",
        lastModified: 2_000,
        startedAt: 1_500,
        heading: "架空の見出しその2",
        worktree: "fictional-tree",
        inCurrentWorktree: true,
      },
      {
        viewPort: 7327,
        sessionId: "s-架空-1",
        lastModified: 1_000,
        startedAt: 500,
        heading: "架空の見出しその1",
        worktree: "fictional-tree",
        inCurrentWorktree: true,
      },
    ]
    const listed = apply({ kind: "sessions-changed", sessions, current: "s-架空-1" })
    expect(listed.sessions).toEqual(sessions)
    // `init` を待たずに居場所が決まる（続きから始めたときだけ）。`model` / `permissionMode`
    // はまだなので `identified`（`sessionId` だけ）に留まる。
    expect(listed.session.kind).toBe("identified")
    expect(sessionIdOf(listed)).toBe("s-架空-1")
  })

  it("sessions-changed が running のときに来たら、sessionId だけ差し替えて permissionMode は引き継ぐ（model は session と無関係にそのまま残る）", () => {
    const withInit = apply({
      kind: "session-info",
      sessionId: "s-架空-旧",
      model: "claude-opus-5",
      permissionMode: "auto",
      slashCommands: [],
      terminalSlashCommands: [],
      skillNames: [],
      agentNames: [],
    })

    const listed = applySessionEvent(
      withInit,
      {
        kind: "sessions-changed",
        sessions: [
          {
            viewPort: 7327,
            sessionId: "s-架空-新",
            lastModified: 0,
            startedAt: 0,
            heading: "架空の見出し",
            worktree: "fictional-tree",
            inCurrentWorktree: true,
          },
        ],
        current: "s-架空-新",
      },
      0,
    )

    expect(runningSession(listed).sessionId).toBe("s-架空-新")
    expect(runningSession(listed).permissionMode).toBe("auto")
    expect(listed.model).toBe("claude-opus-5")
  })

  it("sessions-changed が新規（current なし）なら、いまのセッションのIDは変えない", () => {
    // model / permissionMode の片方だけ届いても sessionId だけの identified に畳む。
    const withId = apply({
      kind: "session-info",
      sessionId: "s-架空-init",
      model: "claude-opus-5",
      permissionMode: undefined,
      slashCommands: [],
      terminalSlashCommands: [],
      skillNames: [],
      agentNames: [],
    })
    expect(withId.session.kind).toBe("identified")

    const listed = applySessionEvent(
      withId,
      { kind: "sessions-changed", sessions: [], current: undefined },
      0,
    )
    expect(sessionIdOf(listed)).toBe("s-架空-init")
  })

  it("character-changed でキャラクターパックの姿を持ち、届くまでは undefined", () => {
    expect(INITIAL_SESSION_STATE.character).toBeUndefined()

    // 姿はそのまま持ち、イベントだけが持つ `kind` / `packs` は混ざらない。
    const character = characterInfo({
      accent: "#f2b0a0",
      expressions: [
        { name: "default", label: "通常" },
        { name: "thinking", label: "作業中" },
      ],
      ...shownPortraits({
        default: "/character/default.svg",
        thinking: "/character/thinking.svg",
      }),
    })

    const view = apply(characterChangedEvent(character))

    expect(view.character).toEqual(character)
  })
})
