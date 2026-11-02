import { describe, expect, it } from "vitest"

import { createSessionDigestCache } from "../../../../../src/server/session-driver/core/session/session-digest-cache.ts"
import {
  type SessionDigest,
  UNAVAILABLE_SESSION_DIGEST,
} from "../../../../../src/shared/session/session-digest.ts"
import { checkedSessionId } from "../../../../fixture/session-id.ts"

const S1 = checkedSessionId("s-1")
const S2 = checkedSessionId("s-2")

const DIGEST: SessionDigest = {
  kind: "known",
  requestCount: 2,
  summary: "架空の要約",
  remaining: undefined,
  lastLine: "架空のセリフ",
}
const STAMP = { lastModified: 1000, fileSize: 200 }

describe("createSessionDigestCache", () => {
  it("同じ印なら覚えた中身を返す", () => {
    const cache = createSessionDigestCache()
    cache.set(S1, STAMP, DIGEST)

    expect(cache.get(S1, { ...STAMP })).toEqual(DIGEST)
  })

  it("更新時刻か大きさのどちらかが違えば返さない", () => {
    const cache = createSessionDigestCache()
    cache.set(S1, STAMP, DIGEST)

    expect(cache.get(S1, { ...STAMP, lastModified: 1001 })).toBeUndefined()
    expect(cache.get(S1, { ...STAMP, fileSize: 201 })).toBeUndefined()
  })

  it("別のセッションとは混ざらない", () => {
    const cache = createSessionDigestCache()
    cache.set(S1, STAMP, DIGEST)

    expect(cache.get(S2, STAMP)).toBeUndefined()
  })

  it("読めなかった回は覚えない", () => {
    const cache = createSessionDigestCache()
    cache.set(S1, STAMP, UNAVAILABLE_SESSION_DIGEST)

    expect(cache.get(S1, STAMP)).toBeUndefined()
  })
})
