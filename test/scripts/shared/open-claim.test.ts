import { describe, expect, test } from "vitest"

import { readOpenClaim } from "../../../scripts/shared/open-claim.ts"

describe("readOpenClaim", () => {
  test("claims が1件以上なら claimed", () => {
    expect(readOpenClaim('{"claims": [{"task": "sample", "stage": null, "claim": "x"}]}')).toBe(
      "claimed",
    )
  })

  test("claims が空なら none", () => {
    expect(readOpenClaim('{"claims": []}')).toBe("none")
  })

  test("JSON でない・形が違うときは unreadable", () => {
    expect(readOpenClaim("not json")).toBe("unreadable")
    expect(readOpenClaim('{"other": []}')).toBe("unreadable")
  })
})
