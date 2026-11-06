import { describe, expect, it } from "vitest"

import { parseTaskId } from "../../../src/shared/session-driver/task-id.ts"

describe("parseTaskId", () => {
  it("空でない文字列を通し、空・文字列でない値は通さない", () => {
    expect(parseTaskId("bmf4k2x9a")).toBe("bmf4k2x9a")
    expect(parseTaskId("")).toBeUndefined()
    expect(parseTaskId(JSON.parse("null"))).toBeUndefined()
    expect(parseTaskId(undefined)).toBeUndefined()
    expect(parseTaskId(1)).toBeUndefined()
  })
})
