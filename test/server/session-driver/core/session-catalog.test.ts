import { describe, expect, it } from "vitest"

import { createSessionCatalog } from "../../../../src/server/session-driver/core/session-catalog.ts"
import { sessionTag } from "../../../../src/server/session-driver/core/session-restore.ts"
import { DEFAULT_VIEW_PORT } from "../../../../src/server/view-server/core/port-resolution.ts"

const TAG = sessionTag("架空のパック", false, DEFAULT_VIEW_PORT)
const CHAT_TAG = sessionTag("架空のパック", true, DEFAULT_VIEW_PORT)

function sessionInfo(sessionId: string, lastModified: number, tag: string): unknown {
  return { sessionId, lastModified, tag, summary: `架空の見出し ${sessionId}` }
}

/** 読むたびに、渡した順に結果を返す偽の `listSessions`。読んだ回数も数える。 */
function scriptedRead(results: readonly (() => Promise<unknown>)[]): {
  readonly read: () => Promise<unknown>
  readonly count: () => number
} {
  let count = 0
  return {
    read: () => {
      const next = results[count] ?? results.at(-1)
      count += 1
      return next === undefined ? Promise.resolve([]) : next()
    },
    count: () => count,
  }
}

describe("createSessionCatalog", () => {
  it("作ったときに1回だけ読み、続きの選択と切り替え先の一覧では読み直さない", async () => {
    const reads = scriptedRead([
      () =>
        Promise.resolve([sessionInfo("s-work", 200, TAG), sessionInfo("s-chat", 100, CHAT_TAG)]),
    ])
    const catalog = createSessionCatalog({ read: reads.read, now: () => 1_000 })

    expect(await catalog.findToResume(TAG)).toBe("s-work")
    expect(await catalog.findToResume(CHAT_TAG)).toBe("s-chat")
    expect((await catalog.listChoices(TAG)).map((choice) => choice.sessionId)).toEqual(["s-work"])
    expect(reads.count()).toBe(1)
  })

  it("印を付けたセッションは、読み直す前から続きとして選ばれ、切り替え先の一覧にも並ぶ", async () => {
    const reads = scriptedRead([() => Promise.resolve([sessionInfo("s-old", 200, TAG)])])
    const catalog = createSessionCatalog({ read: reads.read, now: () => 1_000 })
    await catalog.findToResume(TAG)

    catalog.noteMarked("s-new", TAG)

    expect(await catalog.findToResume(TAG)).toBe("s-new")
    expect((await catalog.listChoices(TAG)).map((choice) => choice.sessionId)).toEqual([
      "s-new",
      "s-old",
    ])
    expect(reads.count()).toBe(1)
  })

  it("古いセッションに印を付け直すと、そちらが最新として続きに選ばれる", async () => {
    const reads = scriptedRead([
      () => Promise.resolve([sessionInfo("s-a", 100, TAG), sessionInfo("s-b", 200, TAG)]),
    ])
    const catalog = createSessionCatalog({ read: reads.read, now: () => 1_000 })

    catalog.noteMarked("s-a", TAG)

    expect(await catalog.findToResume(TAG)).toBe("s-a")
  })

  it("読み直すと見出しや新しいセッションが入れ替わり、読み直しの間に付けた印も残る", async () => {
    const second = Promise.withResolvers<unknown>()
    const reads = scriptedRead([
      () => Promise.resolve([sessionInfo("s-old", 200, TAG)]),
      () => second.promise,
    ])
    let now = 1_000
    const catalog = createSessionCatalog({ read: reads.read, now: () => now })
    await catalog.findToResume(TAG)

    const refreshing = catalog.refresh()
    now = 2_000
    catalog.noteMarked("s-marked", TAG)
    // 読み直した一覧には、読み始めたあとに付いた印がまだ入っていない。
    second.resolve([sessionInfo("s-old", 200, TAG), sessionInfo("s-outside", 300, TAG)])
    await refreshing

    expect((await catalog.listChoices(TAG)).map((choice) => choice.sessionId)).toEqual([
      "s-marked",
      "s-outside",
      "s-old",
    ])
  })

  it("読み直せなかったときは、持っている一覧のまま", async () => {
    const reads = scriptedRead([
      () => Promise.resolve([sessionInfo("s-work", 200, TAG)]),
      () => Promise.reject(new Error("架空の読み取り失敗")),
    ])
    const catalog = createSessionCatalog({ read: reads.read, now: () => 1_000 })

    expect(await catalog.refresh()).toBe("kept")
    expect(await catalog.findToResume(TAG)).toBe("s-work")
  })

  it("後から始めた読み直しが先に終わったら、遅れて終わった古い読み直しは採らない", async () => {
    const slow = Promise.withResolvers<unknown>()
    const reads = scriptedRead([
      () => Promise.resolve([]),
      () => slow.promise,
      () => Promise.resolve([sessionInfo("s-fresh", 300, TAG)]),
    ])
    const catalog = createSessionCatalog({ read: reads.read, now: () => 1_000 })

    const older = catalog.refresh()
    expect(await catalog.refresh()).toBe("refreshed")
    slow.resolve([sessionInfo("s-stale", 100, TAG)])
    expect(await older).toBe("kept")

    expect(await catalog.findToResume(TAG)).toBe("s-fresh")
  })

  it("最初に読めなかったときは、続きが無い（新規に起こす）", async () => {
    const reads = scriptedRead([() => Promise.reject(new Error("架空の読み取り失敗"))])
    const catalog = createSessionCatalog({ read: reads.read, now: () => 1_000 })

    expect(await catalog.findToResume(TAG)).toBeUndefined()
    expect(await catalog.listChoices(TAG)).toEqual([])
  })
})
