import { ORPCError } from "@orpc/client"
import { describe, expect, it } from "vitest"

import { isRefusedFor } from "../../../src/browser/stores/session.ts"
import { FRAME_ERROR_REASON } from "../../../src/shared/frame.ts"

describe("isRefusedFor", () => {
  const refused = new ORPCError("REFUSED", {
    data: { reason: FRAME_ERROR_REASON.sessionOccupied },
  })

  it("同じ理由で断られたときだけ真", () => {
    expect(isRefusedFor(refused, FRAME_ERROR_REASON.sessionOccupied)).toBe(true)
    expect(isRefusedFor(refused, FRAME_ERROR_REASON.sessionEnded)).toBe(false)
    expect(isRefusedFor(new Error("REFUSED"), FRAME_ERROR_REASON.sessionOccupied)).toBe(false)
  })

  it("型に無い文言は型検査が拒む", () => {
    // @ts-expect-error 理由は CommandRefusalReason に限る
    expect(isRefusedFor(refused, "別の窓で使用中")).toBe(false)
  })
})
