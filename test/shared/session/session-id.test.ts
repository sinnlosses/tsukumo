import { describe, expect, it } from "vitest"

import { parseSessionId } from "../../../src/shared/session/session-id.ts"

describe("parseSessionId", () => {
  it("小文字の UUID の綴りを通し、大文字・パスを遡る綴り・空は通さない", () => {
    expect(parseSessionId("00000000-0000-4000-8000-0000000000aa")).toBe(
      "00000000-0000-4000-8000-0000000000aa",
    )
    expect(parseSessionId("00000000-0000-4000-8000-0000000000AA")).toBeUndefined()
    expect(parseSessionId("../00000000-0000-4000-8000-0000000000aa")).toBeUndefined()
    expect(parseSessionId("")).toBeUndefined()
  })

  it("疑似の駆動の ID も通す", () => {
    expect(parseSessionId("fake-session")).toBe("fake-session")
  })

  it.each([
    ["201字", "x".repeat(201)],
    [".", "session.a"],
    ["/", "session/a"],
    ["空白", "session a"],
  ])("%s を含む ID は通さない", (_name, value) => {
    expect(parseSessionId(value)).toBeUndefined()
  })
})
