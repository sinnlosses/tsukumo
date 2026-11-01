import { createRouterClient } from "@orpc/server"
import { describe, expect, it } from "vitest"

import { sessionDigestProcedure } from "../../../../src/server/session/adapter/session-digest-procedure.ts"
import { UNAVAILABLE_SESSION_DIGEST } from "../../../../src/shared/session/session-digest.ts"
import { FAKE_SESSION_DIGEST } from "../../../fixture/session-driver.ts"

describe("sessionDigest の手続き", () => {
  it("セッションの ID の綴りなら口へ渡し、綴りでなければ口を呼ばずに「読めない」を返す", async () => {
    const asked: string[] = []
    const client = createRouterClient(
      sessionDigestProcedure({
        readSessionDigest: (sessionId) => {
          asked.push(sessionId)
          return Promise.resolve(FAKE_SESSION_DIGEST)
        },
      }),
    )

    expect(await client.read({ sessionId: "listed-session" })).toEqual(FAKE_SESSION_DIGEST)
    expect(await client.read({ sessionId: "../listed-session" })).toEqual(
      UNAVAILABLE_SESSION_DIGEST,
    )
    expect(asked).toEqual(["listed-session"])
  })
})
