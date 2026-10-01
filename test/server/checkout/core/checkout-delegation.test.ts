import { describe, expect, it } from "vitest"

import { decideCheckoutDelegation } from "../../../../src/server/checkout/core/checkout-delegation.ts"

const OWN_ROOT = "/repo/main"

describe("decideCheckoutDelegation", () => {
  it("tsukumo のリポジトリの外で打ったときは自分を起こす", () => {
    expect(decideCheckoutDelegation(OWN_ROOT, { kind: "outside" })).toEqual({ kind: "self" })
  })

  it("自分と同じチェックアウトの中で打ったときは自分を起こす（委ねた先が再び委ねない）", () => {
    expect(
      decideCheckoutDelegation(OWN_ROOT, {
        kind: "inside",
        root: OWN_ROOT,
        entry: "/repo/main/bin/tsukumo",
        entryExists: true,
      }),
    ).toEqual({ kind: "self" })
  })

  it("別のチェックアウトの中で打ったときは、そこの bin/tsukumo へ委ねる", () => {
    expect(
      decideCheckoutDelegation(OWN_ROOT, {
        kind: "inside",
        root: "/repo/wt",
        entry: "/repo/wt/bin/tsukumo",
        entryExists: true,
      }),
    ).toEqual({ kind: "delegate", entry: "/repo/wt/bin/tsukumo" })
  })

  it("別のチェックアウトに bin/tsukumo が無ければ、両方の場所を添えて止める", () => {
    const delegation = decideCheckoutDelegation(OWN_ROOT, {
      kind: "inside",
      root: "/repo/wt",
      entry: "/repo/wt/bin/tsukumo",
      entryExists: false,
    })

    expect(delegation.kind).toBe("mismatch")
    expect(delegation).toMatchObject({ message: expect.stringContaining("/repo/wt") })
    expect(delegation).toMatchObject({ message: expect.stringContaining(OWN_ROOT) })
  })
})
