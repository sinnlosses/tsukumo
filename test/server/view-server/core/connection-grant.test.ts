import { describe, expect, it } from "vitest"

import { isConnectionGranted } from "../../../../src/server/view-server/core/connection-grant.ts"

const base = {
  presentedToken: "架空のトークン",
  requestOrigin: undefined,
  startupToken: "架空のトークン",
  serverOrigin: "http://127.0.0.1:7327",
}

describe("isConnectionGranted", () => {
  it("トークンが合い、Origin が無ければ通す", () => {
    expect(isConnectionGranted(base)).toBe(true)
  })

  it("トークンが合い、Origin が自分のオリジンなら通す", () => {
    expect(isConnectionGranted({ ...base, requestOrigin: base.serverOrigin })).toBe(true)
  })

  it("トークンが無ければ断る", () => {
    expect(isConnectionGranted({ ...base, presentedToken: undefined })).toBe(false)
  })

  it("トークンが違えば断る", () => {
    expect(isConnectionGranted({ ...base, presentedToken: "別のトークン" })).toBe(false)
  })

  it("Origin が自分のオリジンでなければ、トークンが合っていても断る", () => {
    expect(isConnectionGranted({ ...base, requestOrigin: "http://evil.example" })).toBe(false)
  })
})
