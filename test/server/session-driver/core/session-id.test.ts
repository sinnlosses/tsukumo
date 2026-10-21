import { describe, expect, it } from "vitest"

import { parseSessionId } from "../../../../src/server/session-driver/core/session-id.ts"

describe("parseSessionId", () => {
  it("小文字の UUID の綴りだけを通す", () => {
    expect(parseSessionId("00000000-0000-4000-8000-0000000000aa")).toBe(
      "00000000-0000-4000-8000-0000000000aa",
    )
    expect(parseSessionId("00000000-0000-4000-8000-0000000000AA")).toBeUndefined()
    expect(parseSessionId("../00000000-0000-4000-8000-0000000000aa")).toBeUndefined()
    expect(parseSessionId("")).toBeUndefined()
  })
})
