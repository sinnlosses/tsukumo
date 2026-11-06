import { ORPCError } from "@orpc/client"
import { afterEach, describe, expect, it } from "vitest"

import { useSession } from "../../../src/browser/stores/session.ts"
import { FRAME_ERROR_REASON } from "../../../src/shared/frame-error-reason.ts"

afterEach(() => {
  useSession.getState().attachSocket(undefined)
})

describe("dispatchAwaited", () => {
  function attach(call: () => Promise<unknown>): void {
    useSession.getState().attachSocket({ commandLink: { call } })
  }

  it("成功は ok と手続きの戻り値で返る", async () => {
    attach(() => Promise.resolve({ ok: true }))

    const result = await useSession
      .getState()
      .dispatchAwaited((client) => client.session.switchSession({ sessionId: "架空" }))

    expect(result.kind).toBe("ok")
  })

  it("契約の REFUSED は invalid と理由で返り、投げない", async () => {
    attach(() =>
      Promise.reject(
        new ORPCError("REFUSED", { data: { reason: FRAME_ERROR_REASON.sessionOccupied } }),
      ),
    )

    const result = await useSession
      .getState()
      .dispatchAwaited((client) => client.session.switchSession({ sessionId: "架空" }))

    expect(result).toEqual({ kind: "invalid", reason: FRAME_ERROR_REASON.sessionOccupied })
  })

  it("繋がっていないときは failed で返り、投げない", async () => {
    const result = await useSession
      .getState()
      .dispatchAwaited((client) => client.session.switchSession({ sessionId: "架空" }))

    expect(result).toEqual({ kind: "failed" })
  })
})
