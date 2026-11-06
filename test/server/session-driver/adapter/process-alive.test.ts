import { afterEach, describe, expect, it, vi } from "vitest"

import { isProcessAlive } from "../../../../src/server/session-driver/adapter/process-alive.ts"

function errorWithCode(code: string): Error {
  return Object.assign(new Error("架空の失敗"), { code })
}

describe("isProcessAlive", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("自分の pid は生きている", () => {
    expect(isProcessAlive(process.pid)).toBe(true)
  })

  it("存在しない pid は死んでいる", () => {
    vi.spyOn(process, "kill").mockImplementation(() => {
      throw errorWithCode("ESRCH")
    })
    expect(isProcessAlive(999_999)).toBe(false)
  })

  it("権限が無い相手（EPERM）は生きている", () => {
    vi.spyOn(process, "kill").mockImplementation(() => {
      throw errorWithCode("EPERM")
    })
    expect(isProcessAlive(1)).toBe(true)
  })

  it("コードの無い失敗は死んでいる", () => {
    vi.spyOn(process, "kill").mockImplementation(() => {
      throw new Error("架空の失敗")
    })
    expect(isProcessAlive(1)).toBe(false)
  })
})
