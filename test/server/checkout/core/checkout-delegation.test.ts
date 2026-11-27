import { describe, expect, it } from "vitest"

import {
  decideCheckoutDelegation,
  worktreeRootsOf,
} from "../../../../src/server/checkout/core/checkout-delegation.ts"

const OWN_ROOT = "/repo/main"
const OWN_WORKTREE_ROOTS = [OWN_ROOT, "/repo/wt"]

describe("decideCheckoutDelegation", () => {
  it("tsukumo のリポジトリの外で打ったときは自分を起こす", () => {
    expect(decideCheckoutDelegation(OWN_ROOT, { kind: "outside" }, [])).toEqual({ kind: "self" })
  })

  it("自分と同じチェックアウトの中で打ったときは自分を起こす（委ねた先が再び委ねない）", () => {
    expect(
      decideCheckoutDelegation(
        OWN_ROOT,
        {
          kind: "inside",
          root: OWN_ROOT,
          entry: "/repo/main/bin/tsukumo",
          entryExists: true,
          ownedByUser: true,
        },
        [],
      ),
    ).toEqual({ kind: "self" })
  })

  it("自分のリポジトリに登録された、利用者の持ち物の作業ツリーの中で打ったときは、そこの bin/tsukumo へ委ねる", () => {
    expect(
      decideCheckoutDelegation(
        OWN_ROOT,
        {
          kind: "inside",
          root: "/repo/wt",
          entry: "/repo/wt/bin/tsukumo",
          entryExists: true,
          ownedByUser: true,
        },
        OWN_WORKTREE_ROOTS,
      ),
    ).toEqual({ kind: "delegate", entry: "/repo/wt/bin/tsukumo" })
  })

  it("自分のリポジトリに登録されていないチェックアウトの bin/tsukumo へは委ねず、両方の場所を添えて止める", () => {
    const delegation = decideCheckoutDelegation(
      OWN_ROOT,
      {
        kind: "inside",
        root: "/tmp/planted",
        entry: "/tmp/planted/bin/tsukumo",
        entryExists: true,
        ownedByUser: true,
      },
      OWN_WORKTREE_ROOTS,
    )

    expect(delegation.kind).toBe("mismatch")
    expect(delegation).toMatchObject({ message: expect.stringContaining("/tmp/planted") })
    expect(delegation).toMatchObject({ message: expect.stringContaining(OWN_ROOT) })
  })

  it("登録された作業ツリーでも、利用者の持ち物でなければ委ねずに止める", () => {
    const delegation = decideCheckoutDelegation(
      OWN_ROOT,
      {
        kind: "inside",
        root: "/repo/wt",
        entry: "/repo/wt/bin/tsukumo",
        entryExists: true,
        ownedByUser: false,
      },
      OWN_WORKTREE_ROOTS,
    )

    expect(delegation.kind).toBe("mismatch")
  })

  it("別のチェックアウトに bin/tsukumo が無ければ、両方の場所を添えて止める", () => {
    const delegation = decideCheckoutDelegation(
      OWN_ROOT,
      {
        kind: "inside",
        root: "/repo/wt",
        entry: "/repo/wt/bin/tsukumo",
        entryExists: false,
        ownedByUser: true,
      },
      OWN_WORKTREE_ROOTS,
    )

    expect(delegation.kind).toBe("mismatch")
    expect(delegation).toMatchObject({ message: expect.stringContaining("/repo/wt") })
    expect(delegation).toMatchObject({ message: expect.stringContaining(OWN_ROOT) })
  })
})

describe("worktreeRootsOf", () => {
  it("worktree の行だけを拾い、空白や改行を含むパスもそのまま返す", () => {
    const porcelain = [
      "worktree /repo/main",
      "HEAD 0000000000000000000000000000000000000000",
      "branch refs/heads/main",
      "",
      "worktree /repo/a b\nc",
      "HEAD 0000000000000000000000000000000000000000",
      "detached",
      "locked",
      "",
    ].join("\0")

    expect(worktreeRootsOf(porcelain)).toEqual(["/repo/main", "/repo/a b\nc"])
  })

  it("空の出力からは何も拾わない", () => {
    expect(worktreeRootsOf("")).toEqual([])
  })
})
