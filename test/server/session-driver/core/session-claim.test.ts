import { describe, expect, it } from "vitest"

import {
  createSessionClaim,
  readSessionClaimRecord,
  type SessionClaimStore,
} from "../../../../src/server/session-driver/core/session-claim.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"

/** 書いた名乗りを順に覚え、ほかの名乗りは渡した並びを返す偽の書き置き。 */
function fakeStore(others: readonly string[] = []): {
  readonly store: SessionClaimStore
  readonly written: (readonly string[])[]
} {
  const written: (readonly string[])[] = []
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
  }
}

describe("createSessionClaim", () => {
  it("続きから起こすとそのIDを名乗り、新規なら名乗らない", () => {
    const { store, written } = fakeStore()
    const claim = createSessionClaim(store)

    claim.noteLaunched({ kind: "resume", sessionId: "架空のセッションA" })
    claim.noteLaunched({ kind: "new" })

    expect(written).toEqual([["架空のセッションA"], []])
  })

  it("session-info のIDへ名乗り替え（/clear の新しいIDも）、session-ended で消す。同じ中身は書き直さない", () => {
    const { store, written } = fakeStore()
    const claim = createSessionClaim(store)
    const observe = claim.noteLaunched({ kind: "new" })

    observe(sessionInfo("架空のセッションA"))
    observe(sessionInfo("架空のセッションA"))
    observe({ kind: "turn-started" })
    observe(sessionInfo("架空のセッションB"))
    observe(ENDED)

    expect(written).toEqual([["架空のセッションA"], ["架空のセッションB"], []])
  })

  it("あとの代を起こしたあとは、前の代の session-ended・session-info が届いても名乗りを変えない", () => {
    const { store, written } = fakeStore()
    const claim = createSessionClaim(store)
    const observeOld = claim.noteLaunched({ kind: "new" })
    observeOld(sessionInfo("架空の前の代のセッション"))

    const observeNew = claim.noteLaunched({ kind: "resume", sessionId: "架空のセッションA" })
    observeOld(ENDED)
    observeOld(sessionInfo("架空の前の代のセッション"))
    expect(written.at(-1)).toEqual(["架空のセッションA"])

    observeNew(sessionInfo("架空のセッションA"))
    observeOld(ENDED)
    expect(written.at(-1)).toEqual(["架空のセッションA"])
  })

  it("予約したあと、起こし直す前の代の session-ended が届いても、予約したIDは残る", async () => {
    const { store, written } = fakeStore()
    const claim = createSessionClaim(store)
    const observeOld = claim.noteLaunched({ kind: "resume", sessionId: "架空のセッションA" })

    expect(await claim.reserve("架空のセッションB")).toBe("reserved")
    observeOld(ENDED)

    expect(written.at(-1)).toEqual(["架空のセッションB"])
  })

  it("withdraw のあとは、前の代の口に届いたイベントを捨てる", () => {
    const { store, written } = fakeStore()
    const claim = createSessionClaim(store)
    const observe = claim.noteLaunched({ kind: "new" })

    claim.withdraw()
    observe(sessionInfo("架空のセッションA"))

    expect(written).toEqual([])
  })

  it("ほかに名乗りが無ければ、いまのIDと並べて選んだIDを名乗る", async () => {
    const { store, written } = fakeStore(["架空の別のセッション"])
    const claim = createSessionClaim(store)
    claim.noteLaunched({ kind: "resume", sessionId: "架空のセッションA" })

    expect(await claim.reserve("架空のセッションB")).toBe("reserved")
    expect(written.at(-1)).toEqual(["架空のセッションA", "架空のセッションB"])
  })

  it("ほかの名乗りに同じIDがあれば occupied で、足したIDを外して書き直す", async () => {
    const { store, written } = fakeStore(["架空のセッションB"])
    const claim = createSessionClaim(store)
    claim.noteLaunched({ kind: "resume", sessionId: "架空のセッションA" })

    expect(await claim.reserve("架空のセッションB")).toBe("occupied")
    expect(written).toEqual([
      ["架空のセッションA"],
      ["架空のセッションA", "架空のセッションB"],
      ["架空のセッションA"],
    ])
  })

  it("withdraw で名乗りを消す", () => {
    const { store, written } = fakeStore()
    const claim = createSessionClaim(store)
    claim.noteLaunched({ kind: "resume", sessionId: "架空のセッションA" })

    claim.withdraw()

    expect(written.at(-1)).toEqual([])
  })
})

describe("readSessionClaimRecord", () => {
  it("pid とセッションIDの並びを読む", () => {
    expect(readSessionClaimRecord({ pid: 4242, sessionIds: ["架空のセッションA"] })).toEqual({
      pid: 4242,
      sessionIds: ["架空のセッションA"],
    })
  })

  it.each([
    ["オブジェクトでない", "4242"],
    ["pid が無い", { sessionIds: [] }],
    ["pid が正の整数でない", { pid: 0, sessionIds: [] }],
    ["pid が小数", { pid: 1.5, sessionIds: [] }],
    ["sessionIds が配列でない", { pid: 4242, sessionIds: "架空のセッションA" }],
    ["空のID", { pid: 4242, sessionIds: [""] }],
    ["長すぎるID", { pid: 4242, sessionIds: ["x".repeat(201)] }],
  ])("%s ものは読まない", (_name, value) => {
    expect(readSessionClaimRecord(value)).toBeUndefined()
  })
})
