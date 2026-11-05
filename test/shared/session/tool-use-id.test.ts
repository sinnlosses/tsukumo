import { describe, expect, it } from "vitest"

import { parseToolUseId } from "../../../src/shared/session/tool-use-id.ts"

describe("parseToolUseId", () => {
  it("SDK の id と疑似の駆動の id を通し、空・文字列でない値は通さない", () => {
    expect(parseToolUseId("toolu_01AbCdEf")).toBe("toolu_01AbCdEf")
    expect(parseToolUseId("fake-report-call-1")).toBe("fake-report-call-1")
    expect(parseToolUseId("")).toBeUndefined()
    expect(parseToolUseId(JSON.parse("null"))).toBeUndefined()
    expect(parseToolUseId(undefined)).toBeUndefined()
    expect(parseToolUseId(1)).toBeUndefined()
  })
})
