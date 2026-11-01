import { describe, expect, it } from "vitest"

import {
  createSessionClaim,
  readSessionClaimRecord,
  type SessionClaimStore,
} from "../../../../src/server/session-driver/core/session-claim.ts"
import type { SessionId } from "../../../../src/server/session-driver/core/session-id.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"
import { checkedSessionId } from "../../../fixture/session-id.ts"

const SESSION_A = checkedSessionId("session-a")
const SESSION_B = checkedSessionId("session-b")
const OTHER_SESSION = checkedSessionId("other-session")

/** 書いた占有ファイルの中身を順に覚え、ほかの占有ファイルは渡した並びを返す偽の書き置き。 */
function fakeStore(others: readonly SessionId[] = []): {
  readonly store: SessionClaimStore
  readonly written: (readonly SessionId[])[]
} {
  const written: (readonly SessionId[])[] = []
  return {
    store: {
      write: (sessionIds) => {
        written.push(sessionIds)
      },
      readOthers: () => Promise.resolve(others),
    },
    written,
  }
}

const ENDED: SessionEvent = { kind: "session-ended", reason: "架空の終わり" }

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

describe("createSessionClaim", () => {
  it("続きから起こすとそのIDを書き、新規なら書かない", () => {
    const { store, written } = fakeStore()
    const claim = createSessionClaim(store)

    claim.noteLaunched({ kind: "resume", sessionId: SESSION_A })
    claim.noteLaunched({ kind: "new" })

    expect(written).toEqual([["session-a"], []])
  })

  it("session-info のIDへ書き替え（/clear の新しいIDも）、session-ended で消す。同じ中身は書き直さない", () => {
    const { store, written } = fakeStore()
    const claim = createSessionClaim(store)
    const observe = claim.noteLaunched({ kind: "new" })

    observe(sessionInfo("session-a"))
    observe(sessionInfo("session-a"))
    observe({ kind: "turn-started" })
    observe(sessionInfo("session-b"))
    observe(ENDED)

    expect(written).toEqual([["session-a"], ["session-b"], []])
  })

  it("session-info のIDがセッションの ID の綴りでなければ、占有ファイルを書き替えない", () => {
    const { store, written } = fakeStore()
    const claim = createSessionClaim(store)
    const observe = claim.noteLaunched({ kind: "resume", sessionId: SESSION_A })

    observe(sessionInfo("../session-b"))

    expect(written).toEqual([["session-a"]])
  })

  it("あとの代を起こしたあとは、前の代の session-ended・session-info が届いても占有ファイルを変えない", () => {
    const { store, written } = fakeStore()
    const claim = createSessionClaim(store)
    const observeOld = claim.noteLaunched({ kind: "new" })
    observeOld(sessionInfo("previous-launch-session"))

    const observeNew = claim.noteLaunched({ kind: "resume", sessionId: SESSION_A })
    observeOld(ENDED)
    observeOld(sessionInfo("previous-launch-session"))
    expect(written.at(-1)).toEqual(["session-a"])

    observeNew(sessionInfo("session-a"))
    observeOld(ENDED)
    expect(written.at(-1)).toEqual(["session-a"])
  })

  it("予約したあと、起こし直す前の代の session-ended が届いても、予約したIDは残る", async () => {
    const { store, written } = fakeStore()
    const claim = createSessionClaim(store)
    const observeOld = claim.noteLaunched({ kind: "resume", sessionId: SESSION_A })

    expect(await claim.reserve(SESSION_B)).toBe("reserved")
    observeOld(ENDED)

    expect(written.at(-1)).toEqual(["session-b"])
  })

  it("withdraw のあとは、前の代の口に届いたイベントを捨てる", () => {
    const { store, written } = fakeStore()
    const claim = createSessionClaim(store)
    const observe = claim.noteLaunched({ kind: "new" })

    claim.withdraw()
    observe(sessionInfo("session-a"))

    expect(written).toEqual([])
  })

  it("ほかに占有ファイルが無ければ、いまのIDと並べて選んだIDを書く", async () => {
    const { store, written } = fakeStore([OTHER_SESSION])
    const claim = createSessionClaim(store)
    claim.noteLaunched({ kind: "resume", sessionId: SESSION_A })

    expect(await claim.reserve(SESSION_B)).toBe("reserved")
    expect(written.at(-1)).toEqual(["session-a", "session-b"])
  })

  it("ほかの占有ファイルに同じIDがあれば occupied で、足したIDを外して書き直す", async () => {
    const { store, written } = fakeStore([SESSION_B])
    const claim = createSessionClaim(store)
    claim.noteLaunched({ kind: "resume", sessionId: SESSION_A })

    expect(await claim.reserve(SESSION_B)).toBe("occupied")
    expect(written).toEqual([["session-a"], ["session-a", "session-b"], ["session-a"]])
  })

  it("withdraw で占有ファイルを消す", () => {
    const { store, written } = fakeStore()
    const claim = createSessionClaim(store)
    claim.noteLaunched({ kind: "resume", sessionId: SESSION_A })

    claim.withdraw()

    expect(written.at(-1)).toEqual([])
  })
})

describe("readSessionClaimRecord", () => {
  it("pid とセッションIDの並びを読む", () => {
    expect(readSessionClaimRecord({ pid: 4242, sessionIds: ["session-a"] })).toEqual({
      pid: 4242,
      sessionIds: ["session-a"],
    })
  })

  it.each([
    ["オブジェクトでない", "4242"],
    ["pid が無い", { sessionIds: [] }],
    ["pid が正の整数でない", { pid: 0, sessionIds: [] }],
    ["pid が小数", { pid: 1.5, sessionIds: [] }],
    ["sessionIds が配列でない", { pid: 4242, sessionIds: "session-a" }],
    ["空のID", { pid: 4242, sessionIds: [""] }],
    ["長すぎるID", { pid: 4242, sessionIds: ["x".repeat(201)] }],
    ["パスに使えない字のID", { pid: 4242, sessionIds: ["../a"] }],
    ["文字列でないID", { pid: 4242, sessionIds: [42] }],
  ])("%s ものは読まない", (_name, value) => {
    expect(readSessionClaimRecord(value)).toBeUndefined()
  })
})
