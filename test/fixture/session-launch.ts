import type { CharacterSelection } from "../../src/server/character-pack/core/character-selection.ts"
import type { SessionLaunchPorts } from "../../src/server/session/core/session-launch.ts"
import type { DiagnosticEntry } from "../../src/shared/diagnostic/diagnostic-record.ts"
import { BUILTIN_SESSION_DEFAULT } from "../../src/shared/session/session-default.ts"
import type { RestoredEvent, SessionEvent } from "../../src/shared/session/session-event.ts"
import { characterChangedEvent, characterPackEntry, shownPortraits } from "./character.ts"
import { knownRestored } from "./restored-event.ts"
import { createStubDriver, type StubDriver } from "./session-driver.ts"
import { ITEMS_EVENT } from "./session-event.ts"

// 本物の claude は起こさない（駆動は下の偽物）。
export type Pack = { readonly name: string }

const INITIAL: Pack = { name: "tsukumo-spirit" }
const SWITCHED: Pack = { name: "kagami" }

// 切り替え先の一覧（目印・最終更新時刻・見出し）。
export const CHOICES = [
  {
    viewPort: 7328,
    sessionId: "other-session",
    lastModified: 2_000,
    startedAt: 1_500,
    heading: "架空の見出しその1",
    worktree: "fictional-tree",
    inCurrentWorktree: true,
  },
  {
    viewPort: 7327,
    sessionId: "prev-work-session",
    lastModified: 1_000,
    startedAt: 500,
    heading: "架空の見出しその2",
    worktree: "fictional-tree",
    inCurrentWorktree: true,
  },
] as const

/** 切り替え画面から前の仕事のセッションを選んだときの決め方。 */
export const PREVIOUS_WORK = { by: "id", sessionId: "prev-work-session" } as const

export const CHAT_TOPICS = ["架空の話題その1", "架空の話題その2"] as const

export const REMEMBERED_LINES = ["架空の覚えたことその1"] as const

type Harness = {
  readonly ports: SessionLaunchPorts<Pack>
  /** 駆動から新しく届いたイベントと、復元の再生の両方を時系列に混ぜたもの。 */
  readonly events: SessionEvent[]
  /** `onEvent` を通ったイベントだけ（復元の再生は入らない）。 */
  readonly driverEvents: SessionEvent[]
  /** `onRestoredEvents` を通ったイベントだけ（駆動から新しく届いたものは入らない）。 */
  readonly restoredEvents: SessionEvent[]
  /** `onRestoredEvents` が呼ばれるたびに受け取った並び。 */
  readonly restoredDeliveries: (readonly SessionEvent[])[]
  readonly calls: string[]
  /** 診断ログへ積まれた足跡。 */
  readonly diagnosticEntries: DiagnosticEntry[]
  readonly stub: StubDriver
  readonly receive: (event: SessionEvent) => boolean
  readonly receiveRestored: (events: readonly RestoredEvent[]) => void
}

export function createHarness(overrides: Partial<SessionLaunchPorts<Pack>> = {}): Harness {
  const events: SessionEvent[] = []
  const driverEvents: SessionEvent[] = []
  const restoredEvents: SessionEvent[] = []
  const restoredDeliveries: (readonly SessionEvent[])[] = []
  const calls: string[] = []
  const diagnosticEntries: DiagnosticEntry[] = []
  const stub = createStubDriver()

  const ports: SessionLaunchPorts<Pack> = {
    diagnosticLog: {
      append: (appended) => diagnosticEntries.push(...appended),
      readRange: () => [],
    },
    now: () => 1_000,
    choosePack: (selection) => {
      calls.push(`choosePack:${labelOf(selection)}`)
      return selection.by === "name" ? SWITCHED : INITIAL
    },
    rememberPack: (pack) => calls.push(`rememberPack:${pack.name}`),
    readSessionDefault: () => {
      calls.push("readSessionDefault")
      return BUILTIN_SESSION_DEFAULT
    },
    itemsEvent: () => ITEMS_EVENT,
    characterEvent: (pack: Pack) =>
      characterChangedEvent(
        {
          pack: pack.name,
          name: pack.name,
          editable: false,
          ...shownPortraits({ default: `/character/${pack.name}.png` }),
        },
        [characterPackEntry(pack.name, pack.name, { inUse: true })],
      ),
    readChatTopics: (pack) => {
      calls.push(`readChatTopics:${pack.name}`)
      return CHAT_TOPICS
    },
    readRememberedLines: (pack) => {
      calls.push(`readRememberedLines:${pack.name}`)
      return REMEMBERED_LINES
    },
    listSessions: (pack, chat) => {
      calls.push(`listSessions:${pack.name}:${modeOf(chat)}`)
      return Promise.resolve(CHOICES)
    },
    startDriver: (seed) => {
      const resumeId = seed.start.kind === "resume" ? seed.start.sessionId : ""
      calls.push(`startDriver:${seed.pack.name}:${modeOf(seed.chat)}:${resumeId}`)
      return stub.driver
    },
    refreshSessions: () => {
      calls.push("refreshSessions")
      // 読み直しが終わらないまま（読み直したあとの一覧は、それを見るテストだけが差し替えて流す）。
      return new Promise(() => {})
    },
    restoreEvents: (sessionId) => {
      calls.push(`restoreEvents:${sessionId}`)
      return Promise.resolve(knownRestored([{ kind: "utterance", text: "架空のターンの本文" }]))
    },
    ...overrides,
  }

  return {
    ports,
    events,
    driverEvents,
    restoredEvents,
    restoredDeliveries,
    calls,
    diagnosticEntries,
    stub,
    receive: (event) => {
      events.push(event)
      driverEvents.push(event)
      return true
    },
    receiveRestored: (delivered) => {
      const bare = delivered.map(({ event }) => event)
      events.push(...bare)
      restoredEvents.push(...bare)
      restoredDeliveries.push(bare)
    },
  }
}

/** 呼ばれ方の記録に混ぜる、そのときのモード。 */
export function modeOf(chat: boolean): string {
  return chat ? "chat" : "work"
}

/** 投げっぱなしの再生（`void`）が流れ終わるのを待つ。 */
export function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/** 呼ばれ方の記録に混ぜる、そのときのパックの決め方。 */
function labelOf(selection: CharacterSelection): string {
  return selection.by === "name" ? `name:${selection.name}` : selection.by
}
